'use client'
import React, { useState, useEffect, useRef } from 'react';
import {
    CheckCircle,
    ArrowRight,
    TrendingUp,
    Shield,
    Zap,
    Clock
} from 'lucide-react';

//================================================================================
// HEADER
//================================================================================

const Header = () => (
    <nav className="sticky top-0 z-40 backdrop-blur-lg bg-slate-900/95 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
                <a href="/" className="flex items-center space-x-2">
                    <img src="/foldera-glyph.svg" alt="Foldera Logo" width={32} height={32} />
                    <span className="text-xl font-semibold text-white">Foldera</span>
                </a>
                <div className="hidden md:flex items-center space-x-8">
                    <a href="#pricing" className="text-slate-300 hover:text-white transition">Pricing</a>
                    <a href="/dashboard" className="px-6 py-2.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(124,58,237,0.4)]">
                        Start Free Trial
                    </a>
                </div>
            </div>
        </div>
    </nav>
);

//================================================================================
// HERO SECTION
//================================================================================

const MetricCard = ({ emoji, title, subtitle, color }) => {
    return (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-slate-600 transition-all hover:-translate-y-2 hover:shadow-2xl">
            <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{emoji}</span>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> LIVE
                </span>
            </div>
            <p className={`text-2xl font-bold ${color} mb-2`}>
                {title}
            </p>
            <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
    );
};

