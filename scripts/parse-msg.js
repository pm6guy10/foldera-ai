// File: scripts/parse-msg.js

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import pkg from "msgreader";   // CommonJS package workaround
const { MsgReader } = pkg;

// ✅ Use backend env vars (matches your .env)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function processMsg(queueItem) {
  try {
    // Mark queue item as "processing"
    await supabase
      .from("msg_queue")
      .update({ status: "processing" })
      .eq("id", queueItem.id);

    // Download the .msg file from storage
    const { data: fileBlob, error: dlError } = await supabase.storage
      .from("case-files")
      .download(queueItem.storage_path);

    if (dlError) throw dlError;

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const msg = new MsgReader(buffer);
    const msgInfo = msg.getFileData();

    // Extract text + metadata
    const extracted_text = msgInfo.body || "[Empty email body]";
    const metadata = {
      from: msgInfo.senderName,
      to: msgInfo.recipients?.map((r) => r.name) || [],
      subject: msgInfo.subject,
      date: msgInfo.creationTime,
    };

    // Update the `documents` row with parsed text + metadata
    await supabase
      .from("documents")
      .update({ extracted_text, metadata })
      .eq("id", queueItem.document_id);

    // Mark queue as done
    await supabase
      .from("msg_queue")
      .update({ status: "done" })
      .eq("id", queueItem.id);

    console.log(`✔ Parsed MSG: ${queueItem.filename}`);
  } catch (err) {
    console.error(`❌ Failed to parse ${queueItem.filename}`, err.message);
    await supabase
      .from("msg_queue")
      .update({ status: "error" })
      .eq("id", queueItem.id);
  }
}

async function main() {
  try {
    // Pull up to 10 pending messages
    const { data: queue, error } = await supabase
      .from("msg_queue")
      .select("*")
      .eq("status", "pending")
      .limit(10);

    if (error) throw error;

    if (!queue || queue.length === 0) {
      console.log("No pending MSGs.");
      return;
    }

    for (const item of queue) {
      await processMsg(item);
    }
  } catch (err) {
    console.error("Main loop error:", err.message);
  }
}

// Run immediately on startup
main();

// Then repeat every 30 seconds
setInterval(main, 30 * 1000);
