/**
 * microsoft-sync.ts
 *
 * Background sync job: pulls Outlook mail, calendar events, OneDrive files,
 * and To Do tasks into tkg_signals via Microsoft Graph API.
 *
 * On first connect (last_synced_at is null), pulls the last year.
 * On subsequent runs, pulls since last_synced_at.
 *
 * Deduplication via content_hash prevents duplicate signals.
 */

import { createServerClient } from "@/lib/db/client";
import {
  getUserToken,
  updateSyncTimestamp,
  saveUserToken,
  softDisconnectAfterFatalOAuthRefresh,
} from "@/lib/auth/user-tokens";
import { isMicrosoftRefreshFatalError } from "@/lib/auth/oauth-refresh-fatals";
import { encrypt } from "@/lib/encryption";
import { createHash } from "crypto";
import mammoth from 'mammoth';
import { FIRST_SYNC_LOOKBACK_MS } from '@/lib/config/constants';
import {
  persistCalendarRsvpAvoidanceSignals,
  persistResponsePatternSignals,
  type CalendarIntelEvent,
  type MailIntelMessage,
} from '@/lib/sync/derive-mail-intelligence';

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_MAX_PAGES = 10;
const MAIL_PAGE_SIZE = 200;
const MAIL_MAX_ITEMS_PER_FOLDER = 500;
const CALENDAR_PAGE_SIZE = 250;
const CALENDAR_MAX_ITEMS = 500;
const FILE_PAGE_SIZE = 200;
const FILE_MAX_ITEMS = 200;
const TASK_PAGE_SIZE = 100;
const TASK_LIST_PAGE_SIZE = 100;
const TASK_MAX_ITEMS_PER_LIST = 200;
const UPCOMING_CALENDAR_LOOKAHEAD_DAYS = 14;

const MS_TOKEN_SCOPES =
  "openid profile email offline_access User.Read Mail.Read Mail.ReadWrite Mail.Send Calendars.Read Calendars.ReadWrite Files.Read Tasks.Read";

/**
 * Refresh the Microsoft access token using the refresh_token from user_tokens,
 * then persist the new tokens back to user_tokens.
 */
async function refreshMicrosoftAccessToken(
  userId: string,
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
} | null> {
  const response = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AZURE_AD_CLIENT_ID!,
        client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: MS_TOKEN_SCOPES,
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    let errorCode = "unknown";
    let errorDesc = "";
    try {
      const parsed = JSON.parse(errorBody);
      errorCode = parsed.error ?? "unknown";
      errorDesc = parsed.error_description ?? "";
    } catch {
      /* non-JSON */
    }
    console.error(
      `[microsoft-sync] Token refresh failed (${response.status}): ${errorBody.slice(0, 200)}`,
    );
    if (isMicrosoftRefreshFatalError(errorCode, errorDesc)) {
      await softDisconnectAfterFatalOAuthRefresh(userId, "microsoft", {
        source: "microsoft-sync.refreshMicrosoftAccessToken",
        error_code: errorCode,
        error_description: errorDesc,
      });
    }
    return null;
  }

  const data = await response.json();
  const newTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
  };

  // Persist refreshed tokens back to user_tokens
  await saveUserToken(userId, "microsoft", newTokens);
  console.log(
    `[microsoft-sync] Refreshed and saved Microsoft tokens for user ${userId}`,
  );
  return newTokens;
}

/**
 * Get a valid Microsoft access token from user_tokens, refreshing if expired.
 */
async function getValidMicrosoftToken(
  userId: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
} | null> {
  const token = await getUserToken(userId, "microsoft");
  if (!token) return null;
  if (!token.access_token) return null;

  // Check if token needs refresh (5-minute buffer)
  const nowSec = Math.floor(Date.now() / 1000);
  if (token.expires_at && token.expires_at < nowSec + 5 * 60) {
    if (!token.refresh_token) {
      console.error(
        "[microsoft-sync] No refresh token — user must re-authenticate",
      );
      return null;
    }
    return refreshMicrosoftAccessToken(userId, token.refresh_token);
  }

  return token;
}

/**
 * Fetch with Microsoft Graph, retrying once on 401 with refreshed token.
 */