const HeroSection = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
    }, []);

    return (
        <section className="relative bg-gradient-to-b from-slate-900 to-slate-950 px-6 py-20 md:py-32 overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-900/10 via-transparent to-orange-900/10" />
            
            <div className="max-w-6xl mx-auto relative z-10">
                <div className={`text-center mb-16 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                        Wake Up to <span className="text-amber-400">$400K+</span> in Hidden Revenue Every Morning.
                    </h1>
                    <p className="text-lg md:text-2xl text-slate-300 mb-10 max-w-4xl mx-auto leading-relaxed">
                        Foldera's AI scans your CRM overnight and emails you a briefing of at-risk accounts, cross-sell opportunities, and revenue leaks. No meetings. No manual work. Just money you'd have missed.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-center mb-8">
                        <a href="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white text-lg font-semibold rounded-lg shadow-2xl transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(124,58,237,0.4)] inline-flex items-center justify-center gap-2">
                            Start Free 14-Day Trial <ArrowRight className="w-5 h-5" />
                        </a>
                        <a href="#solution" className="w-full sm:w-auto px-8 py-4 bg-transparent hover:bg-slate-800 text-white text-lg font-semibold rounded-lg border-2 border-slate-600 hover:border-slate-500 transition-all transform hover:scale-105 inline-flex items-center justify-center">
                            See How It Works
                        </a>
                    </div>
                    
                    <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
                        <span className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            Connects in 2 minutes
                        </span>
                        <span className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            Read-only access
                        </span>
                        <span className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            Cancel anytime
                        </span>
                    </div>
                </div>

                {/* Dashboard Preview */}
                <div className={`transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-4 md:p-8 border border-slate-700 shadow-2xl overflow-x-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 min-w-[320px]">
                            <MetricCard 
                                emoji="💰" 
                                title="$425,121" 
                                subtitle="Cross-sell opportunities"
                                color="text-green-400" 
                            />
                            <MetricCard 
                                emoji="⚠️" 
                                title="$589,860" 
                                subtitle="At-risk revenue"
                                color="text-orange-400" 
                            />
                            <MetricCard 
                                emoji="💸" 
                                title="$156,400" 
                                subtitle="Revenue recovery"
                                color="text-amber-400" 
                            />
                            <MetricCard 
                                emoji="⏱️" 
                                title="18 hours" 
                                subtitle="Time saved this week"
                                color="text-purple-400" 
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

//================================================================================
// PROBLEM SECTION
//================================================================================

const ProblemCard = ({ emoji, amount, title, description }) => {
    return (
        <div className="bg-white rounded-xl p-8 border border-gray-200 hover:border-amber-300 transition-all hover:-translate-y-2 hover:shadow-2xl">
            <div className="text-4xl mb-4">{emoji}</div>
            <h3 className="text-3xl md:text-4xl font-bold text-amber-500 mb-3">{amount}</h3>
            <h4 className="text-xl font-semibold text-slate-900 mb-3">{title}</h4>
            <p className="text-slate-600 leading-relaxed">{description}</p>
        </div>
    );
};

const ProblemSection = () => {
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef(null);

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
        <section ref={sectionRef} className="bg-slate-50 px-6 py-24 relative">
            {/* Gradient transition from dark to light */}
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-slate-950 to-transparent pointer-events-none" />
            
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900 text-center mb-4">
                    You're Leaving <span className="text-amber-500">$1M+</span> on the Table
                </h2>
                <p className="text-lg md:text-xl text-slate-600 text-center mb-16">(And You Don't Even Know It)</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <ProblemCard 
                        emoji="💸"
                        amount="$425K in Missed Cross-Sells"
                        title="Lost Revenue"
                        description="Your customers are ready to upgrade but nobody's tracking contract renewal windows or usage patterns."
                    />
                    <ProblemCard 
                        emoji="⚠️"
                        amount="$589K Walking Out the Door"
                        title="Silent Churn"
                        description="Churn signals are showing up in CRM activity—declining usage, support escalations, silent stakeholders."
                    />
                    <ProblemCard 
                        emoji="⏰"
                        amount="18 Hours Per Week Lost"
                        title="Wasted Time"
                        description="Your team digs through CRM data hunting for insights while your competitors close deals. That's $140K/year in wasted salary."
                    />
                </div>
            </div>
        </section>
    );
};

//================================================================================
// SOLUTION SECTION
//================================================================================

const StepCard = ({ number, title, description, isLast }) => {
    return (
        <div className="relative">
            <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 hover:border-purple-600 transition-all hover:-translate-y-2 hover:shadow-2xl">
                <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold mb-6">
                    {number}
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">{title}</h3>
                <p className="text-slate-400 leading-relaxed">{description}</p>
            </div>
            {!isLast && (
                <div className="hidden lg:block absolute top-1/2 -right-8 transform -translate-y-1/2">
                    <ArrowRight className="w-16 h-16 text-purple-600" />
        </div>
            )}
    </div>
);
};

const SolutionSection = () => {
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef(null);

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
        <section ref={sectionRef} id="solution" className="bg-slate-900 px-6 py-24">
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-3xl md:text-5xl font-bold text-white text-center mb-16">
                    How Foldera Finds Money While You Sleep
                </h2>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-16">
                    <StepCard 
                        number="1"
                        title="Connect Your CRM (2 minutes)"
                        description="OAuth into Salesforce or HubSpot. We pull read-only data—no writes, no risk."
                    />
                    <StepCard 
                        number="2"
                        title="AI Scans Overnight (Every night at 2 AM)"
                        description="Our AI analyzes every account, deal, and activity, looking for revenue signals humans miss."
                    />
                    <StepCard 
                        number="3"
                        title="Wake Up to Opportunities (In your inbox at 7 AM)"
                        description="Get a briefing with specific actions: 'Call Acme Corp about $125K upsell' with full context + confidence score."
                        isLast={true}
                    />
                </div>
            </div>
        </section>
    );
};

//================================================================================
// DASHBOARD SHOWCASE SECTION
//================================================================================

const DashboardShowcase = () => {
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef(null);

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
        <section ref={sectionRef} className="bg-purple-50 px-6 py-24 relative">
            {/* Gradient transition from dark to light */}
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-slate-900 to-transparent pointer-events-none" />
            
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900 text-center mb-16">
                    Your Overnight Opportunity Scan
                </h2>
                
                <div className="bg-white rounded-2xl p-4 md:p-8 border border-purple-200 shadow-2xl mb-8 overflow-x-auto">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 pb-6 border-b border-gray-200 gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-base md:text-lg font-semibold text-slate-900">All Systems Healthy</span>
                        </div>
                        <span className="text-xs md:text-sm text-slate-600">Last scan: 2:00 AM</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 min-w-[320px]">
                        <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-6 border border-gray-200 shadow-md">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-2xl">🎯</span>
                                <span className="text-xs text-slate-500 font-semibold">OPPORTUNITY</span>
                            </div>
                            <p className="text-4xl font-bold text-green-600 mb-2" style={{ textShadow: '0 0 20px rgba(245, 158, 11, 0.3)' }}>$425,121</p>
                            <p className="text-sm text-slate-700 font-medium">Cross-sell Opportunity</p>
                            <p className="text-xs text-slate-500 mt-2">3 customers ready to upgrade</p>
                        </div>
                        
                        <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-6 border border-gray-200 shadow-md">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-2xl">⚠️</span>
                                <span className="text-xs text-slate-500 font-semibold">AT RISK</span>
                            </div>
                            <p className="text-4xl font-bold text-orange-500 mb-2" style={{ textShadow: '0 0 20px rgba(245, 158, 11, 0.3)' }}>$589,860</p>
                            <p className="text-sm text-slate-700 font-medium">At-Risk Revenue</p>
                            <p className="text-xs text-slate-500 mt-2">2 customers declining usage</p>
                        </div>
                        
                        <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-6 border border-gray-200 shadow-md">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-2xl">💰</span>
                                <span className="text-xs text-slate-500 font-semibold">RECOVERY</span>
                            </div>
                            <p className="text-4xl font-bold text-amber-500 mb-2" style={{ textShadow: '0 0 20px rgba(245, 158, 11, 0.3)' }}>$156,400</p>
                            <p className="text-sm text-slate-700 font-medium">Revenue Recovery</p>
                            <p className="text-xs text-slate-500 mt-2">5 billing errors detected</p>
            </div>

                        <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-6 border border-gray-200 shadow-md">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-2xl">⏱️</span>
                                <span className="text-xs text-slate-500 font-semibold">EFFICIENCY</span>
                            </div>
                            <p className="text-4xl font-bold text-purple-600 mb-2" style={{ textShadow: '0 0 20px rgba(245, 158, 11, 0.3)' }}>18 hours</p>
                            <p className="text-sm text-slate-700 font-medium">Time Saved</p>
                            <p className="text-xs text-slate-500 mt-2">Analysis done overnight</p>
                        </div>
                    </div>
                </div>
                
                <div className="text-center">
                    <p className="text-lg text-slate-700 italic">
                        This is what landed in Sarah Chen's inbox this morning. Her team closed the <span className="text-amber-600 font-semibold">$125K Acme Corp upsell</span> by 10 AM.
                    </p>
                </div>
            </div>
        </section>
    );
};

