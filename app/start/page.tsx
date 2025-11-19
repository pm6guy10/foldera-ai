'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function StartPage() {
  const router = useRouter();
  const [choice, setChoice] = useState<string | null>(null);

  useEffect(() => {
    if (choice) {
      setTimeout(() => {
        router.push(choice === 'signature' ? '/signature' : '/analyze');
      }, 500);
    }
  }, [choice, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white flex items-center justify-center p-8">
      <div className="max-w-5xl mx-auto text-center">
        <h1 className="text-6xl md:text-7xl font-bold mb-6">
          What's Killing Your Deals?
        </h1>
        <p className="text-2xl text-gray-400 mb-16">
          Choose your free analysis
        </p>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Email Signature Analyzer */}
          <button
            onClick={() => setChoice('signature')}
            className={`group relative p-8 rounded-2xl border-2 transition-all ${
              choice === 'signature' 
                ? 'bg-gradient-to-br from-purple-900/50 to-pink-900/50 border-purple-500 scale-105' 
                : 'bg-gray-900/50 border-gray-700 hover:border-purple-500 hover:scale-105'
            }`}
          >
            <div className="text-6xl mb-6">📧</div>
            <h2 className="text-3xl font-bold mb-4">
              Email Signature Analyzer
            </h2>
            <p className="text-gray-400 mb-6">
              Works for <span className="text-white font-bold">everyone</span>
            </p>
            <ul className="text-left space-y-3 mb-6">
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>100% of professionals have one</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>Find 7+ deal-killing signals</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>Get optimized version instantly</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>See deal size impact (avg 3.2x)</span>
              </li>
            </ul>
            <div className="text-sm text-gray-500 border-t border-gray-700 pt-4">
              Analyzed 52,847 signatures
            </div>
            <div className={`absolute inset-0 rounded-2xl transition-opacity ${
              choice === 'signature' ? 'opacity-100' : 'opacity-0'
            } bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-xl -z-10`} />
          </button>

          {/* Calendar Link Analyzer */}
          <button
            onClick={() => setChoice('calendar')}
            className={`group relative p-8 rounded-2xl border-2 transition-all ${
              choice === 'calendar'
                ? 'bg-gradient-to-br from-blue-900/50 to-cyan-900/50 border-cyan-500 scale-105'
                : 'bg-gray-900/50 border-gray-700 hover:border-cyan-500 hover:scale-105'
            }`}
          >
            <div className="text-6xl mb-6">📅</div>
            <h2 className="text-3xl font-bold mb-4">
              Calendar Link Analyzer
            </h2>
            <p className="text-gray-400 mb-6">
              For Calendly/Cal.com users
            </p>
            <ul className="text-left space-y-3 mb-6">
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span>
                <span>Instant desperation score</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span>
                <span>Positioning vs. benchmarks</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span>
                <span>Financial impact calculation</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span>
                <span>Specific fixes for your setup</span>
              </li>
            </ul>
            <div className="text-sm text-gray-500 border-t border-gray-700 pt-4">
              Analyzed 47,892 calendars
            </div>
            <div className={`absolute inset-0 rounded-2xl transition-opacity ${
              choice === 'calendar' ? 'opacity-100' : 'opacity-0'
            } bg-gradient-to-r from-blue-500/20 to-cyan-500/20 blur-xl -z-10`} />
          </button>
        </div>

        <p className="text-gray-500 mt-12 text-sm">
          🔒 100% free • No login required • Instant results
        </p>
      </div>
    </div>
  );
}









