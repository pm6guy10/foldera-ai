'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Check, X } from 'lucide-react';
import { SUBSCRIPTION_PLANS, formatPrice } from '@/lib/billing/plans';

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  
  const handleSelectPlan = async (planId: string, priceId: string) => {
    if (planId === 'free') {
      window.location.href = '/dashboard';
      return;
    }
    
    setLoading(planId);
    
    try {
      // In a real app, get the actual user ID from auth
      const userId = 'demo-user-id'; // Replace with actual user ID from auth
      const email = 'demo@example.com'; // Replace with actual user email
      
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          email,
          planName: planId,
        }),
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };
  
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navigation */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3">
              <Image src="/foldera-glyph.svg" alt="Foldera" width={32} height={32} />
              <span className="font-semibold text-xl">Foldera</span>
            </Link>
            
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="px-4 py-2 text-slate-300 hover:text-white transition-colors">
                Dashboard
              </Link>
              <Link href="/" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
                Home
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 py-16 text-center">
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          Simple, Transparent Pricing
        </h1>
        <p className="text-xl text-slate-300 mb-4">
          Choose the plan that's right for you. Cancel anytime.
        </p>
        <p className="text-slate-400">
          All plans include conflict detection. Pro plans unlock AI analysis.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-slate-800/50 rounded-2xl p-8 border-2 transition-all ${
                plan.popular
                  ? 'border-cyan-500 shadow-2xl shadow-cyan-500/20 scale-105'
                  : 'border-slate-700 hover:border-slate-600'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    MOST POPULAR
                  </span>
                </div>
              )}
              
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-slate-400 mb-6">{plan.description}</p>
                
                <div className="mb-6">
                  <span className="text-5xl font-bold text-white">
                    {formatPrice(plan.price)}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-slate-400 ml-2">/month</span>
                  )}
                </div>
                
                <button
                  onClick={() => handleSelectPlan(plan.id, plan.priceId)}
                  disabled={loading === plan.id}
                  className={`w-full py-3 rounded-lg font-semibold transition-all ${
                    plan.popular
                      ? 'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  } ${loading === plan.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {loading === plan.id ? 'Processing...' : plan.id === 'free' ? 'Get Started' : 'Start Free Trial'}
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="border-t border-slate-700 pt-6">
                  <p className="text-sm font-semibold text-slate-400 mb-4">FEATURES</p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                      <span className="text-slate-300">
                        {plan.features.documentsPerMonth === 500 ? 'Unlimited' : plan.features.documentsPerMonth} documents/month
                      </span>
                    </div>
                    
                    <div className="flex items-center">
                      {plan.features.conflictDetection ? (
                        <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                      ) : (
                        <X className="w-5 h-5 text-slate-600 mr-3 flex-shrink-0" />
                      )}
                      <span className={plan.features.conflictDetection ? 'text-slate-300' : 'text-slate-600'}>
                        Conflict Detection
                      </span>
                    </div>
                    
                    <div className="flex items-center">
                      {plan.features.aiAnalysis ? (
                        <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                      ) : (
                        <X className="w-5 h-5 text-slate-600 mr-3 flex-shrink-0" />
                      )}
                      <span className={plan.features.aiAnalysis ? 'text-slate-300' : 'text-slate-600'}>
                        AI Analysis
                      </span>
                    </div>
                    
                    <div className="flex items-center">
                      {plan.features.advancedReporting ? (
                        <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                      ) : (
                        <X className="w-5 h-5 text-slate-600 mr-3 flex-shrink-0" />
                      )}
                      <span className={plan.features.advancedReporting ? 'text-slate-300' : 'text-slate-600'}>
                        Advanced Reporting
                      </span>
                    </div>
                    
                    <div className="flex items-center">
                      {plan.features.teamCollaboration ? (
                        <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                      ) : (
                        <X className="w-5 h-5 text-slate-600 mr-3 flex-shrink-0" />
                      )}
                      <span className={plan.features.teamCollaboration ? 'text-slate-300' : 'text-slate-600'}>
                        Team Collaboration
                      </span>
                    </div>
                    
                    <div className="flex items-center">
                      {plan.features.prioritySupport ? (
                        <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                      ) : (
                        <X className="w-5 h-5 text-slate-600 mr-3 flex-shrink-0" />
                      )}
                      <span className={plan.features.prioritySupport ? 'text-slate-300' : 'text-slate-600'}>
                        Priority Support
                      </span>
                    </div>
                    
                    <div className="flex items-center">
                      {plan.features.apiAccess ? (
                        <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                      ) : (
                        <X className="w-5 h-5 text-slate-600 mr-3 flex-shrink-0" />
                      )}
                      <span className={plan.features.apiAccess ? 'text-slate-300' : 'text-slate-600'}>
                        API Access
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-slate-900/50 py-24">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-white mb-12">
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-2">
                Can I change plans at any time?
              </h3>
              <p className="text-slate-300">
                Yes! You can upgrade, downgrade, or cancel your subscription at any time. 
                Changes take effect at the start of your next billing cycle.
              </p>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-2">
                What happens if I exceed my document limit?
              </h3>
              <p className="text-slate-300">
                You'll be prompted to upgrade to a higher tier. Free users can upgrade to Pro 
                for unlimited processing, or purchase additional document credits.
              </p>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-2">
                Is there a free trial?
              </h3>
              <p className="text-slate-300">
                Yes! All paid plans come with a 14-day free trial. No credit card required 
                to start the Free plan.
              </p>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-2">
                Do you offer enterprise plans?
              </h3>
              <p className="text-slate-300">
                Yes! Contact us for custom enterprise pricing with dedicated support, 
                SLA guarantees, and custom integrations.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="py-16 text-center">
        <h2 className="text-3xl font-bold text-white mb-6">
          Ready to prevent your next $2.3M mistake?
        </h2>
        <Link 
          href="/dashboard"
          className="inline-block px-8 py-4 bg-gradient-to-r from-cyan-600 to-purple-600 text-white rounded-xl font-semibold hover:from-cyan-500 hover:to-purple-500 transition-all"
        >
          Start Free Trial
        </Link>
      </div>
    </div>
  );
}
