import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth/auth-options";
import { syncMicrosoft } from "@/lib/sync/microsoft-sync";
import { rateLimit } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MANUAL_SYNC_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const rl = await rateLimit(`sync-now:microsoft:${userId}`, {
    limit: 3,
    window: 3600,
  });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Sync rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000),
          ),
        },
      },
    );
  }

  try {
    const result = await syncMicrosoft(userId, {
      maxLookbackMs: MANUAL_SYNC_LOOKBACK_MS,
    });

    if (result.error === "no_token") {
      return NextResponse.json(
        { error: "Microsoft account not connected" },
        { status: 400 },
      );
    }

    const total =
      result.mail_signals +
      result.calendar_signals +
      result.file_signals +
      result.task_signals;
    const coverageTotal =
      result.mail_total_signals +
      result.calendar_total_signals +
      result.file_total_signals +
      result.task_total_signals;

    return NextResponse.json({
      ok: true,
      total,
      inserted_total: total,
      coverage_total: coverageTotal,
      ...result,
    });
  } catch (err: any) {
    console.error(
      "[microsoft/sync-now] error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: err.message ?? "Sync failed" },
      { status: 500 },
    );
  }
}
