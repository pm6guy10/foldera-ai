'use client';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import Image from 'next/image';

export default function RealDocumentProcessor() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  
  const onDrop = useCallback(async (acceptedFiles) => {
    setFiles(acceptedFiles);
    setProcessing(true);
    setResults(null);
    setError(null);
    setProcessingProgress(0);
    
    try {
      // Check total file size (Vercel limit is 4.5MB for hobby plan)
      const totalSize = acceptedFiles.reduce((sum, file) => sum + file.size, 0);
      const totalSizeMB = totalSize / (1024 * 1024);
      
      if (totalSizeMB > 4) {
        throw new Error(`Total file size (${totalSizeMB.toFixed(1)}MB) exceeds 4MB limit. Please select fewer or smaller files.`);
      }
      
      // Actually upload all files
      const formData = new FormData();
      acceptedFiles.forEach(file => {
        formData.append('files', file);
      });
      
      // Show progress simulation
      const progressInterval = setInterval(() => {
        setProcessingProgress(prev => Math.min(prev + Math.random() * 15, 90));
      }, 500);
      
      // Real processing
      const response = await fetch('/api/process-real-docs', {
        method: 'POST',
        body: formData
      });
      
      clearInterval(progressInterval);
      setProcessingProgress(100);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || errorData.details || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      
      if (!data.success && data.error) {
        throw new Error(data.error);
      }
      
      setResults(data);
      
    } catch (err) {
      setError(err.message);
      console.error('Processing error:', err);
    } finally {
      setProcessing(false);
      setProcessingProgress(0);
    }
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: true,
    maxFiles: 100 // Allow up to 100 files
  });
  
  const resetProcessor = () => {
    setFiles([]);
    setResults(null);
    setError(null);
    setProcessingProgress(0);
  };
  
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          <Image src="/foldera-glyph.svg" alt="Foldera" width={48} height={48} className="mr-3" />
          <h1 className="text-3xl font-bold text-white">Real Document Processor</h1>
        </div>
        <p className="text-slate-400 text-lg">
          Upload hundreds of real documents. Get actual conflict detection.
        </p>
      </div>

      {/* Upload Area */}
      {!results && (
        <div className="space-y-6">
          <motion.div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-2xl p-12 cursor-pointer transition-all duration-300 text-center ${
              isDragActive 
                ? 'border-cyan-400 bg-cyan-400/10 scale-105' 
                : 'border-slate-600 hover:border-cyan-400 hover:bg-slate-800/50'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <input {...getInputProps()} />
            <div className="text-6xl mb-6">📁</div>
            <p className="text-xl mb-4">
              {isDragActive ? 'Drop your documents here!' : 'Drag & drop your messy folder'}
            </p>
            <p className="text-slate-500 mb-4">
              PDF, DOCX, XLSX, TXT files supported
            </p>
            <p className="text-sm text-slate-600">
              Supports up to 100 files • Real processing • Actual conflict detection
            </p>
          </motion.div>

          {/* Selected Files Preview */}
          {files.length > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4">
                Selected Files ({files.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto">
                {files.map((file, index) => (
                  <div key={index} className="bg-slate-700/50 rounded-lg p-3 text-sm">
                    <div className="font-medium text-white truncate">{file.name}</div>
                    <div className="text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processing State */}
      {processing && (
        <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700 text-center">
          <div className="text-4xl mb-4">🧠</div>
          <h2 className="text-2xl font-bold text-white mb-4">
            ACTUALLY Processing {files.length} Real Files
          </h2>
          <div className="mb-4">
            <div className="bg-slate-700 rounded-full h-3 mb-2">
              <div 
                className="bg-gradient-to-r from-cyan-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            <p className="text-slate-400">{processingProgress.toFixed(0)}% Complete</p>
          </div>
          <div className="text-sm text-slate-500">
            Parsing PDFs • Extracting text • Finding conflicts • Analyzing with AI
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-red-400 mb-4">Processing Failed</h2>
          <p className="text-slate-300 mb-6">{error}</p>
          <button
            onClick={resetProcessor}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 text-center">
              <div className="text-2xl font-bold text-cyan-400 mb-2">
                {results.fileCount}
              </div>
              <div className="text-slate-400">Files Processed</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 text-center">
              <div className="text-2xl font-bold text-purple-400 mb-2">
                {results.totalWords.toLocaleString()}
              </div>
              <div className="text-slate-400">Total Words</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 text-center">
              <div className="text-2xl font-bold text-yellow-400 mb-2">
                {results.realConflicts.length}
              </div>
              <div className="text-slate-400">Conflicts Found</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 text-center">
              <div className="text-2xl font-bold text-green-400 mb-2">
                {results.processedDocuments}
              </div>
              <div className="text-slate-400">Successfully Parsed</div>
            </div>
          </div>

          {/* Document List */}
          <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
            <h3 className="text-xl font-semibold text-white mb-4">Processed Documents</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {results.documents.map((doc, index) => (
                <div key={index} className="bg-slate-700/50 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium text-white truncate flex-1 mr-4">
                      {doc.name}
                    </div>
                    <div className="text-sm text-slate-400">
                      {doc.wordCount.toLocaleString()} words
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm text-slate-400">
                    <span>{doc.amounts.length} amounts</span>
                    <span>{doc.dates.length} dates</span>
                    <span>{doc.deadlines} deadlines</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real Conflicts */}
          {results.realConflicts.length > 0 ? (
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4">
                Real Conflicts Found
              </h3>
              <div className="space-y-4">
                {results.realConflicts.map((conflict, index) => (
                  <div 
                    key={index} 
                    className={`rounded-lg p-4 border-l-4 ${
                      conflict.severity === 'critical' 
                        ? 'bg-red-900/20 border-red-500' 
                        : 'bg-yellow-900/20 border-yellow-500'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          conflict.severity === 'critical' 
                            ? 'bg-red-500/20 text-red-400' 
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {conflict.type.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className="ml-2 text-xs text-slate-500">
                          {conflict.severity.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="text-white font-medium mb-2">
                      {conflict.description}
                    </div>
                    <div className="text-sm text-slate-400">
                      Documents: {conflict.doc1} ↔ {conflict.doc2}
                    </div>
                    {conflict.amount1 && conflict.amount2 && (
                      <div className="text-sm text-slate-400 mt-1">
                        Amounts: {conflict.amount1} vs {conflict.amount2} 
                        (Difference: {conflict.difference})
                      </div>
                    )}
                    {conflict.daysDifference && (
                      <div className="text-sm text-slate-400 mt-1">
                        Date difference: {conflict.daysDifference} days
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 text-center">
              <div className="text-4xl mb-4">✅</div>
              <h3 className="text-xl font-semibold text-green-400 mb-2">
                No Conflicts Found
              </h3>
              <p className="text-slate-400">
                Your documents appear to be consistent. No conflicting amounts, dates, or obligations detected.
              </p>
            </div>
          )}

          {/* Claude Analysis */}
          {results.analysis && (
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                <Image src="/foldera-glyph.svg" alt="AI" width={20} height={20} className="mr-2" />
                AI Analysis
              </h3>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <pre className="text-slate-300 whitespace-pre-wrap text-sm">
                  {results.analysis}
                </pre>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={resetProcessor}
              className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              Process More Files
            </button>
            <button
              onClick={() => {
                const reportData = {
                  summary: {
                    filesProcessed: results.fileCount,
                    totalWords: results.totalWords,
                    conflictsFound: results.realConflicts.length
                  },
                  conflicts: results.realConflicts,
                  documents: results.documents
                };
                
                const blob = new Blob([JSON.stringify(reportData, null, 2)], { 
                  type: 'application/json' 
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'foldera-analysis-report.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-8 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors"
            >
              Download Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
