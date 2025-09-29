'use client'
import React, { useState, useEffect, useReducer, useRef, useCallback, createContext, useContext } from 'react';
import {
    AlertTriangle,
    TrendingUp,
    Clock,
    Shield,
    Zap,
    CircleDashed,
    ArrowRight,
    Sparkles,
    CheckCircle,
    X,
    Activity,
    Target
} from 'lucide-react';

//================================================================================
// 1. STATE MANAGEMENT (CONTEXT & REDUCER)
//================================================================================

const initialState = {
    conflicts: [],
    opportunities: [],
    stats: {
        activeItems: 0,
        valueAtRisk: 0,
        savedThisMonth: 0,
        hoursReclaimed: 0,
        targetActiveItems: 12,
        targetValueAtRisk: 505000,
        targetSavedThisMonth: 847000,
        targetHoursReclaimed: 127
    },
    loading: false,
    demoHasRun: false,
    showAuthModal: false,
    selectedConflict: null,
    isStatsVisible: false,
    notifications: [],
};

function appReducer(state, action) {
    switch (action.type) {
        case 'START_DEMO':
            return { ...state, loading: true, demoHasRun: false, conflicts: [], opportunities: [], stats: initialState.stats };
        case 'LOAD_DATA':
            return { ...state, conflicts: action.payload.conflicts, opportunities: action.payload.opportunities, loading: false, demoHasRun: true };
        case 'UPDATE_COUNTERS':
             if (state.demoHasRun && state.isStatsVisible) {
                return {
                    ...state,
                    stats: {
                        ...state.stats,
                        hoursReclaimed: Math.min(state.stats.hoursReclaimed + 1, state.stats.targetHoursReclaimed),
                        activeItems: Math.min(state.stats.activeItems + 1, state.stats.targetActiveItems),
                        valueAtRisk: Math.min(state.stats.valueAtRisk + Math.floor(Math.random() * 25000) + 10000, state.stats.targetValueAtRisk),
                        savedThisMonth: Math.min(state.stats.savedThisMonth + Math.floor(Math.random() * 35000) + 15000, state.stats.targetSavedThisMonth)
                    }
                };
            }
            return state; // No updates if demo hasn't run or stats not visible
        case 'SET_STATS_VISIBILITY':
            return { ...state, isStatsVisible: action.payload };
        case 'ADD_NOTIFICATION':
            // Prevent duplicate "Briefing Ready" notifications
            if (action.payload.title === 'Briefing Ready' && state.notifications.some(n => n.title === 'Briefing Ready')) {
                return state;
            }
            return { ...state, notifications: [action.payload, ...state.notifications].slice(0, 3) }; // Keep max 3 notifications
        case 'REMOVE_NOTIFICATION':
            return { ...state, notifications: state.notifications.filter(n => n.id !== action.payload) };
        case 'SELECT_CONFLICT':
             return { ...state, selectedConflict: action.payload };
        case 'CLOSE_MODALS':
             return { ...state, showAuthModal: false, selectedConflict: null };
        default:
            return state;
    }
}

const DemoContext = createContext();

const DemoProvider = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);

    // Effect for handling notifications
    useEffect(() => {
        if (state.demoHasRun) {
            const interval = setInterval(() => {
                const notifications = [
                    { type: 'alert', title: 'New conflict detected', message: 'Invoice terms don\'t match PO requirements' },
                    { type: 'success', title: 'Opportunity found', message: 'Client eligible for volume discount' },
                ];
                const notification = {
                    ...notifications[Math.floor(Math.random() * notifications.length)],
                    id: Date.now()
                };
                dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
            }, 12000); // Slower notification interval
            return () => clearInterval(interval);
        }
    }, [state.demoHasRun]);

    // Effect for updating stat counters
     useEffect(() => {
        const interval = setInterval(() => {
            dispatch({ type: 'UPDATE_COUNTERS' });
        }, 100);
        return () => clearInterval(interval);
    }, []);

    const value = { state, dispatch };

    return (
        <DemoContext.Provider value={value}>
            {children}
            <NotificationContainer />
            {state.selectedConflict && <ResolutionModal conflict={state.selectedConflict} />}
        </DemoContext.Provider>
    );
};

