"use client";
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

export function FileUpload({ caseId }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('Drag & drop files, folders, or zips here');

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0 || uploading) return;
    
    setUploading(true);
    setMessage(`Uploading ${acceptedFiles.length} file(s)...`);

    const formData = new FormData();
    formData.append('caseId', caseId);
    acceptedFiles.forEach(file => {
      formData.append('files', file);
    });

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    setUploading(false);
    const result = await response.json();
    if (response.ok) {
      setMessage(`✅ Batch upload complete! ${result.processed} files are now being processed by the AI.`);
    } else {
      setMessage(`❌ Upload failed: ${result.error || 'Please try again.'}`);
    }
  }, [caseId, uploading]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  return (
    <div {...getRootProps()} className={`p-10 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-cyan-400 bg-cyan-900/50' : 'border-gray-600 hover:border-gray-400'}`}>
      <input {...getInputProps()} />
      <p className="text-gray-300">{message}</p>
    </div>
  );
}
