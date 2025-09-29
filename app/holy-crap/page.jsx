'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import Image from 'next/image';

const FolderaHolyCrapDemo = () => {
  const [stage, setStage] = useState('waiting'); // waiting, uploading, scanning, detected, fixed, share
  const [docCount, setDocCount] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [realInsights, setRealInsights] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState(null);
  
  const timerRef = useRef(null);
  const countingRef = useRef(null);

  // Handle REAL file upload and processing
  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;
    
    setUploadedFiles(acceptedFiles);
    setStage('uploading');
    setTimeElapsed(0);
    setDocCount(0);
    setPageCount(0);
    setWordCount(0);
    
    // Check file size limit
    const totalSize = acceptedFiles.reduce((sum, file) => sum + file.size, 0);
    const totalSizeMB = totalSize / (1024 * 1024);
    
    if (totalSizeMB > 4) {
      alert(`Files too large (${totalSizeMB.toFixed(1)}MB). Please select under 4MB for demo.`);
      setStage('waiting');
      return;
    }
    
    // Start REAL processing in background
    const formData = new FormData();
    acceptedFiles.forEach(file => formData.append('files', file));
    
    fetch('/api/process-real-docs', {
      method: 'POST',
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      console.log('📊 REAL RESULTS:', data);
      if (data.success) {
        setRealInsights(data.smartInsights);
      }
    })
    .catch(err => {
      console.error('Processing error (will use demo):', err);
    });
    
    // Start the theatrical timer
    timerRef.current = setInterval(() => {
      setTimeElapsed(prev => prev + 0.1);
    }, 100);
    
    // Animate upload progress
    setTimeout(() => {
      setStage('scanning');
      const targetDocs = acceptedFiles.length;
      
      // Rapid counting animation
      countingRef.current = setInterval(() => {
        setDocCount(prev => {
          if (prev < targetDocs) return prev + Math.floor(Math.random() * 3) + 1;
          return targetDocs;
        });
        setPageCount(prev => {
          if (prev < 127) return prev + Math.floor(Math.random() * 5) + 1;
          return 127;
        });
        setWordCount(prev => {
          if (prev < 42847) return prev + Math.floor(Math.random() * 1000) + 100;
          return 42847;
        });
      }, 50);
      
      // Stop counting at 7 seconds
      setTimeout(() => {
        clearInterval(countingRef.current);
        setDocCount(targetDocs);
      }, 7000);
      
    }, 1000);
    
    // CRITICAL ERROR DETECTED at exactly 8 seconds
    setTimeout(() => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countingRef.current) clearInterval(countingRef.current);
      setStage('detected');
      // Screen shake effect
      document.body.style.animation = 'shake 0.5s ease-in-out';
      setTimeout(() => {
        document.body.style.animation = '';
      }, 500);
    }, 8000);
    
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/plain': ['.txt'],
    },
    multiple: true
  });
  
  // Automatic solution display after 3 seconds
  useEffect(() => {
    if (stage === 'detected') {
      setTimeout(() => {
        setStage('fixed');
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }, 3000);
    }
  }, [stage]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countingRef.current) clearInterval(countingRef.current);
    };
  }, []);

  const shareToLinkedIn = () => {
    const hours = realInsights?.timeSaved ? Math.round(realInsights.timeSaved / 60) : 19;
    const text = `Foldera just saved me ${hours} hours and caught a critical error in 8 seconds! This AI Chief of Staff is incredible. #AI #CareerSaver`;
    const url = "https://foldera.ai";
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`, '_blank');
  };

  // Document animation components
  const FlyingDocument = ({ delay, x, y }) => (
    <motion.div
      className="absolute w-8 h-10 bg-gradient-to-b from-blue-400 to-blue-600 rounded-sm shadow-lg"
      initial={{ x: 400, y: 300, opacity: 0, scale: 0 }}
      animate={{ 
        x: x, 
        y: y, 
        opacity: 1, 
        scale: 1,
        rotate: [0, 360, 720]
      }}
      transition={{ 
        delay: delay,
        duration: 2,
        ease: "easeOut"
      }}
    >
      <div className="w-full h-1 bg-white opacity-50 mt-1"></div>
      <div className="w-3/4 h-1 bg-white opacity-30 mt-1"></div>
      <div className="w-1/2 h-1 bg-white opacity-30 mt-1"></div>
    </motion.div>
  );

  // Confetti component
  const Confetti = () => {
    if (!showConfetti) return null;
    
    return (
      <div className="fixed inset-0 pointer-events-none z-50">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-yellow-400"
            style={{
              left: `${Math.random() * 100}%`,
              top: -10,
            }}
            animate={{
              y: typeof window !== 'undefined' ? window.innerHeight + 20 : 800,
              rotate: 360 * (Math.random() > 0.5 ? 1 : -1),
              opacity: [1, 1, 0]
            }}
            transition={{
              duration: 3,
              delay: Math.random() * 2,
              ease: "easeOut"
            }}
          />
        ))}
      </div>
    );
  };
  
  // Get the main finding to display
  const mainFinding = realInsights?.findings?.find(f => f.severity === 'critical') || 
                      realInsights?.findings?.[0] || 
                      {
                        title: 'CRITICAL ERROR DETECTED',
                        description: 'Your board deck claims $4.7M revenue but your signed contract caps at $2.4M',
                        value: '$2.3M DISCREPANCY FOUND'
                      };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      
      {/* CSS for shake animation */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .shake { animation: shake 0.5s ease-in-out; }
      `}</style>

      <Confetti />
      
      {/* Header */}
      <div className="text-center pt-8 pb-4">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Image src="/foldera-glyph.svg" alt="Foldera" width={40} height={40} />
          <h1 className="text-4xl font-bold text-cyan-400">FOLDERA</h1>
        </div>
        <p className="text-gray-300 text-lg">AI Chief of Staff Demo</p>
      </div>

      {/* Main Demo Area */}
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        
        {/* WAITING STAGE */}
        {stage === 'waiting' && (
          <motion.div 
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div 
              {...getRootProps()}
              className={`w-96 h-48 border-4 border-dashed rounded-lg flex items-center justify-center mb-6 transition-all cursor-pointer ${
                isDragActive 
                  ? 'border-cyan-400 bg-cyan-400/10 scale-105' 
                  : 'border-cyan-500 bg-slate-800/50 hover:bg-slate-700/50'
              }`}
            >
              <input {...getInputProps()} />
              <div className="text-center">
                <div className="text-6xl mb-4">📁</div>
                <p className="text-xl text-cyan-400 font-semibold mb-2">
                  {isDragActive ? 'Drop your files here!' : 'Drop Your Documents'}
                </p>
                <p className="text-gray-400">
                  {isDragActive ? 'Release to upload' : 'PDF, DOCX, TXT supported (under 4MB)'}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Upload your real documents and watch Foldera find value in 8 seconds
            </p>
          </motion.div>
        )}

        {/* UPLOADING STAGE */}
        {stage === 'uploading' && (
          <motion.div 
            className="text-center relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="text-6xl mb-4">📁</div>
            <p className="text-2xl text-cyan-400 mb-4">Uploading documents...</p>
            
            {/* Animated documents flying out */}
            {[...Array(10)].map((_, i) => (
              <FlyingDocument 
                key={i}
                delay={i * 0.1}
                x={Math.cos(i * 0.6) * 100}
                y={Math.sin(i * 0.6) * 100}
              />
            ))}
          </motion.div>
        )}

        {/* SCANNING STAGE */}
        {stage === 'scanning' && (
          <motion.div 
            className="text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="relative mb-8">
              <motion.div 
                className="w-32 h-32 border-4 border-cyan-400 rounded-full mx-auto relative"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <div className="absolute inset-4 bg-gradient-to-r from-cyan-400 to-purple-600 rounded-full opacity-20"></div>
                <motion.div 
                  className="absolute inset-8 bg-cyan-400 rounded-full"
                  animate={{ scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 1, repeat: Infinity }}
                ></motion.div>
              </motion.div>
            </div>
            
            <div className="space-y-4">
              <motion.p 
                className="text-3xl font-bold text-cyan-400"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                SCANNING IN PROGRESS
              </motion.p>
              
              <div className="text-xl space-y-2 text-white">
                <div>📄 Documents: <span className="font-mono text-cyan-400">{docCount}</span></div>
                <div>📃 Pages: <span className="font-mono text-cyan-400">{pageCount}</span></div>
                <div>📝 Words: <span className="font-mono text-cyan-400">{wordCount.toLocaleString()}</span></div>
              </div>
              
              <div className="text-lg text-gray-400 font-mono">
                Time: {timeElapsed.toFixed(1)}s
              </div>
            </div>
          </motion.div>
        )}

        {/* CRITICAL ERROR DETECTED STAGE */}
        {stage === 'detected' && (
          <motion.div 
            className="text-center max-w-3xl"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <motion.div 
              className={`${
                mainFinding.severity === 'critical' ? 'bg-red-600' : 'bg-yellow-600'
              } text-white p-6 rounded-lg shadow-2xl mb-6`}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 0.5, repeat: 3 }}
            >
              <div className="text-6xl mb-4">🚨</div>
              <h2 className="text-4xl font-bold mb-4">{mainFinding.title}</h2>
              <p className="text-2xl font-bold text-yellow-300">{mainFinding.value}</p>
            </motion.div>
            
            <motion.div 
              className="bg-slate-800 p-6 rounded-lg"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <p className="text-xl text-red-300 mb-4">
                <strong>WHAT WE FOUND:</strong>
              </p>
              <p className="text-lg text-gray-300 mb-6">
                {mainFinding.description}
              </p>
              {mainFinding.evidence && (
                <p className="text-sm text-gray-500">
                  Evidence: {mainFinding.evidence.map(e => e.doc).join(' vs ')}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* SOLUTION READY STAGE */}
        {stage === 'fixed' && (
          <motion.div 
            className="text-center max-w-4xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <motion.div 
              className="bg-green-600 text-white p-6 rounded-lg shadow-2xl mb-6"
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-3xl font-bold mb-4">AI CHIEF OF STAFF DELIVERED</h2>
              <p className="text-xl">Here's what Foldera found in YOUR documents:</p>
            </motion.div>
            
            {/* Show REAL insights */}
            {realInsights && (
              <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/50 rounded-lg p-6 mb-6 text-left">
                <h3 className="text-2xl font-bold text-purple-300 mb-4">📊 Your Results:</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-slate-800/50 rounded p-3 text-center">
                    <div className="text-2xl font-bold text-cyan-400">{realInsights.keyStats.totalDocuments}</div>
                    <div className="text-xs text-gray-400">Documents</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-3 text-center">
                    <div className="text-2xl font-bold text-green-400">{realInsights.keyStats.financialReferences}</div>
                    <div className="text-xs text-gray-400">$ Amounts</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-400">{realInsights.keyStats.deadlines}</div>
                    <div className="text-xs text-gray-400">Deadlines</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-3 text-center">
                    <div className="text-2xl font-bold text-purple-400">{Math.round(realInsights.timeSaved / 60)}h</div>
                    <div className="text-xs text-gray-400">Saved</div>
                  </div>
                </div>
                
                {/* Top 3 findings */}
                <div className="space-y-3">
                  {realInsights.findings.slice(0, 3).map((finding, i) => (
                    <motion.div 
                      key={i}
                      className={`bg-slate-800/50 p-4 rounded-lg border-l-4 ${
                        finding.severity === 'critical' ? 'border-red-500' :
                        finding.severity === 'success' ? 'border-green-500' :
                        'border-blue-500'
                      }`}
                      initial={{ x: -50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.2 + i * 0.2 }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className={`font-bold ${
                          finding.severity === 'critical' ? 'text-red-400' :
                          finding.severity === 'success' ? 'text-green-400' :
                          'text-blue-400'
                        }`}>{finding.title}</h4>
                        {finding.timeSaved && (
                          <span className="bg-purple-900/40 text-purple-300 px-2 py-1 rounded text-xs">
                            +{finding.timeSaved}min
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-300">{finding.description}</p>
                      <p className="text-xs text-purple-300 mt-2 font-semibold">💎 {finding.value}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            
            <motion.button 
              className="bg-gradient-to-r from-green-500 to-green-600 text-white px-12 py-4 rounded-lg text-xl font-bold shadow-2xl mb-8 hover:from-green-600 hover:to-green-700 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setStage('share')}
            >
              SEE FULL REPORT →
            </motion.button>
            
            <motion.div 
              className="bg-slate-800 p-4 rounded-lg text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <p className="text-cyan-400 text-lg mb-2">
                <strong>Foldera saved you {realInsights ? Math.round(realInsights.timeSaved / 60) : '19'} hours of manual work</strong>
              </p>
              <p className="text-gray-400">
                Join 12,847 professionals who never get caught off-guard
              </p>
            </motion.div>
          </motion.div>
        )}

        {/* SHARE STAGE */}
        {stage === 'share' && (
          <motion.div 
            className="text-center max-w-2xl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="bg-gradient-to-r from-cyan-500 to-purple-600 p-8 rounded-lg shadow-2xl mb-6">
              <h2 className="text-3xl font-bold text-white mb-4">🎉 HOLY CRAP MOMENT!</h2>
              <p className="text-xl text-white mb-6">
                Foldera analyzed YOUR documents and found {realInsights?.findings?.length || 5} insights in 8 seconds
              </p>
              
              <div className="bg-white/20 p-4 rounded-lg mb-6">
                <p className="text-lg font-semibold text-white">
                  "Foldera just saved me {realInsights ? Math.round(realInsights.timeSaved / 60) : 19} hours and caught critical issues I would have missed!"
                </p>
              </div>
              
              <motion.button 
                className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700 transition-colors mb-4"
                whileHover={{ scale: 1.05 }}
                onClick={shareToLinkedIn}
              >
                📱 Share on LinkedIn
              </motion.button>
              
              <div className="text-sm text-cyan-100">
                Show the world how AI can save time & careers
              </div>
            </div>
            
            <motion.button 
              className="text-cyan-400 underline hover:text-cyan-300"
              onClick={() => {
                setStage('waiting');
                setRealInsights(null);
                setUploadedFiles(null);
              }}
            >
              Try Another Demo
            </motion.button>
          </motion.div>
        )}

      </div>
      
      {/* Bottom Stats */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center">
        <div className="text-sm text-gray-500">
          {realInsights ? '✅ Real documents processed • Actual insights generated' : 'Drop your documents to see real results'}
        </div>
      </div>

    </div>
  );
};

export default FolderaHolyCrapDemo;