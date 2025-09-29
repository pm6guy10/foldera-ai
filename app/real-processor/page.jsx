'use client';
import RealDocumentProcessor from '../components/RealDocumentProcessor';
import Link from 'next/link';
import Image from 'next/image';

export default function RealProcessorPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navigation */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3 text-slate-400 hover:text-white transition-colors">
              <Image src="/foldera-glyph.svg" alt="Foldera" width={32} height={32} />
              <span>Foldera</span>
            </Link>
            
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors">
                Dashboard
              </Link>
              <Link href="/holy-crap" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors">
                Demo
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 py-16">
        <div className="max-w-4xl mx-auto text-center px-6">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            Real Document Processing
          </h1>
          <p className="text-xl text-slate-300 mb-8">
            Upload hundreds of actual business documents. Get real conflict detection, not theater.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <div className="text-3xl mb-3">📄</div>
              <h3 className="font-semibold text-white mb-2">Real File Processing</h3>
              <p className="text-sm text-slate-400">
                Actually parses PDFs, Word docs, Excel files. Extracts real text and data.
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <div className="text-3xl mb-3">🔍</div>
              <h3 className="font-semibold text-white mb-2">Actual Conflict Detection</h3>
              <p className="text-sm text-slate-400">
                Compares every document against every other document. Finds real contradictions.
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <div className="text-3xl mb-3">🤖</div>
              <h3 className="font-semibold text-white mb-2">AI Analysis</h3>
              <p className="text-sm text-slate-400">
                Claude API analyzes conflicts for business impact and recommends actions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Real Processor Component */}
      <div className="py-16">
        <RealDocumentProcessor />
      </div>

      {/* How It Works */}
      <div className="bg-slate-900/50 py-16">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-white mb-12">How It Actually Works</h2>
          
          <div className="space-y-8">
            <div className="flex items-start space-x-6">
              <div className="bg-cyan-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm flex-shrink-0">
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Upload Real Files</h3>
                <p className="text-slate-400">
                  Drag and drop hundreds of actual business documents - PDFs, Word docs, Excel files, text files. 
                  No fake demos, no mock data.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-6">
              <div className="bg-cyan-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm flex-shrink-0">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Extract Real Data</h3>
                <p className="text-slate-400">
                  Uses pdf-parse, mammoth, and other libraries to extract actual text from your documents. 
                  Finds dates, dollar amounts, deadlines, obligations, contacts.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-6">
              <div className="bg-cyan-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm flex-shrink-0">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Compare Every Document</h3>
                <p className="text-slate-400">
                  Algorithmically compares every document against every other document. 
                  Finds amount mismatches, date conflicts, contradictory obligations.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-6">
              <div className="bg-cyan-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm flex-shrink-0">
                4
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">AI Analysis</h3>
                <p className="text-slate-400">
                  Claude API analyzes the conflicts for business impact, risk assessment, 
                  and provides actionable recommendations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Technical Details */}
      <div className="py-16">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-white mb-12">Technical Implementation</h2>
          
          <div className="bg-slate-800/50 rounded-lg p-8 border border-slate-700">
            <h3 className="text-xl font-semibold text-white mb-4">File Processing</h3>
            <ul className="space-y-2 text-slate-400">
              <li>• <strong>PDFs:</strong> pdf-parse library extracts actual text content</li>
              <li>• <strong>Word Docs:</strong> mammoth library processes .docx and .doc files</li>
              <li>• <strong>Excel:</strong> xlsx library reads spreadsheet data</li>
              <li>• <strong>Text Files:</strong> Direct UTF-8 text extraction</li>
            </ul>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-8 border border-slate-700 mt-6">
            <h3 className="text-xl font-semibold text-white mb-4">Conflict Detection</h3>
            <ul className="space-y-2 text-slate-400">
              <li>• <strong>Amount Conflicts:</strong> Regex extraction of monetary values, comparison across documents</li>
              <li>• <strong>Date Conflicts:</strong> Multiple date format parsing, deadline comparison</li>
              <li>• <strong>Obligation Conflicts:</strong> Contradictory terms detection (exclusive vs non-exclusive)</li>
              <li>• <strong>Context Matching:</strong> Project names, contract references for relevant comparisons</li>
            </ul>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-8 border border-slate-700 mt-6">
            <h3 className="text-xl font-semibold text-white mb-4">AI Integration</h3>
            <ul className="space-y-2 text-slate-400">
              <li>• <strong>Claude API:</strong> Real API calls to Anthropic's Claude for business analysis</li>
              <li>• <strong>Context Understanding:</strong> AI interprets conflicts for business impact</li>
              <li>• <strong>Risk Assessment:</strong> Prioritizes conflicts by severity and business risk</li>
              <li>• <strong>Actionable Recommendations:</strong> Provides specific next steps for resolution</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-slate-400">
            This is real document processing, not a demo. Upload your actual files and see what conflicts Foldera finds.
          </p>
        </div>
      </footer>
    </div>
  );
}
