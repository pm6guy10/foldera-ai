'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

export default function ConnectorsVsUploadPage() {
  const [showUploadDemo, setShowUploadDemo] = useState(false);
  const [showConnectorsDemo, setShowConnectorsDemo] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-3 mb-6"
          >
            <Image src="/foldera-glyph.svg" alt="Foldera" width={48} height={48} />
            <h1 className="text-4xl font-bold">Upload vs Connect: The Future of Document Intelligence</h1>
          </motion.div>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Traditional AI tools require you to manually upload documents. Foldera connects to your live data sources for continuous, proactive insights.
          </p>
        </div>

        {/* Comparison Cards */}
        <div className="grid lg:grid-cols-2 gap-8 mb-16">

          {/* Upload Approach */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-slate-800/30 rounded-2xl p-8 border border-slate-700"
          >
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">📁</div>
              <h2 className="text-2xl font-bold text-red-400 mb-2">Traditional Upload Approach</h2>
              <p className="text-gray-400">What most AI tools still do</p>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-red-400 rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-red-300">Manual Effort Required</h3>
                  <p className="text-sm text-gray-400">You have to remember to upload files</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-red-400 rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-red-300">Stale Data</h3>
                  <p className="text-sm text-gray-400">Insights based on old information</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-red-400 rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-red-300">One-Time Analysis</h3>
                  <p className="text-sm text-gray-400">No ongoing monitoring or updates</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-red-400 rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-red-300">Limited Context</h3>
                  <p className="text-sm text-gray-400">Can't see connections between tools</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowUploadDemo(true)}
              className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
            >
              See Upload Demo →
            </button>
          </motion.div>

          {/* Connectors Approach */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-slate-800/30 rounded-2xl p-8 border border-green-500"
          >
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">🔗</div>
              <h2 className="text-2xl font-bold text-green-400 mb-2">Live Data Connectors</h2>
              <p className="text-gray-400">Foldera's breakthrough approach</p>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-green-300">Zero Ongoing Effort</h3>
                  <p className="text-sm text-gray-400">Connect once, get continuous insights</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-green-300">Real-Time Monitoring</h3>
                  <p className="text-sm text-gray-400">Live data streams, instant conflict detection</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-green-300">Continuous Insights</h3>
                  <p className="text-sm text-gray-400">Proactive alerts and ongoing analysis</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-green-300">Cross-Source Intelligence</h3>
                  <p className="text-sm text-gray-400">Connects calendar + email + CRM + project tools</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowConnectorsDemo(true)}
              className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors"
            >
              See Live Connectors Demo →
            </button>
          </motion.div>
        </div>

        {/* Demo Modals */}
        {showUploadDemo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowUploadDemo(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-800 rounded-lg p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-red-400 mb-4">📁 Upload Demo</h3>
              <div className="space-y-3 text-sm text-gray-300">
                <p>1. User manually uploads Q4 documents</p>
                <p>2. AI analyzes static files</p>
                <p>3. Finds one conflict (if any)</p>
                <p>4. User forgets to upload next quarter</p>
                <p>5. No ongoing monitoring</p>
              </div>
              <div className="mt-6 text-center">
                <p className="text-red-400 font-semibold">Result: One-time analysis, easy to forget</p>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showConnectorsDemo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowConnectorsDemo(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-800 rounded-lg p-8 max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-green-400 mb-4">🔗 Live Connectors Demo</h3>
              <div className="space-y-3 text-sm text-gray-300">
                <p>1. One-click connect to Google Calendar</p>
                <p>2. Real-time monitoring begins immediately</p>
                <p>3. Finds: "Double-booked with client call"</p>
                <p>4. Next day: "Board meeting but no prep time"</p>
                <p>5. Weekly: "Overloaded Tuesday - reschedule?"</p>
                <p>6. Monthly: "Recurring pattern detected"</p>
              </div>
              <div className="mt-6 text-center">
                <p className="text-green-400 font-semibold">Result: Continuous value, becomes habit</p>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* The Breakthrough */}
        <div className="bg-gradient-to-r from-cyan-900/30 to-purple-900/30 rounded-2xl p-8 border border-cyan-800 mb-16">
          <h2 className="text-3xl font-bold text-center mb-8">🎯 The Breakthrough Insight</h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold text-red-400 mb-4">❌ Upload Model Problems</h3>
              <ul className="space-y-2 text-gray-300">
                <li>• Requires user effort every time</li>
                <li>• Stale data, missed opportunities</li>
                <li>• One-time insights, no continuity</li>
                <li>• Limited context across tools</li>
                <li>• Easy to forget or ignore</li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-green-400 mb-4">✅ Connector Model Solutions</h3>
              <ul className="space-y-2 text-gray-300">
                <li>• Zero ongoing effort required</li>
                <li>• Real-time data, instant alerts</li>
                <li>• Continuous monitoring and insights</li>
                <li>• Cross-source intelligence</li>
                <li>• Becomes part of daily workflow</li>
              </ul>
            </div>
          </div>

          <div className="text-center mt-8">
            <p className="text-lg text-cyan-300 mb-4">
              <strong>Traditional AI:</strong> "Upload your documents and we'll analyze them"<br/>
              <strong>Foldera:</strong> "Connect your tools and we'll monitor everything automatically"
            </p>
            <a
              href="/connectors"
              className="inline-block px-8 py-4 bg-gradient-to-r from-cyan-600 to-purple-600 text-white rounded-lg font-semibold hover:from-cyan-500 hover:to-purple-500 transition-all transform hover:scale-105"
            >
              Experience Live Connectors →
            </a>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to Experience the Future?</h2>
          <p className="text-gray-300 mb-8 max-w-2xl mx-auto">
            Connect your Google Calendar in one click and see how Foldera finds conflicts you never noticed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/connectors"
              className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-lg font-semibold hover:from-green-500 hover:to-emerald-400 transition-all transform hover:scale-105"
            >
              🔗 Try Live Connectors
            </a>
            <a
              href="/holy-crap"
              className="px-8 py-4 bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-lg font-semibold hover:from-red-500 hover:to-orange-400 transition-all transform hover:scale-105"
            >
              🚨 See Upload Demo
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
