// File: app/api/upload/route.js (FINAL CORRECTED VERSION)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import MsgReader from 'node-msg';
// pdf-parse is NOT imported at the top.

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Dummy Processor Function
async function processAndSaveChunks(text, metadata) {
  console.log(`Processing text from ${metadata.fileName}. Length: ${text.length}`);
  return;
}

// File Processors
async function processPdf(buffer, metadata) {
  const pdf = (await import('pdf-parse')).default;
  const data = await pdf(buffer);
  await processAndSaveChunks(data.text, metadata);
}
async function processDocx(buffer, metadata) {
  const { value } = await mammoth.extractRawText({ buffer });
  await processAndSaveChunks(value, metadata);
}
async function processMsg(buffer, metadata) {
  const msg = new MsgReader(buffer);
  const data = msg.getFileData();
  const body = data.body || '';
  const text = `${data.subject}\n\n${body}`;
  await processAndSaveChunks(text, metadata);
}
async function processZip(buffer, metadata) {
  const zip = await JSZip.loadAsync(buffer);
  for (const filename in zip.files) {
    if (!zip.files[filename].dir) {
      const fileBuffer = await zip.files[filename].async('nodebuffer');
      await processFile(fileBuffer, { ...metadata, fileName: filename, originalFile: metadata.fileName });
    }
  }
}

// Main Router
async function processFile(buffer, metadata) {
  const extension = metadata.fileName.split('.').pop().toLowerCase();
  switch (extension) {
    case 'pdf': await processPdf(buffer, metadata); break;
    case 'docx': await processDocx(buffer, metadata); break;
    case 'msg': await processMsg(buffer, metadata); break;
    case 'zip': await processZip(buffer, metadata); break;
    default: console.log(`Skipping unsupported file type: ${metadata.fileName}`);
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    // === THIS IS THE FIX ===
    // We now correctly get ALL files using the key "files" (plural)
    const files = formData.getAll('files');
    const caseId = formData.get('caseId');

    if (!files || files.length === 0 || !caseId) {
      return NextResponse.json({ error: 'At least one file and a Case ID are required.' }, { status: 400 });
    }
    
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      await supabase.storage.from('case-files').upload(`${caseId}/${file.name}`, buffer, { upsert: true });
      await processFile(buffer, { caseId, fileName: file.name });
    }

    return NextResponse.json({ message: 'Batch upload successful.', processed: files.length });

  } catch (error) {
    console.error("Error in upload API:", error);
    return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