async function graphFetch(
  userId: string,
  accessToken: string,
  url: string,
): Promise<any> {
  let res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.body-content-type="text"',
    },
  });

  if (res.status === 401) {
    // Token expired mid-sync — refresh from user_tokens and retry
    const token = await getUserToken(userId, "microsoft");
    if (!token?.refresh_token)
      throw new Error("Token refresh failed on 401 — no refresh token");
    const refreshed = await refreshMicrosoftAccessToken(
      userId,
      token.refresh_token,
    );
    if (!refreshed) throw new Error("Token refresh failed on 401");
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${refreshed.access_token}`,
        "Content-Type": "application/json",
        Prefer: 'outlook.body-content-type="text"',
      },
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph API ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

async function graphFetchAll<T>(
  userId: string,
  accessToken: string,
  url: string,
  options?: {
    maxItems?: number;
    maxPages?: number;
  },
): Promise<T[]> {
  const maxItems = options?.maxItems ?? Number.POSITIVE_INFINITY;
  const maxPages = options?.maxPages ?? GRAPH_MAX_PAGES;
  const items: T[] = [];

  let nextUrl: string | null = url;
  let pagesFetched = 0;

  while (nextUrl && pagesFetched < maxPages && items.length < maxItems) {
    const data = await graphFetch(userId, accessToken, nextUrl);
    const pageItems = Array.isArray(data?.value) ? (data.value as T[]) : [];
    const remaining = maxItems - items.length;

    if (pageItems.length > 0) {
      items.push(...pageItems.slice(0, remaining));
    }

    nextUrl =
      items.length < maxItems && typeof data?.["@odata.nextLink"] === "string"
        ? data["@odata.nextLink"]
        : null;
    pagesFetched += 1;
  }

  return items;
}

interface MicrosoftSignalCoverage {
  mail_total_signals: number;
  calendar_total_signals: number;
  file_total_signals: number;
  task_total_signals: number;
}

type MicrosoftMailSignalType = "email_sent" | "email_received";

const MAIL_BODY_PREVIEW = 500;

function headerMapFromInternet(
  headers: Array<{ name?: string; value?: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name && h.value) out[h.name.toLowerCase()] = h.value;
  }
  return out;
}

function formatMicrosoftMailContent(
  msg: any,
  signalType: MicrosoftMailSignalType,
  options?: { threadMessagesInConversation?: number },
): string {
  const isSent = signalType === "email_sent";
  const from = msg.from?.emailAddress?.address ?? "";
  const to = (msg.toRecipients ?? [])
    .map((recipient: any) => recipient.emailAddress?.address)
    .filter(Boolean)
    .join(", ");
  const cc = (msg.ccRecipients ?? [])
    .map((recipient: any) => recipient.emailAddress?.address)
    .filter(Boolean)
    .join(", ");
  const subject = msg.subject ?? "(no subject)";
  const date =
    (isSent ? msg.sentDateTime : msg.receivedDateTime) ??
    msg.receivedDateTime ??
    msg.sentDateTime ??
    new Date().toISOString();
  const rawBody = msg.body?.content ?? msg.bodyPreview ?? "";
  const bodyText = rawBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, MAIL_BODY_PREVIEW);

  const hdrs = headerMapFromInternet(msg.internetMessageHeaders);
  const inReplyTo = hdrs["in-reply-to"] ?? "";
  const references = hdrs["references"] ?? "";
  const hasReplyHeaders = Boolean(inReplyTo || references);
  const importance = msg.importance ?? "";
  const infer = msg.inferenceClassification ?? "";

  const threadLine =
    typeof options?.threadMessagesInConversation === "number"
      ? `Thread messages (this folder batch / conversation): ${options.threadMessagesInConversation}`
      : "";

  const lines = isSent
    ? [
        `[Sent email: ${date}]`,
        `To: ${to}`,
        cc ? `Cc: ${cc}` : "",
        `Subject: ${subject}`,
        `Body preview: ${bodyText}`,
        `Has In-Reply-To or References: ${hasReplyHeaders ? "yes" : "no"}`,
        threadLine,
        importance ? `Importance: ${importance}` : "",
        infer ? `Inference: ${infer}` : "",
      ]
    : [
        `[Email received: ${date}]`,
        `From: ${from}`,
        `To: ${to}`,
        cc ? `Cc: ${cc}` : "",
        `Subject: ${subject}`,
        `Body preview: ${bodyText}`,
        `Has In-Reply-To or References: ${hasReplyHeaders ? "yes" : "no"}`,
        threadLine,
        importance ? `Importance: ${importance}` : "",
        infer ? `Inference: ${infer}` : "",
      ];

  return lines.filter(Boolean).join("\n");
}

function formatMicrosoftCalendarContent(event: any, selfEmailLower: string): string {
  const summary = event.subject ?? "(no title)";
  const start = event.start?.dateTime ?? "";
  const end = event.end?.dateTime ?? "";
  const organizer = event.organizer?.emailAddress?.address ?? "";
  const createdBy =
    event.createdBy?.user?.emailAddress?.address ??
    event.organizer?.emailAddress?.address ??
    "";
  const isOrganizer = event.isOrganizer === true;
  const recurrence = event.recurrence != null;
  const attendeeDetail = (event.attendees ?? [])
    .map((attendee: any) => {
      const em = attendee.emailAddress?.address ?? "";
      const st = attendee.status?.response ?? "";
      return em ? `${em} (${st})` : "";
    })
    .filter(Boolean)
    .join("; ");

  let selfResponse = "";
  if (selfEmailLower) {
    const me = (event.attendees ?? []).find(
      (a: any) => (a.emailAddress?.address ?? "").toLowerCase() === selfEmailLower,
    );
    selfResponse = me?.status?.response ?? "";
  }

  const isAllDay = event.isAllDay ?? false;

  return [
    `[Calendar event: ${summary}]`,
    `Start: ${start}`,
    `End: ${end}`,
    isAllDay ? "All day event" : "",
    organizer ? `Organizer: ${organizer}` : "",
    createdBy ? `Created by: ${createdBy}` : "",
    `Created by you / organizer: ${isOrganizer ? "yes" : "no"}`,
    `Recurring: ${recurrence ? "yes" : "no"}`,
    attendeeDetail ? `Attendees: ${attendeeDetail}` : "",
    selfResponse ? `Your response: ${selfResponse}` : "",
    event.bodyPreview ? `Description: ${event.bodyPreview.slice(0, 500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function getMicrosoftSignalCoverage(
  userId: string,
): Promise<MicrosoftSignalCoverage | null> {
  const supabase = createServerClient();

  const [mailRes, calendarRes, fileRes, taskRes] = await Promise.all([
    supabase
      .from("tkg_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "outlook"),
    supabase
      .from("tkg_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "outlook_calendar"),
    supabase
      .from("tkg_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "onedrive"),
    supabase
      .from("tkg_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "microsoft_todo"),
  ]);

  const queryError =
    mailRes.error ?? calendarRes.error ?? fileRes.error ?? taskRes.error;
  if (queryError) {
    console.error(
      "[microsoft-sync] Coverage count failed:",
      queryError.message,
    );
    return null;
  }

  return {
    mail_total_signals: mailRes.count ?? 0,
    calendar_total_signals: calendarRes.count ?? 0,
    file_total_signals: fileRes.count ?? 0,
    task_total_signals: taskRes.count ?? 0,
  };
}

// ── Mail Sync ───────────────────────────────────────────────────────────────

async function syncMail(
  userId: string,
  accessToken: string,
  sinceIso: string,
): Promise<number> {
  // Inbox: filter on receivedDateTime. Sent Items: must use sentDateTime — using
  // receivedDateTime on /sentitems often makes Graph return 400 or empty, and
  // Promise.all aborted the whole mail sync so last_synced_at never advanced.
  const inboxFilter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
  const sentFilter = encodeURIComponent(`sentDateTime ge ${sinceIso}`);
  const select =
    "id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,body,conversationId,internetMessageId,importance,inferenceClassification,internetMessageHeaders";

  const inboxUrl = `${GRAPH_BASE}/me/messages?$filter=${inboxFilter}&$select=${select}&$top=${MAIL_PAGE_SIZE}&$orderby=receivedDateTime desc`;
  const sentUrl = `${GRAPH_BASE}/me/mailFolders/sentitems/messages?$filter=${sentFilter}&$select=${select}&$top=${MAIL_PAGE_SIZE}&$orderby=sentDateTime desc`;

  const [inboxSettled, sentSettled] = await Promise.allSettled([
    graphFetchAll<any>(userId, accessToken, inboxUrl, {
      maxItems: MAIL_MAX_ITEMS_PER_FOLDER,
    }),
    graphFetchAll<any>(userId, accessToken, sentUrl, {
      maxItems: MAIL_MAX_ITEMS_PER_FOLDER,
    }),
  ]);

  const inboxData =
    inboxSettled.status === "fulfilled" ? inboxSettled.value : [];
  const sentData = sentSettled.status === "fulfilled" ? sentSettled.value : [];

  if (inboxSettled.status === "rejected") {
    console.error(
      `[microsoft-sync] Inbox mail fetch failed user=${userId}:`,
      inboxSettled.reason instanceof Error
        ? inboxSettled.reason.message
        : String(inboxSettled.reason),
    );
  }
  if (sentSettled.status === "rejected") {
    console.error(
      `[microsoft-sync] Sent-items mail fetch failed user=${userId}:`,
      sentSettled.reason instanceof Error
        ? sentSettled.reason.message
        : String(sentSettled.reason),
    );
  }

  if (inboxSettled.status === "rejected" && sentSettled.status === "rejected") {
    const a =
      inboxSettled.reason instanceof Error
        ? inboxSettled.reason.message
        : String(inboxSettled.reason);
    const b =
      sentSettled.reason instanceof Error
        ? sentSettled.reason.message
        : String(sentSettled.reason);
    throw new Error(`mail inbox+sent failed: ${a}; ${b}`);
  }

  const inboxMessages = inboxData.map((m: any) => ({ ...m, _folder: "inbox" }));
  const sentMessages = sentData.map((m: any) => ({ ...m, _folder: "sent" }));
  const allMessages = [...inboxMessages, ...sentMessages];

  if (allMessages.length === 0) return 0;

  const convoCounts = new Map<string, number>();
  for (const msg of allMessages) {
    const cid = msg.conversationId as string | undefined;
    if (!cid) continue;
    convoCounts.set(cid, (convoCounts.get(cid) ?? 0) + 1);
  }

  const supabase = createServerClient();
  let inserted = 0;
  const intelMessages: MailIntelMessage[] = [];

  for (const msg of allMessages) {
    if (!msg.id) continue;
    try {
      const isSent = msg._folder === "sent";
      const from = msg.from?.emailAddress?.address ?? "";
      const date =
        (isSent ? msg.sentDateTime : msg.receivedDateTime) ??
        msg.receivedDateTime ??
        msg.sentDateTime ??
        new Date().toISOString();

      const signalType = isSent ? "email_sent" : "email_received";
      const cid = msg.conversationId as string | undefined;
      const threadN = cid ? convoCounts.get(cid) : undefined;
      const content = formatMicrosoftMailContent(msg, signalType, {
        threadMessagesInConversation: threadN,
      });

      // Cross-provider email dedup: normalize hash from sender + subject + date
      // so Gmail and Outlook versions of the same email produce the same hash.
      const senderEmail = (isSent ? (msg.toRecipients?.[0]?.emailAddress?.address ?? '') : from).toLowerCase().trim();
      const normalizedSubject = (msg.subject ?? '').toLowerCase().trim();
      const datePrefix = date ? new Date(date).toISOString().slice(0, 10) : '';
      const contentHash = hash(`email:${senderEmail}|${normalizedSubject}|${datePrefix}`);

      const { error } = await supabase.from("tkg_signals").upsert({
        user_id: userId,
        source: "outlook",
        source_id: msg.id,
        type: signalType,
        content: encrypt(content),
        content_hash: contentHash,
        author: isSent ? "self" : from,
        occurred_at: new Date(date).toISOString(),
        processed: false,
      }, { onConflict: "user_id,content_hash", ignoreDuplicates: true });

      if (!error) inserted++;

      const hdrs = headerMapFromInternet(msg.internetMessageHeaders);
      const toStr = (msg.toRecipients ?? [])
        .map((r: any) => r.emailAddress?.address)
        .filter(Boolean)
        .join(", ");
      const ccStr = (msg.ccRecipients ?? [])
        .map((r: any) => r.emailAddress?.address)
        .filter(Boolean)
        .join(", ");
      const dateMs = new Date(date).getTime();
      if (Number.isFinite(dateMs)) {
        intelMessages.push({
          id: msg.id,
          isSent,
          fromRaw: from,
          toRaw: toStr,
          ccRaw: ccStr,
          subject: msg.subject ?? "(no subject)",
          dateMs,
          messageId: (msg.internetMessageId as string | undefined)?.replace(/[<>]/g, ""),
          inReplyTo: hdrs["in-reply-to"],
          references: hdrs["references"],
        });
      }
    } catch (msgErr: unknown) {
      console.warn(`[microsoft-sync] Failed to persist mail for user ${userId}:`, msgErr instanceof Error ? msgErr.message : String(msgErr));
    }
  }

  try {
    const derived = await persistResponsePatternSignals(supabase, userId, "outlook", intelMessages);
    if (derived > 0) {
      console.log(`[microsoft-sync] user=${userId} response_pattern signals: ${derived}`);
    }
  } catch (e) {
    console.warn(`[microsoft-sync] response_pattern derivation failed for ${userId}:`, e instanceof Error ? e.message : String(e));
  }

  return inserted;
}

// ── Calendar Sync ───────────────────────────────────────────────────────────

async function syncCalendar(
  userId: string,
  accessToken: string,
  sinceIso: string,
  untilIso: string,
  selfEmailLower: string,
): Promise<number> {
  const url = `${GRAPH_BASE}/me/calendarView?startDateTime=${sinceIso}&endDateTime=${untilIso}&$select=id,subject,start,end,isAllDay,organizer,attendees,bodyPreview,recurrence,isOrganizer,createdBy&$top=${CALENDAR_PAGE_SIZE}&$orderby=start/dateTime`;

  const events = await graphFetchAll<any>(userId, accessToken, url, {
    maxItems: CALENDAR_MAX_ITEMS,
  });
  if (events.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;
  const intelEvents: CalendarIntelEvent[] = [];

  for (const event of events) {
    if (!event.id) continue;

    const start = event.start?.dateTime ?? "";
    const organizer = event.organizer?.emailAddress?.address ?? "";
    const content = formatMicrosoftCalendarContent(event, selfEmailLower);

    const contentHash = hash(`outlook-calendar:${event.id}`);

    const { error } = await supabase.from("tkg_signals").upsert({
      user_id: userId,
      source: "outlook_calendar",
      source_id: event.id,
      type: "calendar_event",
      content: encrypt(content),
      content_hash: contentHash,
      author: organizer || "self",
      occurred_at: start
        ? new Date(start).toISOString()
        : new Date().toISOString(),
      processed: false,
    }, { onConflict: "user_id,content_hash", ignoreDuplicates: true });

    if (!error) inserted++;

    const attendeesFlat = (event.attendees ?? []).map((a: any) => ({
      email: a.emailAddress?.address ?? "",
      responseStatus: a.status?.response ?? undefined,
    })).filter((a: { email: string }) => a.email);

    const createdBy =
      event.createdBy?.user?.emailAddress?.address ??
      event.organizer?.emailAddress?.address ??
      "";
    const createdBySelf =
      selfEmailLower !== "" &&
      createdBy.toLowerCase() === selfEmailLower;

    intelEvents.push({
      id: event.id,
      summary: event.subject ?? "(no title)",
      startIso: start,
      organizerEmail: organizer,
      selfEmailLower,
      attendees: attendeesFlat,
      isRecurring: event.recurrence != null,
      createdBySelf,
    });
  }

  try {
    const rsvp = await persistCalendarRsvpAvoidanceSignals(supabase, userId, "outlook_calendar", intelEvents);
    if (rsvp > 0) {
      console.log(`[microsoft-sync] user=${userId} calendar RSVP-avoidance signals: ${rsvp}`);
    }
  } catch (e) {
    console.warn(`[microsoft-sync] calendar RSVP derivation failed for ${userId}:`, e instanceof Error ? e.message : String(e));
  }

  return inserted;
}

export async function recoverMicrosoftSignalContent(
  userId: string,
  source: "outlook" | "outlook_calendar",
  sourceId: string,
  signalType?: string,
): Promise<string | null> {
  if (!sourceId) return null;

  const token = await getValidMicrosoftToken(userId);
  if (!token) return null;

  if (source === "outlook") {
    const message = await graphFetch(
      userId,
      token.access_token,
      `${GRAPH_BASE}/me/messages/${sourceId}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,body,conversationId,internetMessageId,importance,inferenceClassification,internetMessageHeaders`,
    );

    const normalizedType: MicrosoftMailSignalType =
      signalType === "email_sent" ? "email_sent" : "email_received";
    return formatMicrosoftMailContent(message, normalizedType);
  }

  const event = await graphFetch(
    userId,
    token.access_token,
    `${GRAPH_BASE}/me/events/${sourceId}?$select=id,subject,start,end,isAllDay,organizer,attendees,bodyPreview,recurrence,isOrganizer,createdBy`,
  );
  return formatMicrosoftCalendarContent(event, "");
}

// ── OneDrive Files Sync ─────────────────────────────────────────────────────

const SUPPORTED_FILE_EXTENSIONS = new Set([".docx", ".xlsx", ".txt", ".md"]);
const TEXT_FILE_EXTENSIONS = new Set([".txt", ".md"]);

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/**
 * Download file content from OneDrive.
 * - .docx: extract text with mammoth
 * - .txt / .md: raw text
 * - .xlsx: metadata only (binary, no text extraction)
 * Returns up to 1500 chars of extracted text, or null if unavailable.
 */
async function downloadFileContent(
  accessToken: string,
  fileId: string,
  ext: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/me/drive/items/${fileId}/content`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        redirect: "follow",
      },
    );
    if (!res.ok) return null;

    if (ext === ".docx") {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim().slice(0, 1500) || null;
    }

    // .txt and .md — plain text
    const text = await res.text();
    return text.slice(0, 1500) || null;
  } catch {
    return null;
  }
}

async function syncFiles(
  userId: string,
  accessToken: string,
  sinceIso: string,
): Promise<number> {
  // Search by last modified date — covers history, not just recently accessed files.
  // Falls back to /recent if search returns 400 (some tenant configs block it).
  const select =
    "id,name,lastModifiedDateTime,lastModifiedBy,size,webUrl,file,folder";
  const sinceDate = new Date(sinceIso).getTime();

  let files: any[];
  try {
    // Microsoft Graph search by modified date with file type filter
    const filter = encodeURIComponent(
      `lastModifiedDateTime ge ${sinceIso} and file ne null`,
    );
    const searchUrl = `${GRAPH_BASE}/me/drive/root/search(q='')?\$filter=${filter}&\$select=${select}&\$top=${FILE_PAGE_SIZE}`;
    files = await graphFetchAll<any>(userId, accessToken, searchUrl, {
      maxItems: FILE_MAX_ITEMS,
    });
  } catch (searchErr: any) {
    // Fall back to /recent if search fails
    if (
      searchErr.message?.includes("400") ||
      searchErr.message?.includes("501")
    ) {
      try {
        const recentUrl = `${GRAPH_BASE}/me/drive/recent?$select=${select}&$top=${FILE_PAGE_SIZE}`;
        files = await graphFetchAll<any>(userId, accessToken, recentUrl, {
          maxItems: FILE_MAX_ITEMS,
        });
      } catch (recentErr: any) {
        if (
          recentErr.message?.includes("403") ||
          recentErr.message?.includes("Forbidden") ||
          recentErr.message?.includes("400")
        ) {
          console.warn(
            "[microsoft-sync] OneDrive file sync skipped (no access)",
          );
          return 0;
        }
        throw recentErr;
      }
    } else if (
      searchErr.message?.includes("403") ||
      searchErr.message?.includes("Forbidden")
    ) {
      console.warn(
        "[microsoft-sync] Files.Read scope not granted, skipping file sync",
      );
      return 0;
    } else {
      throw searchErr;
    }
  }

  // Filter to supported file types modified since the sync window
  const fileItems = files.filter((f: any) => {
    if (!f.file) return false; // skip folders
    const ext = getFileExtension(f.name ?? "");
    if (!SUPPORTED_FILE_EXTENSIONS.has(ext)) return false;
    const modified = f.lastModifiedDateTime
      ? new Date(f.lastModifiedDateTime).getTime()
      : 0;
    return modified >= sinceDate;
  });
  if (fileItems.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;

  for (const file of fileItems) {
    if (!file.id) continue;

    const modifiedBy = file.lastModifiedBy?.user?.displayName ?? "";
    const ext = getFileExtension(file.name ?? "");

    // Extract text content from Word docs and plain text files
    // Skip DOCX files larger than 500KB — mammoth parsing on large binaries can add 30s+ of latency
    const DOCX_MAX_PARSE_BYTES = 500 * 1024;
    let fileContent = "";
    if (ext === ".docx" && (file.size ?? 0) <= DOCX_MAX_PARSE_BYTES) {
      const text = await downloadFileContent(accessToken, file.id, ext);
      if (text) {
        fileContent = `\nContent: ${text}`;
      }
    } else if (TEXT_FILE_EXTENSIONS.has(ext)) {
      const text = await downloadFileContent(accessToken, file.id, ext);
      if (text) {
        fileContent = `\nContent: ${text}`;
      }
    }

    const content = [
      `[File modified: ${file.name}]`,
      `Modified: ${file.lastModifiedDateTime}`,
      modifiedBy ? `By: ${modifiedBy}` : "",
      file.size ? `Size: ${Math.round(file.size / 1024)}KB` : "",
      file.webUrl ? `URL: ${file.webUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n") + fileContent;

    const contentHash = hash(
      `onedrive:${file.id}:${file.lastModifiedDateTime}`,
    );

    const { error } = await supabase.from("tkg_signals").upsert({
      user_id: userId,
      source: "onedrive",
      source_id: file.id,
      type: "file_modified",
      content: encrypt(content),
      content_hash: contentHash,
      author: modifiedBy || "self",
      occurred_at: file.lastModifiedDateTime ?? new Date().toISOString(),
      processed: false,
    }, { onConflict: "user_id,content_hash", ignoreDuplicates: true });

    if (!error) inserted++;
  }

  return inserted;
}

// ── To Do Tasks Sync ────────────────────────────────────────────────────────

async function syncTasks(
  userId: string,
  accessToken: string,
  sinceIso: string,
): Promise<number> {
  // First get task lists
  let listsData: any;
  try {
    listsData = await graphFetchAll<any>(
      userId,
      accessToken,
      `${GRAPH_BASE}/me/todo/lists?$top=${TASK_LIST_PAGE_SIZE}`,
    );
  } catch (err: any) {
    if (err.message?.includes("403") || err.message?.includes("Forbidden")) {
      console.warn(
        "[microsoft-sync] Tasks.Read scope not granted, skipping task sync",
      );
      return 0;
    }
    throw err;
  }

  const lists = listsData ?? [];
  if (lists.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;

  for (const list of lists) {
    if (!list.id) continue;

    try {
      const filter = encodeURIComponent(`lastModifiedDateTime ge ${sinceIso}`);
      const tasks = await graphFetchAll<any>(
        userId,
        accessToken,
        `${GRAPH_BASE}/me/todo/lists/${list.id}/tasks?$filter=${filter}&$select=id,title,status,importance,dueDateTime,lastModifiedDateTime,body&$top=${TASK_PAGE_SIZE}`,
        { maxItems: TASK_MAX_ITEMS_PER_LIST },
      );

      for (const task of tasks) {
        if (!task.id) continue;

        const dueDate = task.dueDateTime?.dateTime ?? "";
        const content = [
          `[Task: ${task.title}]`,
          `List: ${list.displayName ?? "Tasks"}`,
          `Status: ${task.status ?? "notStarted"}`,
          task.importance ? `Importance: ${task.importance}` : "",
          dueDate ? `Due: ${dueDate}` : "",
          task.body?.content ? `Notes: ${task.body.content.slice(0, 500)}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const contentHash = hash(
          `todo:${task.id}:${task.lastModifiedDateTime}`,
        );

        const { error } = await supabase.from("tkg_signals").upsert({
          user_id: userId,
          source: "microsoft_todo",
          source_id: task.id,
          type: "task",
          content: encrypt(content),
          content_hash: contentHash,
          author: "self",
          occurred_at: task.lastModifiedDateTime ?? new Date().toISOString(),
          processed: false,
        }, { onConflict: "user_id,content_hash", ignoreDuplicates: true });

        if (!error) inserted++;
      }
    } catch (listErr: unknown) {
      console.warn(`[microsoft-sync] Failed to persist task list for user ${userId}:`, listErr instanceof Error ? listErr.message : String(listErr));
    }
  }

  return inserted;
}

// ── Main Sync Entry Point ───────────────────────────────────────────────────

export interface MicrosoftSyncResult {
  mail_signals: number;
  calendar_signals: number;
  file_signals: number;
  task_signals: number;
  mail_total_signals: number;
  calendar_total_signals: number;
  file_total_signals: number;
  task_total_signals: number;
  is_first_sync: boolean;
  error?: string;
}

/**
 * Run Microsoft sync for a user. On first connect (no last_synced_at),
 * pulls 30 days. On subsequent runs, pulls since last sync.
 */
export async function syncMicrosoft(
  userId: string,
  options?: { maxLookbackMs?: number },
): Promise<MicrosoftSyncResult> {
  // Get token from user_tokens, refreshing if expired
  const validToken = await getValidMicrosoftToken(userId);
  if (!validToken) {
    return {
      mail_signals: 0,
      calendar_signals: 0,
      file_signals: 0,
      task_signals: 0,
      mail_total_signals: 0,
      calendar_total_signals: 0,
      file_total_signals: 0,
      task_total_signals: 0,
      is_first_sync: false,
      error: "no_token",
    };
  }

  // Read last_synced_at separately (getValidMicrosoftToken may have refreshed)
  const tokenMeta = await getUserToken(userId, "microsoft");
  const isFirstSync = !tokenMeta?.last_synced_at;
  const sinceMs = isFirstSync
    ? Date.now() - (options?.maxLookbackMs ?? FIRST_SYNC_LOOKBACK_MS)
    : new Date(tokenMeta!.last_synced_at!).getTime();
  const sinceIso = new Date(sinceMs).toISOString();
  const calendarUntilIso = new Date(
    Date.now() + UPCOMING_CALENDAR_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const accessToken = validToken.access_token;

  let graphSelfEmail = "";
  try {
    const me = await graphFetch(
      userId,
      accessToken,
      `${GRAPH_BASE}/me?$select=mail,userPrincipalName`,
    );
    const raw = (me.mail ?? me.userPrincipalName ?? "") as string;
    graphSelfEmail = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  } catch {
    /* optional */
  }

  let mailSignals = 0;
  let calendarSignals = 0;
  let fileSignals = 0;
  let taskSignals = 0;
  let mailOk = false;
  const errors: string[] = [];

  try {
    mailSignals = await syncMail(userId, accessToken, sinceIso);
    mailOk = true;
  } catch (err: any) {
    console.error("[microsoft-sync] Mail sync failed:", err.message);
    errors.push(`mail: ${err.message}`);
  }

  try {
    calendarSignals = await syncCalendar(
      userId,
      accessToken,
      sinceIso,
      calendarUntilIso,
      graphSelfEmail,
    );
  } catch (err: any) {
    console.error("[microsoft-sync] Calendar sync failed:", err.message);
    errors.push(`calendar: ${err.message}`);
  }

  try {
    fileSignals = await syncFiles(userId, accessToken, sinceIso);
  } catch (err: any) {
    console.error("[microsoft-sync] Files sync failed:", err.message);
    errors.push(`files: ${err.message}`);
  }

  try {
    taskSignals = await syncTasks(userId, accessToken, sinceIso);
  } catch (err: any) {
    console.error("[microsoft-sync] Tasks sync failed:", err.message);
    errors.push(`tasks: ${err.message}`);
  }

  // Advance timestamp if primary sync (Mail) succeeded.
  // Secondary sub-sync failures (Calendar, Files, Tasks) are logged but don't
  // block timestamp advancement — prevents a persistent scope issue from
  // stalling all sync indefinitely. Dedup via content_hash prevents duplicates.
  if (mailOk) {
    await updateSyncTimestamp(userId, "microsoft");
    if (errors.length > 0) {
      console.warn(
        `[microsoft-sync] user=${userId} timestamp advanced (mail OK) despite secondary errors: ${errors.join('; ')}`,
      );
    }
  } else {
    console.warn(
      `[microsoft-sync] user=${userId} timestamp NOT advanced — primary sync (mail) failed: ${errors.join('; ')}`,
    );
  }

  const total = mailSignals + calendarSignals + fileSignals + taskSignals;
  const coverage = await getMicrosoftSignalCoverage(userId);
  console.log(
    `[microsoft-sync] user=${userId} first=${isFirstSync} mail=${mailSignals} calendar=${calendarSignals} files=${fileSignals} tasks=${taskSignals} total=${total}` +
      (errors.length > 0 ? ` errors=[${errors.join("; ")}]` : ""),
  );

  return {
    mail_signals: mailSignals,
    calendar_signals: calendarSignals,
    file_signals: fileSignals,
    task_signals: taskSignals,
    mail_total_signals: coverage?.mail_total_signals ?? mailSignals,
    calendar_total_signals: coverage?.calendar_total_signals ?? calendarSignals,
    file_total_signals: coverage?.file_total_signals ?? fileSignals,
    task_total_signals: coverage?.task_total_signals ?? taskSignals,
    is_first_sync: isFirstSync,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}
