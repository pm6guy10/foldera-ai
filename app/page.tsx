'use client'
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { CheckCircle, Calendar, Mail, MessageSquare, Zap, Shield, Clock, User, FileText, Lightbulb, AlertTriangle } from 'lucide-react';
import { Hero } from './components/Hero';
import { PricingSection } from './components/PricingSection';

//================================================================================
// HEADER
//================================================================================

const Header = () => (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-black/80 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
                <img src="/foldera-glyph.svg" alt="Foldera" width={28} height={28} />
                <span className="text-xl font-semibold text-white">Foldera</span>
            </div>
            <div className="flex items-center gap-4">
                <Link 
                    href="/api/auth/signin" 
                    className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                    Login
                </Link>
                <a 
                    href="#waitlist" 
                    className="px-5 py-2 bg-white text-black font-medium rounded-lg hover:bg-gray-100 transition-all duration-200"
                >
                    Join Waitlist
                </a>
            </div>
        </div>
    </nav>
);

//================================================================================
// HERO SECTION
//================================================================================

//================================================================================
// SOCIAL PROOF SECTION
//================================================================================

const TestimonialCard = ({ quote, author, title }: { quote: string; author: string; title: string }) => {
    return (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-10 shadow-lg">
            <p className="text-slate-200 text-xl leading-relaxed mb-6">"{quote}"</p>
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-white font-semibold">
                    {author.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                    <p className="text-white font-medium text-lg">{author}</p>
                    <p className="text-slate-400 text-lg">{title}</p>
                </div>
            </div>
        </div>
    );
};

const SocialProofSection = () => {
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                }
            },
            { threshold: 0.2 }
        );

        if (sectionRef.current) {
            observer.observe(sectionRef.current);
        }

        return () => {
            if (sectionRef.current) {
                observer.unobserve(sectionRef.current);
            }
        };
    }, []);

    return (
        <section ref={sectionRef} className="px-6 py-32">
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-4xl md:text-5xl font-bold text-white text-center mb-16">
                    The thing that makes you look like a genius
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <TestimonialCard 
                        quote="I walked into a client meeting and referenced an email from 6 weeks ago. They were stunned I remembered the detail. I didn't - Foldera did. Closed the deal that afternoon."
                        author="Sarah Chen"
                        title="VP Product at Apex Systems"
                    />
                    <TestimonialCard 
                        quote="The brief told me NOT to bring up budget - turned out their CFO had just resigned. Would've killed the conversation. This saved me from a massive landmine."
                        author="Marcus Webb"
                        title="Founder at BuildCo"
                    />
                    <TestimonialCard 
                        quote="In a board meeting, someone asked about a promise I'd made in Slack. Had zero memory of it. Foldera's brief from that morning had it listed. Looked like I had total command of every detail."
                        author="Alex Rivera"
                        title="CTO at DataFlow"
                    />
                </div>
            </div>
        </section>
    );
};

//================================================================================
// HOW IT WORKS SECTION
//================================================================================

const StepCard = ({ emoji, number, title, description }: { emoji: string; number: string; title: string; description: string }) => {
    return (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-10 shadow-lg">
                <div className="text-5xl mb-6">{emoji}</div>
                <div className="text-4xl font-bold text-white/10 mb-4">{number}</div>
                <h3 className="text-white text-2xl font-bold mb-3">{title}</h3>
            <p className="text-slate-400 text-lg leading-relaxed">{description}</p>
        </div>
    );
};

const HowItWorksSection = () => {
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                }
            },
            { threshold: 0.2 }
        );

        if (sectionRef.current) {
            observer.observe(sectionRef.current);
        }

        return () => {
            if (sectionRef.current) {
                observer.unobserve(sectionRef.current);
            }
        };
    }, []);

    return (
        <section ref={sectionRef} className="px-6 py-32">
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-4xl md:text-5xl font-bold text-white text-center mb-16">
                    You do nothing. AI does everything.
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <StepCard 
                        emoji="🔌"
                        number="01"
                        title="Connect once"
                        description="Link your calendar, email, and Slack in 2 minutes. That's it."
                    />
                    <StepCard 
                        emoji="🧠"
                        number="02"
                        title="AI reads everything"
                        description="Before each meeting, AI analyzes emails, messages, and history to find what matters."
                    />
                    <StepCard 
                        emoji="✨"
                        number="03"
                        title="Walk in prepared"
                        description="Get your brief 30 minutes early. Look like you spent hours reviewing. You spent zero."
                    />
                </div>
            </div>
        </section>
    );
};

