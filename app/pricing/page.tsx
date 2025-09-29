'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface Plan {
  id: string;
  name: string;
  price: number;
  documents: number;
  features: string[];
  popular?: boolean;
  stripePriceId?: string;
}

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    documents: 3,
    features: [
      '3 documents per month',
      'Basic conflict detection',
      'Email support',
      'Standard processing speed'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 79,
    documents: 100,
    features: [
      '100 documents per month',
      'Advanced AI analysis',
      'Priority support',
      'Real-time insights',
      'Export reports',
      'API access'
    ],
    popular: true,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || 'price_pro_placeholder'
  },
  {
    id: 'team',
    name: 'Team',
    price: 149,
    documents: 500,
    features: [
      '500 documents per month',
      'Everything in Pro',
      'Team collaboration',
      'Advanced analytics',
      'Custom integrations',
      'Dedicated account manager'
    ],
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID || 'price_team_placeholder'
  }
];

export default function PricingPage() {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpgrade = async (planId: string) => {
    setLoading(planId);

    try {
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          userId: 'demo-user-id', // Replace with actual user ID
          email: 'demo@example.com' // Replace with actual email
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

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
            <h1 className="text-4xl font-bold">Choose Your Plan</h1>
          </motion.div>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Get the document intelligence your business needs. Start free, upgrade as you grow.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center mb-12">
          <div className="bg-slate-800 rounded-lg p-1 flex">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`px-6 py-2 rounded-md transition-all ${
                billingInterval === 'monthly'
                  ? 'bg-cyan-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('yearly')}
              className={`px-6 py-2 rounded-md transition-all relative ${
                billingInterval === 'yearly'
                  ? 'bg-cyan-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Yearly
              <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-1 rounded">
                20% OFF
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative rounded-2xl p-8 border ${
                plan.popular
                  ? 'border-cyan-500 bg-gradient-to-b from-cyan-900/20 to-slate-900/50'
                  : 'border-slate-700 bg-slate-800/30'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </div>
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold">
                    ${billingInterval === 'yearly' ? Math.round(plan.price * 0.8) : plan.price}
                  </span>
                  <span className="text-gray-400">
                    /{billingInterval === 'yearly' ? 'year' : 'month'}
                  </span>
                </div>
                {billingInterval === 'yearly' && (
                  <div className="text-sm text-green-400">
                    Save ${plan.price * 0.2 * 12} per year
                  </div>
                )}
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                  <span className="text-lg font-semibold">{plan.documents} documents per month</span>
                </div>

                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span className="text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={loading === plan.id}
                className={`w-full py-4 rounded-lg font-semibold transition-all ${
                  plan.id === 'free'
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                }`}
              >
                {loading === plan.id ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </div>
                ) : plan.id === 'free' ? (
                  'Get Started Free'
                ) : (
                  `Upgrade to ${plan.name}`
                )}
              </button>
            </motion.div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>

          <div className="space-y-8">
            <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-cyan-400 mb-3">
                What happens if I exceed my document limit?
              </h3>
              <p className="text-gray-300">
                You'll be prompted to upgrade to the next tier. Your documents will be queued and processed once you upgrade.
                No data is lost, and you'll maintain access to all your previous analyses.
              </p>
            </div>

            <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-cyan-400 mb-3">
                Can I change my plan at any time?
              </h3>
              <p className="text-gray-300">
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately,
                and we'll prorate any billing adjustments for the current month.
              </p>
            </div>

            <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-cyan-400 mb-3">
                What file types do you support?
              </h3>
              <p className="text-gray-300">
                We support PDF, Word documents (.docx, .doc), Excel spreadsheets (.xlsx, .xls),
                and text files (.txt). Our AI engine can extract insights from all these formats.
              </p>
            </div>

            <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-cyan-400 mb-3">
                How secure is my data?
              </h3>
              <p className="text-gray-300">
                Your documents are encrypted in transit and at rest. We use enterprise-grade security
                and never share your data with third parties. Documents are automatically deleted after 30 days.
              </p>
            </div>

            <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-cyan-400 mb-3">
                What if I need more than 500 documents per month?
              </h3>
              <p className="text-gray-300">
                Contact our enterprise team for custom pricing. We offer unlimited plans,
                dedicated support, and custom integrations for high-volume users.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-16">
          <div className="bg-gradient-to-r from-cyan-900/30 to-purple-900/30 rounded-2xl p-12 border border-cyan-800">
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Join thousands of professionals who trust Foldera to find critical conflicts
              and save hours of manual document review.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => handleUpgrade('pro')}
                className="px-8 py-4 bg-gradient-to-r from-cyan-600 to-purple-600 text-white rounded-lg font-semibold text-lg hover:from-cyan-500 hover:to-purple-500 transition-all transform hover:scale-105"
              >
                Start Free Trial - No Credit Card Required
              </button>
              <button className="px-8 py-4 border border-slate-600 text-gray-300 rounded-lg font-semibold text-lg hover:bg-slate-800 transition-colors">
                Schedule Demo
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}