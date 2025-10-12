'use client'
import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Calendar, Mail, MessageSquare, Zap, Shield, Clock, User, FileText, Lightbulb, AlertTriangle } from 'lucide-react';

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

const HeroSection = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
    }, []);

    return (
        <section className="relative bg-black px-6 pt-32 pb-24 min-h-screen flex items-center">
            {/* Subtle gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-purple-950/20 via-black to-black pointer-events-none" />
            
            <div className="max-w-6xl mx-auto relative z-10 w-full">
                <div className={`text-center mb-16 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight leading-[1.1]">
                        Walk into every meeting<br />like you already know<br />everything
                    </h1>
                    <p className="text-xl md:text-2xl text-gray-400 mb-10 max-w-3xl mx-auto leading-relaxed">
                        Your AI chief of staff reads everything, connects the dots, and tells you exactly what to say—before you even ask
                    </p>
                    
                    <div className="flex flex-col items-center gap-4 mb-6">
                        <a 
                            href="#waitlist" 
                            className="inline-block px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-semibold rounded-lg transition-all duration-200 hover:-translate-y-0.5 shadow-2xl hover:shadow-indigo-500/50"
                        >
                            Never look unprepared again
                        </a>
                        <p className="text-sm text-gray-500">
                            🔒 Your data stays yours. We surface it, never store it.
                        </p>
                    </div>
                </div>

                {/* Meeting Brief Mockup */}
                <div className={`max-w-2xl mx-auto transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <div className="relative bg-gradient-to-br from-purple-900/40 via-gray-900 to-gray-900 border border-purple-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
                        {/* Glow effect */}
                        <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-2xl blur-xl" />
                        
                        <div className="relative">
                            {/* Header */}
                            <div className="flex items-start justify-between mb-6 pb-4 border-b border-white/10">
                                <div>
                                    <div className="flex items-center gap-2 text-white font-semibold text-lg mb-2">
                                        <Calendar className="w-5 h-5 text-purple-400" />
                                        Meeting with Sarah Chen - Q4 Planning Call
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                                        <Clock className="w-4 h-4" />
                                        Today at 2:30 PM (in 28 minutes)
                                    </div>
                                </div>
                            </div>
                            
                            {/* Key Context */}
                            <div className="mb-6">
                                <h3 className="text-yellow-400 text-xs font-bold uppercase tracking-wider mb-3">Key Context:</h3>
                                <div className="space-y-2 text-sm text-gray-300 leading-relaxed">
                                    <p>• Sarah mentioned budget constraints in email from Monday</p>
                                    <p>• You promised her the Q4 roadmap update 2 weeks ago (still pending)</p>
                                    <p>• Team headcount reduced last week (she's stressed about capacity)</p>
                                    <p>• Avoid Project Phoenix - she's frustrated by 3-week delay</p>
                                </div>
                            </div>
                            
                            {/* What to Say */}
                            <div className="mb-6">
                                <h3 className="text-green-400 text-xs font-bold uppercase tracking-wider mb-3">What to Say:</h3>
                                <div className="space-y-2 text-sm text-gray-300 leading-relaxed">
                                    <p>→ "I know resources are tight - here's how we can help..."</p>
                                    <p>→ "I have that roadmap update you asked for"</p>
                                    <p>→ "Given the headcount changes, here's how we're prioritizing"</p>
                                </div>
                            </div>
                            
                            {/* What to Avoid */}
                            <div>
                                <h3 className="text-red-400 text-xs font-bold uppercase tracking-wider mb-3">What to Avoid:</h3>
                                <div className="space-y-2 text-sm text-gray-300 leading-relaxed">
                                    <p>→ Don't bring up Project Phoenix timeline</p>
                                    <p>→ Don't ask for additional resources</p>
                                    <p>→ She's sensitive about budget with leadership</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

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
// PRICING SECTION
//================================================================================

const PricingSection = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [openFaq, setOpenFaq] = useState<number | null>(null);
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

    const faqs = [
        {
            q: "Why $97/mo normally?",
            a: "Because this replaces the work of an executive assistant who costs $6,000+/month. Even at $200/mo you're saving thousands. We're pricing at $97 to make it accessible to individual contributors and leaders alike. First 100 users lock in $47/mo forever as a thank you for believing early."
        },
        {
            q: "Can I pay annually?",
            a: "Yes. $470/year (vs $564 monthly) = 2 months free. Lock in early-bird pricing for life."
        },
        {
            q: "What if I only have a few meetings a week?",
            a: "If this saves you from one awkward moment, one forgotten commitment, or one missed opportunity, it's paid for itself. Most users say the first brief alone was worth a month's subscription. Plus you're locking in $47/mo forever - that's one coffee per week."
        },
        {
            q: "Is there a free trial?",
            a: "Not yet - we're in private beta with waitlist access only. But we offer 30-day money back guarantee once you're in."
        },
        {
            q: "Will the price go up?",
            a: "Yes. After first 100 users, new customers pay $97/mo. Early adopters are grandfathered at $47/mo forever. Your price never increases."
        },
        {
            q: "What about teams?",
            a: "Team pricing coming soon. Join waitlist to get early access and team discounts."
        }
    ];

    return (
        <section ref={sectionRef} id="pricing" className="bg-gradient-to-b from-gray-950 to-black px-6 py-24">
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                {/* Header */}
                <div className="text-center mb-16">
                    <p className="text-indigo-400 text-sm font-semibold uppercase tracking-wider mb-3">Simple, transparent pricing</p>
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        What's 10 minutes of looking<br />brilliant worth to you?
                    </h2>
                    <p className="text-xl text-gray-400">
                        Less than one dinner. More valuable than an executive assistant.
                    </p>
                </div>

                {/* Pricing Card */}
                <div className="max-w-lg mx-auto mb-20">
                    <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-900/20 border-2 border-indigo-500/30 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                        {/* Glow effect */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
                        
                        <div className="relative z-10">
                            {/* Badge */}
                            <div className="inline-block px-3 py-1 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 rounded-full mb-6">
                                <span className="text-yellow-400 text-xs font-semibold uppercase tracking-wider">🎯 Early Bird - First 100 Users</span>
                            </div>

                            <h3 className="text-2xl font-bold text-white mb-6">Overnight Opportunity Scanner</h3>

                            {/* Pricing */}
                            <div className="mb-6">
                                <div className="flex items-baseline gap-3 mb-2">
                                    <span className="text-3xl text-gray-500 line-through">$97</span>
                                    <span className="text-6xl font-bold text-green-400">$47</span>
                                    <span className="text-gray-400 text-xl">/month</span>
                                </div>
                                <p className="text-base text-white font-semibold mb-1">
                                    Lock in $47/mo forever
                                </p>
                                <p className="text-sm text-gray-400">
                                    Regular price $97/mo after first 100 users. Early adopters never pay more.
                                </p>
                            </div>

                            {/* Features */}
                            <div className="space-y-3 mb-8">
                                {[
                                    "Unlimited meeting briefs",
                                    "Email + Calendar + Slack integration",
                                    "30-minute advance prep notifications",
                                    "Mobile & email alerts",
                                    "AI-powered context analysis",
                                    "Relationship history tracking",
                                    "\"What to say\" & \"What to avoid\" guidance"
                                ].map((feature, idx) => (
                                    <div key={idx} className="flex items-start gap-3">
                                        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                                        <span className="text-gray-300">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Annual Option */}
                            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6">
                                <p className="text-white font-semibold mb-1">Pay annually: $470/year</p>
                                <p className="text-sm text-green-400">Save $94 - 2 months free</p>
                                <p className="text-xs text-gray-500 mt-1">Billed once per year, cancel anytime</p>
                            </div>

                            {/* CTA */}
                            <a 
                                href="#waitlist"
                                className="block w-full text-center px-8 py-4 bg-white hover:bg-gray-100 text-black text-lg font-bold rounded-lg transition-all duration-200 hover:-translate-y-0.5 shadow-2xl mb-3"
                            >
                                Join Waitlist - Lock in $47/mo
                            </a>
                            <p className="text-center text-sm text-gray-400">
                                🔒 Your data stays yours. Cancel anytime.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Value Anchors */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
                    <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-xl p-6 text-center">
                        <div className="text-4xl mb-4">💼</div>
                        <h4 className="text-white font-semibold mb-3">Replaces</h4>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Executive Assistant: <span className="text-white font-semibold">$6,600/mo</span><br />
                            Your prep time: <span className="text-white font-semibold">$2,000/mo</span><br />
                            <span className="text-green-400 font-semibold">Total: $8,600/mo saved</span>
                        </p>
                    </div>

                    <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-xl p-6 text-center">
                        <div className="text-4xl mb-4">⚡</div>
                        <h4 className="text-white font-semibold mb-3">ROI</h4>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            One avoided mistake pays for 12+ months<br />
                            One impressed stakeholder = priceless<br />
                            <span className="text-green-400 font-semibold">First week or money back</span>
                        </p>
                    </div>

                    <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-xl p-6 text-center">
                        <div className="text-4xl mb-4">🎯</div>
                        <h4 className="text-white font-semibold mb-3">Compare</h4>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Fireflies (reactive): $19/mo<br />
                            Motion (no intel): $34/mo<br />
                            Actual EA: $6,600/mo<br />
                            <span className="text-green-400 font-semibold">Foldera: $47/mo</span>
                        </p>
                    </div>
                </div>

                {/* Comparison Table */}
                <div className="max-w-5xl mx-auto mb-20">
                    <h3 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
                        You're Already Paying For This (Just Badly)
                    </h3>
                    
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left py-4 px-4 text-gray-400 font-medium"></th>
                                    <th className="text-left py-4 px-4 text-gray-400 font-medium">Other AI Tools</th>
                                    <th className="text-left py-4 px-4 text-gray-400 font-medium">Executive Assistant</th>
                                    <th className="text-left py-4 px-4 text-white font-semibold bg-gradient-to-br from-indigo-900/30 to-transparent rounded-t-lg">Foldera</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-white/5">
                                    <td className="py-4 px-4 text-white font-medium">Cost</td>
                                    <td className="py-4 px-4 text-gray-400">$50-100/mo across 5 tools</td>
                                    <td className="py-4 px-4 text-gray-400">$6,600/mo</td>
                                    <td className="py-4 px-4 text-green-400 font-semibold bg-gradient-to-br from-indigo-900/20 to-transparent">$47/mo</td>
                                </tr>
                                <tr className="border-b border-white/5">
                                    <td className="py-4 px-4 text-white font-medium">Pre-meeting prep</td>
                                    <td className="py-4 px-4"><span className="text-red-400 text-xl">❌</span> <span className="text-gray-400">Manual</span></td>
                                    <td className="py-4 px-4"><span className="text-green-400 text-xl">✅</span> <span className="text-gray-400">If you brief them</span></td>
                                    <td className="py-4 px-4 bg-gradient-to-br from-indigo-900/20 to-transparent"><span className="text-green-400 text-xl">✅</span> <span className="text-white font-medium">Automatic</span></td>
                                </tr>
                                <tr className="border-b border-white/5">
                                    <td className="py-4 px-4 text-white font-medium">Knows context</td>
                                    <td className="py-4 px-4"><span className="text-red-400 text-xl">❌</span> <span className="text-gray-400">Siloed</span></td>
                                    <td className="py-4 px-4"><span className="text-yellow-400 text-xl">⚠️</span> <span className="text-gray-400">Only what you tell them</span></td>
                                    <td className="py-4 px-4 bg-gradient-to-br from-indigo-900/20 to-transparent"><span className="text-green-400 text-xl">✅</span> <span className="text-white font-medium">Reads everything</span></td>
                                </tr>
                                <tr className="border-b border-white/5">
                                    <td className="py-4 px-4 text-white font-medium">Available 24/7</td>
                                    <td className="py-4 px-4"><span className="text-red-400 text-xl">❌</span> <span className="text-gray-400">You are 24/7</span></td>
                                    <td className="py-4 px-4"><span className="text-red-400 text-xl">❌</span> <span className="text-gray-400">Work hours only</span></td>
                                    <td className="py-4 px-4 bg-gradient-to-br from-indigo-900/20 to-transparent"><span className="text-green-400 text-xl">✅</span> <span className="text-white font-medium">Always on</span></td>
                                </tr>
                                <tr>
                                    <td className="py-4 px-4 text-white font-medium">Proactive</td>
                                    <td className="py-4 px-4"><span className="text-red-400 text-xl">❌</span> <span className="text-gray-400">You search</span></td>
                                    <td className="py-4 px-4"><span className="text-yellow-400 text-xl">⚠️</span> <span className="text-gray-400">If they remember</span></td>
                                    <td className="py-4 px-4 bg-gradient-to-br from-indigo-900/20 to-transparent rounded-b-lg"><span className="text-green-400 text-xl">✅</span> <span className="text-white font-medium">Surfaces automatically</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Simplified Version */}
                    <div className="md:hidden space-y-6">
                        <div className="bg-gradient-to-br from-indigo-900/30 to-black border-2 border-indigo-500/30 rounded-xl p-6">
                            <h4 className="text-white font-bold text-lg mb-4">Foldera</h4>
                            <div className="space-y-3">
                                <div className="flex items-start gap-2">
                                    <span className="text-green-400 text-xl flex-shrink-0">✅</span>
                                    <span className="text-white"><span className="font-semibold">$47/mo</span> for everything</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-green-400 text-xl flex-shrink-0">✅</span>
                                    <span className="text-white">Automatic pre-meeting prep</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-green-400 text-xl flex-shrink-0">✅</span>
                                    <span className="text-white">Reads all your context</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-green-400 text-xl flex-shrink-0">✅</span>
                                    <span className="text-white">24/7 always on</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-xl p-4">
                                <h4 className="text-gray-400 font-medium mb-3">Other AI Tools</h4>
                                <p className="text-white font-semibold mb-2">$50-100/mo</p>
                                <div className="space-y-2 text-sm">
                                    <p className="text-gray-400"><span className="text-red-400">❌</span> Manual</p>
                                    <p className="text-gray-400"><span className="text-red-400">❌</span> Siloed</p>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-xl p-4">
                                <h4 className="text-gray-400 font-medium mb-3">Executive Assistant</h4>
                                <p className="text-white font-semibold mb-2">$6,600/mo</p>
                                <div className="space-y-2 text-sm">
                                    <p className="text-gray-400"><span className="text-green-400">✅</span> Does prep</p>
                                    <p className="text-gray-400"><span className="text-red-400">❌</span> Work hours</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* FAQ */}
                <div className="max-w-3xl mx-auto">
                    <h3 className="text-3xl font-bold text-white text-center mb-10">Pricing Questions</h3>
                    <div className="space-y-4">
                        {faqs.map((faq, idx) => (
                            <div 
                                key={idx}
                                className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-xl overflow-hidden"
                            >
                                <button
                                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                                    className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                                >
                                    <span className="text-white font-semibold">{faq.q}</span>
                                    <span className={`text-gray-400 transition-transform ${openFaq === idx ? 'rotate-180' : ''}`}>
                                        ▼
                                    </span>
                                </button>
                                {openFaq === idx && (
                                    <div className="px-6 pb-4 pt-2">
                                        <p className="text-gray-400 leading-relaxed">{faq.a}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

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
            <main>
                <HeroSection />
                <SocialProofSection />
                <HowItWorksSection />
                <WhatYouGetSection />
                <ProactiveSection />
                <PricingSection />
                <WaitlistSection />
            </main>
            <Footer />
        </div>
    );
}