//================================================================================
// TESTIMONIALS SECTION
//================================================================================

const TestimonialCard = ({ quote, author, company, metrics }) => {
    return (
        <div className="bg-white rounded-xl p-8 border border-gray-200 hover:border-purple-300 transition-all hover:-translate-y-2 hover:shadow-2xl">
            <div className="mb-6">
                <p className="text-lg text-purple-700 leading-relaxed mb-6 font-medium">"{quote}"</p>
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {author.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                        <p className="text-slate-900 font-semibold">{author}</p>
                        <p className="text-sm text-slate-600">{company}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3">
                    {metrics.map((metric, idx) => (
                        <span key={idx} className="px-3 py-1 bg-green-50 border border-green-300 rounded-full text-xs text-green-700 font-medium">
                            {metric}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

const TestimonialsSection = () => {
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef(null);

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
        <section ref={sectionRef} className="bg-slate-50 px-6 py-24 relative">
            {/* Gradient transition from light purple to light gray */}
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-purple-50 to-transparent pointer-events-none" />
            
            <div className={`max-w-6xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900 text-center mb-16">
                    Real Teams Finding Real Revenue
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <TestimonialCard 
                        quote="Foldera found $280K in at-risk revenue in the first week. We saved 4 accounts that were silently churning."
                        author="Marcus Rodriguez"
                        company="VP Operations, TechFlow ($18M ARR SaaS)"
                        metrics={["$280K saved", "4 accounts rescued"]}
                    />
                    <TestimonialCard 
                        quote="We were manually reviewing CRM data Friday mornings. Now it's in my inbox Monday at 7 AM with clear action items. Game changer."
                        author="Jennifer Kim"
                        company="CRO, GrowthLabs ($42M ARR SaaS)"
                        metrics={["$425K in cross-sells identified"]}
                    />
                    <TestimonialCard 
                        quote="The billing error detection alone paid for Foldera 3x over. We were undercharging 8 customers for 6+ months."
                        author="David Park"
                        company="CFO, CloudStack ($31M ARR SaaS)"
                        metrics={["$156K recovered"]}
                    />
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
    const sectionRef = useRef(null);

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
        <section ref={sectionRef} id="pricing" className="bg-white px-6 py-24 relative">
            {/* Gradient transition from light gray to white */}
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-slate-50 to-transparent pointer-events-none" />
            
            <div className={`max-w-3xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900 text-center mb-4">
                    One Plan. No Surprises. Massive ROI.
                </h2>
                
                <div className="bg-purple-50 rounded-2xl p-6 md:p-10 border-2 border-purple-200 shadow-2xl mt-12">
                    <div className="text-center mb-8">
                        <h3 className="text-xl md:text-2xl font-bold text-slate-900 mb-4">Overnight Opportunity Scanner</h3>
                        <div className="flex items-baseline justify-center gap-2 mb-4">
                            <span className="text-5xl md:text-6xl font-bold text-purple-600">$999</span>
                            <span className="text-xl md:text-2xl text-slate-600">/month</span>
                        </div>
                        <p className="text-base md:text-lg text-slate-700 leading-relaxed max-w-xl mx-auto">
                            If we find even <span className="text-purple-600 font-semibold">ONE $100K opportunity</span>, you've paid for 8 years. Last month our customers found an average of <span className="text-green-600 font-semibold">$387K each</span>.
                        </p>
                    </div>
                    
                    <div className="space-y-4 mb-10">
                        {[
                            "Daily AI analysis of your CRM data",
                            "Identifies $300K-$500K in opportunities monthly",
                            "At-risk account alerts (prevent churn)",
                            "Revenue recovery detection (billing errors)",
                            "Morning email briefings (7 AM delivery)",
                            "Connects to Salesforce or HubSpot",
                            "Read-only access (we never write to your CRM)",
                            "Cancel anytime, no long-term contract"
                        ].map((feature, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                                <span className="text-slate-700 text-lg">{feature}</span>
                            </div>
                        ))}
                    </div>
                    
                    <a href="/dashboard" className="w-full block text-center bg-purple-600 hover:bg-purple-700 text-white font-bold py-5 rounded-xl transition-all duration-300 ease-in-out text-lg md:text-xl hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(124,58,237,0.4)] shadow-2xl mb-6">
                        Start Your Free 14-Day Trial →
                    </a>
                    
                    <div className="text-center space-y-2">
                        <p className="text-sm text-slate-600">
                            <span className="font-semibold">No credit card required</span> • Full access • Cancel anytime
                        </p>
                        <p className="text-sm text-green-600 font-semibold">
                            ROI guarantee: Find $10K+ in opportunities or get a full refund
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
};

//================================================================================
// FINAL CTA SECTION
//================================================================================

const FinalCTA = () => {
    return (
        <section className="relative bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 px-6 py-24 overflow-hidden">
            {/* Gradient transition from white to dark purple */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white to-transparent pointer-events-none z-10" />
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-r from-orange-900/20 via-transparent to-amber-900/20" />
            
            <div className="max-w-4xl mx-auto text-center relative z-10">
                <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
                    Your Next <span className="text-amber-300">$400K Opportunity</span> Gets Scanned Tonight
            </h2>
                <p className="text-lg md:text-xl text-purple-100 mb-10 leading-relaxed">
                    Connect your CRM now. Our AI runs its first scan at 2 AM. You'll wake up to opportunities you would have missed.
                </p>
                
                <a href="/dashboard" className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-10 py-5 bg-white hover:bg-slate-100 text-purple-900 text-lg md:text-xl font-bold rounded-xl shadow-2xl transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(124,58,237,0.4)] mb-8">
                    Start Finding Hidden Revenue <ArrowRight className="w-6 h-6" />
                </a>
                
                <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-purple-200 mb-6">
                    <span className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        14-day free trial
                    </span>
                    <span className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        No credit card
                    </span>
                    <span className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        2-minute setup
                    </span>
                </div>
                
                <p className="text-sm text-purple-300">
                    Join <span className="font-semibold text-white">127 revenue teams</span> who sleep better knowing Foldera is watching their pipeline 24/7.
                </p>
        </div>
    </section>
);
};

//================================================================================
// FOOTER
//================================================================================

const Footer = () => (
    <footer className="bg-slate-950 border-t border-slate-800 py-12 px-6">
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center space-x-2">
                    <img src="/foldera-glyph.svg" alt="Foldera Logo" width={28} height={28} />
                    <span className="text-lg font-semibold text-white">Foldera</span>
                </div>
                <div className="text-slate-500 text-sm">© 2025 Foldera, Inc. All rights reserved.</div>
            <div className="flex space-x-6 text-sm">
                    <a href="#" className="text-slate-400 hover:text-white transition">Privacy</a>
                    <a href="#" className="text-slate-400 hover:text-white transition">Terms</a>
                    <a href="#" className="text-slate-400 hover:text-white transition">Contact</a>
                </div>
            </div>
        </div>
    </footer>
);

//================================================================================
// MAIN PAGE COMPONENT
//================================================================================

export default function HomePage() {
    return (
        <div className="bg-slate-950 text-slate-300 antialiased min-h-screen">
                <Header />
                <main>
                    <HeroSection />
                <ProblemSection />
                <SolutionSection />
                <DashboardShowcase />
                <TestimonialsSection />
                    <PricingSection />
                    <FinalCTA />
                </main>
                <Footer />
            </div>
    );
}
