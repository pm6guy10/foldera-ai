"use client";
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Image from 'next/image';

export function FileUpload({ caseId }) {
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState('Drag & drop files, folders, or zips here');
  const [briefing, setBriefing] = useState(null);

  const generateBriefing = useCallback(async (identifier) => {
    setAnalyzing(true);
    setMessage('🧠 Foldera is reading your documents...');

    try {
      const response = await fetch('/api/briefing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ caseId: identifier }),
      });

      const result = await response.json();
      if (response.ok) {
        setBriefing(result);
        setMessage(`✅ Upload complete! ${identifier} files analyzed.`);
      } else {
        setMessage(`❌ Analysis failed: ${result.error || 'Please try again.'}`);
      }
    } catch (error) {
      setMessage(`❌ Analysis error: ${error.message}`);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0 || uploading || analyzing) return;
    
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
      setMessage(`✅ Batch upload complete! ${result.processed} files uploaded.`);
      // Automatically generate briefing after successful upload
      await generateBriefing(caseId);
    } else {
      setMessage(`❌ Upload failed: ${result.error || 'Please try again.'}`);
    }
  }, [caseId, uploading, analyzing, generateBriefing]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  return (
    <div className="space-y-6">
      <div {...getRootProps()} className={`p-10 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-cyan-400 bg-cyan-900/50' : 'border-gray-600 hover:border-gray-400'}`}>
        <input {...getInputProps()} />
        <p className="text-gray-300">{message}</p>
      </div>

      {briefing && (
        <div className="animate-fade-in bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-cyan-500/30 rounded-xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-white">🧠 Executive Briefing</h3>
            <button
              onClick={() => generateBriefing(caseId)}
              disabled={analyzing}
              className="px-3 py-1 text-sm bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              {analyzing ? 'Analyzing...' : 'Regenerate'}
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-blue-500">
              <div className="flex items-center gap-2 mb-2">
                <Image 
                  src="/foldera-glyph.svg" 
                  alt="" 
                  width={20} 
                  height={20}
                />
                <span className="font-semibold text-blue-400">WHAT CHANGED</span>
              </div>
              <p className="text-gray-200 text-sm leading-relaxed">{briefing.whatChanged}</p>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-yellow-500">
              <div className="flex items-center gap-2 mb-2">
                <Image 
                  src="/foldera-glyph.svg" 
                  alt="" 
                  width={20} 
                  height={20}
                />
                <span className="font-semibold text-yellow-400">WHAT MATTERS</span>
              </div>
              <p className="text-gray-200 text-sm leading-relaxed">{briefing.whatMatters}</p>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-green-500">
              <div className="flex items-center gap-2 mb-2">
                <Image 
                  src="/foldera-glyph.svg" 
                  alt="" 
                  width={20} 
                  height={20}
                />
                <span className="font-semibold text-green-400">NEXT MOVE</span>
              </div>
              <p className="text-gray-200 text-sm leading-relaxed">{briefing.whatToDoNext}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
