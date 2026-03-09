import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load .env.local so INGEST_API_KEY / INGEST_URL / etc. are available
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  sender: "human" | "assistant";
  text: string;
  created_at: string;
}
interface Conversation {
  uuid: string;
  name: string;
  created_at: string;
  chat_messages: ChatMessage[];
}
interface IngestResult {
  uuid: string;
  name: string;
  status: "ok" | "skipped" | "error";
  reason?: string;
}
// ─── Config ───────────────────────────────────────────────────────────────────
const CONVERSATIONS_PATH = path.resolve(
  process.env.CONVERSATIONS_PATH || "./conversations.json"
);
const INGEST_URL =
  process.env.INGEST_URL || "http://localhost:3000/api/extraction/ingest";
const INGEST_API_KEY = process.env.INGEST_API_KEY || "";
const DELAY_MS = parseInt(process.env.DELAY_MS || "500", 10);
const MIN_MESSAGE_COUNT = parseInt(process.env.MIN_MESSAGE_COUNT || "2", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10", 10);
// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function formatConversation(conversation: Conversation): string {
  const lines: string[] = [
    `CONVERSATION: ${conversation.name}`,
    `DATE: ${conversation.created_at}`,
    `UUID: ${conversation.uuid}`,
    `---`,
  ];
  for (const msg of conversation.chat_messages) {
    const role = msg.sender === "human" ? "USER" : "ASSISTANT";
    const timestamp = msg.created_at ? ` [${msg.created_at}]` : "";
    lines.push(`${role}${timestamp}:`);
    lines.push(msg.text || "");
    lines.push("");
  }
  return lines.join("\n");
}
async function ingestConversation(
  conversation: Conversation
): Promise<IngestResult> {
  const uuid = conversation.uuid;
  const name = conversation.name || "Untitled";
  // Skip conversations with too few messages
  if (
    !conversation.chat_messages ||
    conversation.chat_messages.length < MIN_MESSAGE_COUNT
  ) {
    return {
      uuid,
      name,
      status: "skipped",
      reason: `Only ${conversation.chat_messages?.length ?? 0} messages`,
    };
  }
  const text = formatConversation(conversation);
  try {
    const response = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-secret": INGEST_API_KEY,
      },
      body: JSON.stringify({
        conversationId: uuid,
        conversationTitle: name,
        conversationDate: conversation.created_at,
        text,
        messageCount: conversation.chat_messages.length,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // Already ingested is expected — treat as skipped
      if (body.includes("already ingested")) {
        return { uuid, name, status: "skipped", reason: "already ingested" };
      }
      return {
        uuid,
        name,
        status: "error",
        reason: `HTTP ${response.status}: ${body.slice(0, 200)}`,
      };
    }
    return { uuid, name, status: "ok" };
  } catch (err) {
    return {
      uuid,
      name,
      status: "error",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🗂  Reading conversations from: ${CONVERSATIONS_PATH}`);
  if (!INGEST_API_KEY) {
    console.error(`❌  INGEST_API_KEY is not set. Check .env.local`);
    process.exit(1);
  }
  if (!fs.existsSync(CONVERSATIONS_PATH)) {
    console.error(`❌  File not found: ${CONVERSATIONS_PATH}`);
    console.error(
      `    Set CONVERSATIONS_PATH env var or place conversations.json in the current directory.`
    );
    process.exit(1);
  }
  const raw = fs.readFileSync(CONVERSATIONS_PATH, "utf-8");
  let conversations: Conversation[];
  try {
    conversations = JSON.parse(raw);
  } catch (err) {
    console.error(`❌  Failed to parse JSON: ${err}`);
    process.exit(1);
  }
  if (!Array.isArray(conversations)) {
    console.error(`❌  Expected an array of conversations, got: ${typeof conversations}`);
    process.exit(1);
  }
  console.log(`📦  Found ${conversations.length} conversations`);
  console.log(`🔗  Ingesting to: ${INGEST_URL}`);
  console.log(`⏱   Delay between requests: ${DELAY_MS}ms`);
  console.log(`📏  Min message count: ${MIN_MESSAGE_COUNT}`);
  console.log(`\n${"─".repeat(60)}\n`);
  const results: IngestResult[] = [];
  let processed = 0;
  for (let i = 0; i < conversations.length; i++) {
    const conversation = conversations[i];
    const result = await ingestConversation(conversation);
    results.push(result);
    processed++;
    const icon =
      result.status === "ok"
        ? "✅"
        : result.status === "skipped"
        ? "⏭ "
        : "❌";
    const suffix = result.reason ? ` — ${result.reason}` : "";
    console.log(
      `[${String(i + 1).padStart(3, "0")}/${conversations.length}] ${icon} ${result.name}${suffix}`
    );
    // Print batch summary every BATCH_SIZE
    if (processed % BATCH_SIZE === 0) {
      const ok = results.filter((r) => r.status === "ok").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const errors = results.filter((r) => r.status === "error").length;
      console.log(
        `\n   📊 Batch checkpoint: ${ok} ok / ${skipped} skipped / ${errors} errors (${processed} total)\n`
      );
    }
    // Rate-limit between requests
    if (i < conversations.length - 1 && result.status !== "skipped") {
      await sleep(DELAY_MS);
    }
  }
  // ─── Final Summary ────────────────────────────────────────────────────────
  const ok = results.filter((r) => r.status === "ok");
  const skipped = results.filter((r) => r.status === "skipped");
  const errors = results.filter((r) => r.status === "error");
  console.log(`\n${"─".repeat(60)}`);
  console.log(`\n✅  Ingested:  ${ok.length}`);
  console.log(`⏭   Skipped:   ${skipped.length}`);
  console.log(`❌  Errors:    ${errors.length}`);
  console.log(`\n📦  Total processed: ${conversations.length}`);
  if (errors.length > 0) {
    console.log(`\n⚠️  Errors detail:`);
    for (const e of errors) {
      console.log(`   ${e.uuid} | ${e.name}`);
      console.log(`   → ${e.reason}`);
    }
  }
  // Write results log
  const logPath = path.resolve("./ingest-results.json");
  fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`\n📝  Full results written to: ${logPath}`);
  if (errors.length > 0) {
    process.exit(1);
  }
}
main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
