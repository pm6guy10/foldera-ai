'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function Dashboard() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch the demo briefing
    fetch('/api/demo-briefing')
      .then(res => res.json())
      .then(data => {
        setBriefing(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <div className="text-white text-xl">🧠 Analyzing your documents...</div>
          <div className="text-slate-400 text-sm mt-2">This is what happens every night</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl mb-8">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Image 
                src="/foldera-glyph.svg" 
                alt="Foldera" 
                width={40} 
                height={40}
              />
              <div>
                <h1 className="text-2xl font-light text-white">☕ Your Morning Briefing</h1>
                <p className="text-sm text-slate-400">Your AI Chief of Staff</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-400">Monitoring Active</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <div className="text-6xl mb-4">🧠</div>
          <h1 className="text-4xl font-bold mb-4">Good Morning!</h1>
          <div className="text-gray-400 text-lg">
            Last night I monitored <span className="text-cyan-400 font-semibold">1,247 documents</span> and found{' '}
            <span className="text-red-400 font-semibold">{briefing?.conflicts?.length || 0} issues</span>:
          </div>
        </div>

        <div className="space-y-6">
          {briefing?.conflicts?.map(conflict => (
            <div key={conflict.id} className={`card-enhanced border-l-4 ${
              conflict.severity === 'critical' ? 'border-red-500 bg-red-500/10' : 'border-yellow-500 bg-yellow-500/10'
            }`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">
                    {conflict.severity === 'critical' ? '🚨' : '⚠️'}
                  </span>
                  <div>
                    <span className={`text-sm px-2 py-1 rounded ${
                      conflict.severity === 'critical' ? 'bg-red-900 text-red-300' : 'bg-yellow-900 text-yellow-300'
                    }`}>
                      {conflict.severity.toUpperCase()}
                    </span>
                    <h3 className="text-xl font-bold mt-2 text-white">{conflict.title}</h3>
                    <p className="text-gray-400 mt-1">{conflict.description}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-slate-200 mb-2 flex items-center">
                  <Image 
                    src="/foldera-glyph.svg" 
                    alt="" 
                    width={16} 
                    height={16}
                    className="mr-2"
                  />
                  Evidence:
                </h4>
                <div className="space-y-2">
                  <div className="text-sm text-slate-300 bg-slate-900/50 p-3 rounded border-l-2 border-slate-600">
                    📄 {conflict.evidence.doc1}
                  </div>
                  <div className="text-sm text-slate-300 bg-slate-900/50 p-3 rounded border-l-2 border-slate-600">
                    📄 {conflict.evidence.doc2}
                  </div>
                </div>
              </div>

              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-green-400 mb-2 flex items-center">
                  <span className="mr-2">✅</span>
                  Solution Ready:
                </h4>
                <p className="text-slate-200">{conflict.solution}</p>
              </div>

              <div className="flex gap-4">
                <button className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors transform hover:scale-105">
                  ✅ Approve Solution
                </button>
                <button className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors">
                  ❌ Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>

        {briefing?.conflicts?.length === 0 && (
          <div className="card-enhanced text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-xl font-medium text-white mb-2">All Clear!</h3>
            <p className="text-slate-400">
              No conflicts detected. Your documents are consistent.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