//================================================================================
// WHAT YOU GET SECTION
//================================================================================

const BriefFeatureCard = ({ icon: Icon, title, description }: { icon: any; title: string; description: string }) => {
    return (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-10 shadow-lg">
            <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-cyan-500" />
            </div>
            <h3 className="text-white text-xl font-bold mb-2">{title}</h3>
            <p className="text-slate-400 text-lg leading-relaxed">{description}</p>
        </div>
    );
};

const WhatYouGetSection = () => {
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                }
            },
            { threshold: 0.2 }
        );

        if (sectionRef.current) {
            observer.observe(sectionRef.current);
        }

        return () => {
            if (sectionRef.current) {
                observer.unobserve(sectionRef.current);
            }
        };
    }, []);

    return (
        <section ref={sectionRef} className="px-6 py-32">
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-4xl md:text-5xl font-bold text-white text-center mb-16">
                    What you get in every brief
                </h2>
                <p className="text-center text-slate-400 text-lg mb-4">
                    Every brief is a pre-meeting safety check for broken promises, missing follow-ups, and conversational landmines.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <BriefFeatureCard 
                        icon={User}
                        title="Who they are"
                        description="Recent interactions, communication style, what they care about"
                    />
                    <BriefFeatureCard 
                        icon={FileText}
                        title="What you promised"
                        description="Open threads, pending tasks, commitments you made"
                    />
                    <BriefFeatureCard 
                        icon={Lightbulb}
                        title="What to say"
                        description="Key talking points, relevant context, opportunities to impress"
                    />
                    <BriefFeatureCard 
                        icon={AlertTriangle}
                        title="What to avoid"
                        description="Sensitive topics, recent frustrations, conversational landmines"
                    />
                </div>
            </div>
        </section>
    );
};

//================================================================================
// PRICING SECTION
//================================================================================
// PricingSection is now imported from ./components/PricingSection

//================================================================================
// WAITLIST SECTION
//================================================================================

const WaitlistSection = () => {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');

        try {
            const response = await fetch('/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            if (response.ok) {
                setStatus('success');
                setEmail('');
            }
        } catch (error) {
            console.error('Error submitting to waitlist:', error);
            setStatus('idle');
        }
    };

    return (
        <section id="waitlist" className="px-6 py-32">
            <div className="max-w-2xl mx-auto text-center">
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                    Join the waitlist
                </h2>
                <p className="text-slate-300 text-lg mb-6">
                    First 100 users get <span className="text-white font-semibold">$47/mo forever</span> (normally $97/mo)
                </p>
                
                {status === 'success' ? (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-8">
                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                        <p className="text-white text-lg font-semibold mb-2">You're on the list</p>
                        <p className="text-gray-400">We'll email you when it's your turn.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto mb-6">
                        <input 
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com"
                            required
                            className="flex-1 px-6 py-4 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <button 
                            type="submit"
                            disabled={status === 'loading'}
                            className="px-10 py-5 bg-white hover:bg-gray-100 text-black font-semibold rounded-lg transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {status === 'loading' ? 'Joining...' : 'Lock in early pricing'}
                        </button>
                    </form>
                )}
                
                <p className="text-slate-400 text-lg">
                    100% money-back guarantee once you're in. Your pricing never increases.
                </p>
            </div>
        </section>
    );
};

//================================================================================
// FOOTER
//================================================================================

const Footer = () => (
    <footer className="bg-black border-t border-white/10 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center space-x-2">
                <img src="/foldera-glyph.svg" alt="Foldera" width={24} height={24} />
                <span className="text-lg font-semibold text-white">Foldera</span>
            </div>
            <div className="text-gray-500 text-sm">© 2025 Foldera, Inc. All rights reserved.</div>
            <div className="flex space-x-6 text-sm">
                <a href="#" className="text-gray-500 hover:text-white transition">Privacy</a>
                <a href="#" className="text-gray-500 hover:text-white transition">Terms</a>
                <a href="#" className="text-gray-500 hover:text-white transition">Contact</a>
            </div>
        </div>
    </footer>
);

//================================================================================
// MAIN PAGE COMPONENT
//================================================================================

export default function HomePage() {
    return (
        <div className="bg-black text-white antialiased min-h-screen">
            <Header />
            <main className="min-h-screen bg-black text-white antialiased">
                <div className="pt-20 md:pt-24">
                    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-28 px-6 sm:px-10 pb-32">
                        <Hero />
                        <HowItWorksSection />
                <SocialProofSection />
                <WhatYouGetSection />
                <PricingSection />
                <WaitlistSection />
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
