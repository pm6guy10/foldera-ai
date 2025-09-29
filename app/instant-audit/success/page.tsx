'use client';
import Image from 'next/image';
import Link from 'next/link';

export default function InstantAuditSuccessPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navigation */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Link href="/" className="flex items-center space-x-3">
            <Image src="/foldera-glyph.svg" alt="Foldera" width={32} height={32} />
            <span className="font-semibold text-xl">Foldera</span>
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="text-6xl mb-8">🎉</div>
        
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
          Welcome to 24/7 Guardian!
        </h1>
        
        <p className="text-xl text-slate-300 mb-12">
          Your account is now protected. Foldera is monitoring your Gmail and Drive around the clock.
        </p>

        <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700 mb-12">
          <h2 className="text-2xl font-semibold text-white mb-6">What Happens Next</h2>
          
          <div className="space-y-4 text-left max-w-2xl mx-auto">
            <div className="flex items-start space-x-4">
              <div className="bg-green-500 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-white font-bold">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">Continuous Monitoring Activated</h3>
                <p className="text-slate-400">Foldera is now scanning all your Gmail and Drive activity in real-time.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="bg-green-500 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-white font-bold">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">Morning Briefings</h3>
                <p className="text-slate-400">Every morning at 7 AM, receive a briefing with any conflicts detected.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="bg-green-500 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-white font-bold">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">Instant Alerts</h3>
                <p className="text-slate-400">Critical conflicts trigger immediate notifications with pre-drafted solutions.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="bg-green-500 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-white font-bold">4</span>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">Dashboard Access</h3>
                <p className="text-slate-400">View all detected conflicts, history, and analytics in your dashboard.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/dashboard"
            className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-green-500/30 transform hover:scale-105 transition-all"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold transition-colors"
          >
            Back to Home
          </Link>
        </div>

        <div className="mt-12 text-sm text-slate-500">
          <p>Questions? Email us at support@foldera.ai</p>
          <p className="mt-2">
            Manage your subscription anytime from your{' '}
            <Link href="/dashboard" className="text-green-400 hover:underline">
              dashboard
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