const useDemo = () => {
    const context = useContext(DemoContext);
    if (context === undefined) {
        throw new Error('useDemo must be used within a DemoProvider');
    }
    return context;
};

//================================================================================
// 2. REUSABLE & ANIMATION COMPONENTS
//================================================================================

const ResolutionModal = ({ conflict }) => {
    const { dispatch } = useDemo();
    if (!conflict) return null;

    const steps = [
        "Review contract against project scope documents.",
        "Schedule stakeholder meeting with legal and finance.",
        "Propose alternative payment structure or timeline.",
        "Update internal forecast models with revised terms."
    ];

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => dispatch({ type: 'CLOSE_MODALS' })}>
            <div className="bg-zinc-950/90 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-8 w-full max-w-lg transform animate-scale-in shadow-2xl shadow-amber-500/20" onClick={e => e.stopPropagation()}>
                <div className="flex items-start gap-4 mb-4">
                    <AlertTriangle className="w-8 h-8 text-amber-400 flex-shrink-0 mt-1" />
                    <div>
                        <h3 className="text-2xl font-light text-white">{conflict.title}</h3>
                        <p className="text-amber-400 font-bold">${conflict.value.toLocaleString()} at risk</p>
                    </div>
                </div>
                <p className="text-zinc-400 mb-6">{conflict.description}</p>
                <h4 className="font-semibold text-white mb-4">Recommended Resolution Steps:</h4>
                <ul className="space-y-3">
                    {steps.map((step, i) => (
                        <li key={i} className="flex items-center gap-3 text-zinc-300">
                            <CheckCircle className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                            <span>{step}</span>
                        </li>
                    ))}
                </ul>
                <button onClick={() => dispatch({ type: 'CLOSE_MODALS' })} className="w-full mt-8 bg-zinc-800 text-white py-3 rounded-xl font-medium hover:bg-zinc-700 transition-colors">
                    Close
                </button>
            </div>
        </div>
    )
}


const LiveNotification = ({ notification, onRemove }) => {
    useEffect(() => {
        const timer = setTimeout(() => onRemove(notification.id), 5000);
        return () => clearTimeout(timer);
    }, [notification.id, onRemove]);

    return (
        <div className="animate-slide-in-right bg-zinc-900/90 backdrop-blur-lg border border-cyan-500/30 rounded-lg p-4 flex items-start gap-3 shadow-2xl">
            <div className="flex-shrink-0">
                {notification.type === 'alert' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                ) : (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                )}
            </div>
            <div className="flex-1">
                <p className="text-sm font-medium text-white">{notification.title}</p>
                <p className="text-xs text-zinc-400 mt-1">{notification.message}</p>
            </div>
            <button onClick={() => onRemove(notification.id)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

const NotificationContainer = () => {
    const { state, dispatch } = useDemo();
    const handleRemoveNotification = useCallback((id) => {
        dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
    }, [dispatch]);

    return (
        <div className="fixed top-24 right-6 z-50 space-y-3 max-w-sm w-full">
            {state.notifications.map(notification => (
                <LiveNotification
                    key={notification.id}
                    notification={notification}
                    onRemove={handleRemoveNotification}
                />
            ))}
        </div>
    );
};


//================================================================================
// 3. UI SECTION COMPONENTS
//================================================================================

const Header = () => (
    <nav className="sticky top-0 z-40 backdrop-blur-lg bg-black/30 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
                <a href="/" className="flex items-center space-x-2">
                    <img src="/foldera-glyph.svg" alt="Foldera Logo" width={32} height={32} />
                    <span className="text-xl font-semibold text-white">Foldera</span>
                </a>
                <div className="hidden md:flex items-center space-x-8">
                    <a href="#pricing" className="text-zinc-400 hover:text-white transition">Pricing</a>
                    <a href="/dashboard" className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition">
                        Get Early Access
                    </a>
                </div>
            </div>
        </div>
    </nav>
);

const HeroSection = () => (
    <section className="relative z-10 min-h-[90vh] flex items-center justify-center px-6 py-24">
        <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center px-3 py-1 rounded-full border border-zinc-800 bg-zinc-950 mb-8">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></span>
                <span className="text-sm text-zinc-400">1,287 professionals using Foldera</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-light tracking-tight mb-6 leading-tight text-white">
                The only AI that actually<br />
                <span className="font-medium text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-purple-500">
                    solves problems
                </span><br />
                instead of just finding them.
            </h1>
            <p className="text-xl text-zinc-400 mb-12 max-w-3xl mx-auto">
                While you sleep, Foldera monitors everything. Finds conflicts. Drafts fixes.
                You wake up to solutions, not problems.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a href="/dashboard" className="px-8 py-4 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition text-lg">
                    Start 14-Day Free Trial
                </a>
            </div>
        </div>
    </section>
);

const DashboardCard = ({ title, value, unit, icon: Icon, color }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        if (typeof value !== 'number') return;
        const duration = 1500;
        const steps = 50;
        const increment = value / steps;
        let current = 0;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= value) {
                setDisplayValue(value);
                clearInterval(timer);
            } else {
                setDisplayValue(Math.floor(current));
            }
        }, duration / steps);
        
        return () => clearInterval(timer);
    }, [value]);

    const formatValue = () => {
        if (typeof displayValue !== 'number') return displayValue;
        if (title.includes('Value') || title.includes('Saved')) {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(displayValue);
        }
        return displayValue.toLocaleString();
    };

    return (
        <div className="relative bg-zinc-900/80 backdrop-blur-xl rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-3">
                <Icon className={`w-6 h-6 ${color}`} />
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full" /> LIVE
                </span>
            </div>
            <p className={`text-3xl font-light ${color} tracking-tight`}>
                {formatValue()}{unit}
            </p>
            <p className="text-sm text-zinc-400 mt-2">{title}</p>
        </div>
    );
};

