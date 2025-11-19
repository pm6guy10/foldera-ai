'use client'
import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Calendar, Mail, MessageSquare, Zap, Shield, Clock, User, FileText, Lightbulb, AlertTriangle } from 'lucide-react';
import { Hero } from './components/Hero';
import { GeniusSection } from './components/GeniusSection';
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
            <a 
                href="#waitlist" 
                className="px-5 py-2 bg-white text-black font-medium rounded-lg hover:bg-gray-100 transition-all duration-200"
            >
                Join Waitlist
            </a>
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
        <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-xl p-8 hover:border-white/20 transition-all duration-300">
            <p className="text-gray-300 text-lg leading-relaxed mb-6">"{quote}"</p>
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                    {author.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                    <p className="text-white font-medium">{author}</p>
                    <p className="text-gray-500 text-sm">{title}</p>
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
        <section ref={sectionRef} className="bg-black px-6 py-24">
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-16">
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
// OPS SAFETY SECTION
//================================================================================

const OpsSafetySection = () => {
    return (
        <section className="bg-black px-6 py-24">
            <div className="max-w-6xl mx-auto">
                <section className="mt-20 max-w-3xl mx-auto px-4 text-slate-200 space-y-4">
                    <p className="text-base sm:text-lg text-slate-300 mb-4">
                        Foldera protects you from the mistakes humans miss:
                    </p>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm md:text-base">
                        <li className="flex gap-2">• misaligned dates</li>
                        <li className="flex gap-2">• conflicting promises</li>
                        <li className="flex gap-2">• wrong numbers</li>
                        <li className="flex gap-2">• task drift</li>
                        <li className="flex gap-2">• buried deadlines</li>
                        <li className="flex gap-2">• contract inconsistencies</li>
                        <li className="flex gap-2">• Slack/email contradictions</li>
                        <li className="flex gap-2">• forgotten obligations</li>
                    </ul>
                    <p className="text-base sm:text-lg text-slate-300">
                        This is the engine that keeps your entire workday from breaking.
                    </p>
                </section>
            </div>
        </section>
    );
};

//================================================================================
// HOW IT WORKS SECTION
//================================================================================

const StepCard = ({ emoji, number, title, description }: { emoji: string; number: string; title: string; description: string }) => {
    return (
        <div className="relative">
            <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-xl p-8 hover:border-white/20 transition-all duration-300">
                <div className="text-5xl mb-6">{emoji}</div>
                <div className="text-4xl font-bold text-white/10 mb-4">{number}</div>
                <h3 className="text-white text-2xl font-bold mb-3">{title}</h3>
                <p className="text-gray-400 text-lg leading-relaxed">{description}</p>
            </div>
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
        <section ref={sectionRef} className="bg-gradient-to-b from-black to-gray-950 px-6 py-24">
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-16">
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
        <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-xl p-6 hover:border-indigo-500/30 transition-all duration-300">
            <div className="w-12 h-12 bg-indigo-600/20 rounded-lg flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-indigo-400" />
            </div>
            <h3 className="text-white text-xl font-bold mb-2">{title}</h3>
            <p className="text-gray-400 leading-relaxed">{description}</p>
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
        <section ref={sectionRef} className="bg-gray-950 px-6 py-24">
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-16">
                    What you get in every brief
                </h2>
                
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
// PROACTIVE VS REACTIVE SECTION
//================================================================================

const ProactiveSection = () => {
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
        <section ref={sectionRef} className="bg-black px-6 py-24">
            <div className={`max-w-5xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-16">
                    Proactive, not reactive
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Every other AI tool */}
                    <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-xl p-8">
                        <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-6">Every other AI tool</h3>
                        <div className="space-y-4 text-gray-400 leading-relaxed">
                            <p>→ You search it (Notion, Google)</p>
                            <p>→ You ask it questions (ChatGPT)</p>
                            <p>→ You review it after (Fireflies, Otter)</p>
                            <p className="text-gray-500 italic pt-4 border-t border-white/10">Reactive. Manual. Time-consuming.</p>
                        </div>
                    </div>

                    {/* Foldera */}
                    <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 border-2 border-indigo-500/30 rounded-xl p-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl" />
                        <h3 className="text-indigo-400 text-sm font-semibold uppercase tracking-wider mb-6">Foldera</h3>
                        <div className="relative z-10 space-y-4 text-white leading-relaxed">
                            <p>→ AI surfaces before you ask</p>
                            <p>→ Briefs arrive automatically</p>
                            <p>→ Intelligence before meetings, not after</p>
                            <p className="text-green-400 font-semibold pt-4 border-t border-white/10">Proactive. Automatic. Zero effort.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

//================================================================================
// ZERO-MISS OPS ENGINE SECTION
//================================================================================

const ZeroMissOpsSection = () => {
    return (
        <section className="bg-black px-6 py-24">
            <div className="max-w-6xl mx-auto">
                <div className="mt-24 mb-8 max-w-2xl mx-auto px-4 text-center space-y-2">
                    <h2 className="text-lg md:text-2xl font-semibold text-slate-50">
                        Zero-Miss Ops Engine (Beta)
                    </h2>
                    <p className="text-sm md:text-base text-slate-200/80">
                        Connect Gmail, Drive, and Slack.
                    </p>
                    <p className="text-sm md:text-base text-slate-200/80">
                        Foldera reads your work continuously and protects you from fire-starting mistakes.
                    </p>
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
        <section id="waitlist" className="bg-gradient-to-b from-black to-indigo-950 px-6 py-24">
            <div className="max-w-2xl mx-auto text-center">
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                    Join the waitlist
                </h2>
                <p className="text-xl text-gray-400 mb-10">
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
                            className="px-8 py-4 bg-white hover:bg-gray-100 text-black font-semibold rounded-lg transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {status === 'loading' ? 'Joining...' : 'Lock in early pricing'}
                        </button>
                    </form>
                )}
                
                <p className="text-sm text-gray-500">
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
            <main className="min-h-screen bg-slate-950 text-slate-50 antialiased">
                {/* reserve space for navbar */}
                <div className="pt-20 md:pt-24">
                    <div className="mx-auto flex max-w-5xl flex-col gap-14 px-4 pb-20 sm:px-6">
                        <Hero />
                        <GeniusSection />
                        <OpsSafetySection />
                        <HowItWorksSection />
                        <WhatYouGetSection />
                        <ProactiveSection />
                        <ZeroMissOpsSection />
                        <PricingSection />
                        <WaitlistSection />
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
