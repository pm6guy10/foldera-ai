// File: supabase/functions/ingest-file/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import mammoth from "https://esm.sh/mammoth@1.6.0";
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@3.4.120";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function guessFileType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".msg")) return "application/vnd.ms-outlook";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

serve(async (req) => {
  try {
    const { matter_id, filename, filetype, storage_path } = await req.json();

    const { data: fileBlob, error: downloadError } = await supabase
      .storage
      .from("case-files")
      .download(storage_path);
    if (downloadError) throw downloadError;

    const arrayBuffer = await fileBlob.arrayBuffer();
    let extracted_text = "[Unsupported filetype - stored but not parsed]";
    let children: string[] = [];

    // --- Parsing Logic ---
    if (filetype === "application/pdf") {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      extracted_text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        extracted_text += textContent.items.map((i: any) => i.str).join(" ") + "\n";
      }
    } else if (filetype.includes("wordprocessingml")) {
      const { value } = await mammoth.extractRawText({ arrayBuffer });
      extracted_text = value;
    } else if (filetype === "application/zip") {
      const zip = await JSZip.loadAsync(arrayBuffer);
      for (const [path, entry] of Object.entries(zip.files)) {
        if (!(entry as any).dir) {
          const content = await (entry as any).async("uint8array");
          const childPath = `${storage_path}/${path}`;
          await supabase.storage.from("case-files").upload(childPath, content, { upsert: true });
          children.push(path);
          await supabase.functions.invoke("ingest-file", {
            body: JSON.stringify({
              matter_id,
              filename: path,
              filetype: guessFileType(path),
              storage_path: childPath,
            }),
          });
        }
      }
      extracted_text = `[ZIP unpacked ${children.length} files]`;
    } else if (filetype === "application/vnd.ms-outlook") {
      // 🚨 Skip parsing — hand off to local worker
      extracted_text = "[MSG email stored — awaiting local worker parse]";
      await supabase.from("msg_queue").insert({
        matter_id,
        filename,
        storage_path,
        status: "pending",
      });
    }

    // --- DB Operations ---
    const { data: docRecord, error: docError } = await supabase
      .from("documents")
      .insert({
        matter_id,
        filename,
        filetype,
        filesize: arrayBuffer.byteLength,
        storage_path,
        extracted_text,
        metadata: { children, parsed: !!extracted_text }
      })
      .select()
      .single();
    if (docError) throw docError;

    await supabase.from("audit_log").insert({
      matter_id,
      action: "document_ingested",
      details: { filename, children: children.length }
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Ingest error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