const ConflictCard = ({ conflict }) => {
    const { dispatch } = useDemo();
    return (
         <div
            className="relative bg-zinc-900/60 backdrop-blur rounded-xl p-5 border border-zinc-800 hover:border-red-500/50 transition-all cursor-pointer group"
            onClick={() => dispatch({ type: 'SELECT_CONFLICT', payload: conflict })}
        >
            <div className="relative">
                <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            <h3 className="font-medium text-white group-hover:text-red-300 transition-colors">{conflict.title}</h3>
                        </div>
                        <p className="text-sm text-zinc-400 leading-relaxed">{conflict.description}</p>
                    </div>
                    <div className="text-right">
                        <span className="text-xl font-light text-amber-400">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(conflict.value)}
                        </span>
                        <p className="text-xs text-red-400 mt-1">AT RISK</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OpportunityCard = ({ opportunity }) => (
    <div className="relative bg-zinc-900/60 backdrop-blur rounded-xl p-5 border border-zinc-800 hover:border-green-500/50 transition-all group">
        <div className="relative">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        <h3 className="font-medium text-white group-hover:text-green-300 transition-colors">{opportunity.title}</h3>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">{opportunity.description}</p>
                </div>
                <div className="text-right">
                    <span className="text-xl font-light text-green-400">
                        +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(opportunity.value)}
                    </span>
                    <p className="text-xs text-green-400 mt-1">POTENTIAL</p>
                </div>
            </div>
        </div>
    </div>
);


