"use client";
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

export function FileUpload({ caseId }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('Drag & drop case files here, or click to select');

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;
    setUploading(true);
    setMessage(`Uploading ${acceptedFiles[0].name}...`);

    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('caseId', caseId);

    // This API route doesn't exist yet - we'll build it next
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    setUploading(false);
    if (response.ok) {
      setMessage(`✅ Successfully uploaded ${file.name}! Ready for processing.`);
    } else {
      setMessage(`❌ Failed to upload ${file.name}. Please try again.`);
    }
  }, [caseId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });

  return (
    <div {...getRootProps()} className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-cyan-400 bg-cyan-900/50' : 'border-gray-600 hover:border-gray-400'}`}>
      <input {...getInputProps()} />
      <p className="text-gray-300">{message}</p>
    </div>
  );
}