const BriefingDashboard = () => {
    const { state, dispatch } = useDemo();
    const statsRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            dispatch({ type: 'SET_STATS_VISIBILITY', payload: entry.isIntersecting });
        }, { threshold: 0.5 });

        if (statsRef.current) observer.observe(statsRef.current);
        return () => {
            if (statsRef.current) observer.unobserve(statsRef.current);
        };
    }, [dispatch]);
    
    return (
        <div className="bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/50 rounded-2xl p-8 shadow-2xl animate-fade-in">
             <div ref={statsRef} className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
                <DashboardCard title="Active Items" value={state.stats.activeItems} icon={Zap} color="text-blue-400" />
                <DashboardCard title="Value at Risk" value={state.stats.valueAtRisk} icon={AlertTriangle} color="text-amber-400" />
                <DashboardCard title="Saved This Month" value={state.stats.savedThisMonth} icon={Shield} color="text-green-400" />
                <DashboardCard title="Hours Reclaimed" value={state.stats.hoursReclaimed} unit="h" icon={Clock} color="text-purple-400" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <h3 className="text-xl font-light text-white mb-6 flex items-center">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-3 animate-pulse" />
                        Critical Conflicts Detected
                        <span className="ml-auto text-sm text-red-400">{state.conflicts.length} items</span>
                    </h3>
                    <div className="space-y-4">
                        {state.conflicts.map(conflict => <ConflictCard key={conflict.id} conflict={conflict} />)}
                    </div>
                </div>
                <div>
                    <h3 className="text-xl font-light text-white mb-6 flex items-center">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse" />
                        Opportunities Identified
                        <span className="ml-auto text-sm text-green-400">{state.opportunities.length} items</span>
                    </h3>
                    <div className="space-y-4">
                        {state.opportunities.map(opportunity => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)}
                    </div>
                </div>
            </div>
        </div>
    )
}

const LiveDemoSection = () => {
    const { state, dispatch } = useDemo();
    const demoRef = useRef(null);

    const handleRunDemo = useCallback(() => {
        dispatch({ type: 'START_DEMO' });
        demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        setTimeout(() => {
            dispatch({
                type: 'LOAD_DATA',
                payload: {
                    conflicts: [
                        { id: 1, title: 'Payment Terms Mismatch', description: 'Contract assumes $180K upfront, but client cash-strapped until Q2.', value: 180000 },
                        { id: 2, title: 'Regulatory Filing Due', description: 'Compliance deadline is in 3 days, required documentation is incomplete.', value: 50000 },
                        { id: 3, title: 'Forecast Discrepancy', description: 'Board deck shows different revenue numbers than the P&L statement.', value: 275000 }
                    ],
                    opportunities: [
                        { id: 1, title: 'Cross-sell Opportunity', description: 'Client mentioned need for additional services in recent meeting notes.', value: 45000 },
                        { id: 2, title: 'Grant Eligibility Match', description: 'A new federal grant was announced that matches your project criteria.', value: 150000 }
                    ]
                }
            });
            dispatch({
                type: 'ADD_NOTIFICATION',
                payload: { id: Date.now(), type: 'success', title: 'Briefing Ready', message: 'Your live demo report has been generated.' }
            });
        }, 2000);
    }, [dispatch]);

    return (
        <section ref={demoRef} className="relative z-10 py-24 px-6" id="demo">
             <div className="max-w-6xl mx-auto">
                <div className="text-center mb-16">
                    <p className="text-sm uppercase tracking-widest text-zinc-500 mb-4">Live Demo</p>
                    <h2 className="text-4xl md:text-5xl font-light text-white">Your morning briefing</h2>
                    <button onClick={handleRunDemo} className="mt-6 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/30 transform hover:scale-105 transition-all">
                        {state.demoHasRun ? 'Re-run Demo' : 'Run Live Demo'}
                    </button>
                </div>

                {state.loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[50vh]">
                        <CircleDashed className="w-16 h-16 text-cyan-500 animate-spin" />
                        <p className="mt-6 text-white text-xl font-light">Analyzing documents...</p>
                    </div>
                ) : !state.demoHasRun ? (
                    <div className="text-center min-h-[50vh] flex flex-col items-center justify-center">
                        <div className="w-24 h-24 bg-zinc-900 rounded-3xl flex items-center justify-center mb-6 border border-zinc-800">
                            <Target className="w-12 h-12 text-cyan-400" />
                        </div>
                        <p className="text-2xl text-white font-light mb-4">Your dashboard is ready.</p>
                        <p className="text-zinc-400 mb-8">Click "Run Live Demo" above to start.</p>
                    </div>
                ) : (
                    <BriefingDashboard />
                )}
            </div>
        </section>
    );
};

const PricingSection = () => (
    <section className="relative z-10 py-24 px-6 border-t border-zinc-800" id="pricing">
        <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
                <h2 className="text-4xl md:text-5xl font-light text-white mb-4">Simple pricing</h2>
                <p className="text-xl text-zinc-400">Start free. Upgrade when you see the value.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
                {/* Pricing Tiers */}
                 <div className="rounded-2xl border border-zinc-800 p-8 flex flex-col">
                    <h3 className="text-xl mb-2 text-white">Free</h3>
                    <div className="mb-6">
                        <span className="text-3xl font-light text-white">$0</span>
                        <span className="text-zinc-400">/mo</span>
                    </div>
                    <ul className="space-y-3 text-zinc-400 mb-8 flex-grow">
                        <li>• 3 connectors</li>
                        <li>• 10 conflicts/mo</li>
                        <li>• Daily briefings</li>
                    </ul>
                    <a href="/dashboard" className="w-full text-center py-3 border border-zinc-700 rounded-lg hover:border-zinc-600 transition">
                        Start Free
                    </a>
                </div>
                <div className="rounded-2xl border-2 border-cyan-500/50 p-8 relative flex flex-col">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-cyan-500 text-black text-sm font-medium rounded-full">
                        MOST POPULAR
                    </div>
                    <h3 className="text-xl mb-2 text-white">Pro</h3>
                    <div className="mb-6">
                        <span className="text-3xl font-light text-white">$79</span>
                        <span className="text-zinc-400">/mo</span>
                    </div>
                    <ul className="space-y-3 text-zinc-300 mb-8 flex-grow">
                        <li>• Unlimited connectors</li>
                        <li>• Unlimited conflicts</li>
                        <li>• One-click fixes</li>
                        <li>• Real-time monitoring</li>
                    </ul>
                    <a href="/dashboard" className="w-full text-center py-3 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-400 transition">
                        Start Free Trial
                    </a>
                </div>
                <div className="rounded-2xl border border-zinc-800 p-8 flex flex-col">
                    <h3 className="text-xl mb-2 text-white">Team</h3>
                    <div className="mb-6">
                        <span className="text-3xl font-light text-white">$299</span>
                        <span className="text-zinc-400">/mo</span>
                    </div>
                    <ul className="space-y-3 text-zinc-400 mb-8 flex-grow">
                        <li>• Everything in Pro</li>
                        <li>• 5 team members</li>
                        <li>• Shared playbooks</li>
                        <li>• Priority support</li>
                    </ul>
                    <a href="/dashboard" className="w-full text-center py-3 border border-zinc-700 rounded-lg hover:border-zinc-600 transition">
                        Contact Sales
                    </a>
                </div>
            </div>
        </div>
    </section>
);

const FinalCTA = () => (
    <section className="relative z-10 py-32 px-6 text-center">
        <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-6xl font-light text-white mb-8">
                Your next fire starts in<br />
                <span className="text-5xl md:text-7xl font-medium text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-purple-500">
                    3... 2... 1...
                </span>
            </h2>
            <p className="text-xl text-zinc-400 mb-12">Let Foldera catch it first.</p>
            <a href="/dashboard" className="px-10 py-5 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition text-lg inline-flex items-center gap-2">
                Start Your Free Trial <ArrowRight className="w-5 h-5" />
            </a>
            <p className="mt-6 text-zinc-500">No credit card required • 14-day free trial</p>
        </div>
    </section>
);

const Footer = () => (
    <footer className="relative z-10 border-t border-zinc-800 py-8 px-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="text-zinc-500 text-sm">© 2025 Foldera, Inc.</div>
            <div className="flex space-x-6 text-sm">
                <a href="#" className="text-zinc-500 hover:text-white transition">Privacy</a>
                <a href="#" className="text-zinc-500 hover:text-white transition">Terms</a>
                <a href="#" className="text-zinc-500 hover:text-white transition">Contact</a>
            </div>
        </div>
    </footer>
);


//================================================================================
// 4. MAIN PAGE COMPONENT (COMPOSITION ROOT)
//================================================================================

export default function HomePage() {
    return (
        <DemoProvider>
            <div className="bg-black text-white antialiased">
                <div className="noise-bg"></div>
                <Header />
                <main>
                    <HeroSection />
                    <LiveDemoSection />
                    <PricingSection />
                    <FinalCTA />
                </main>
                <Footer />
            </div>
        </DemoProvider>
    );
}