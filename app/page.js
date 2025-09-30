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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => dispatch({ type: 'CLOSE_MODALS' })}>
            <div className="bg-white border border-gray-300 rounded-2xl p-8 w-full max-w-lg transform animate-scale-in shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start gap-4 mb-4">
                    <AlertTriangle className="w-8 h-8 text-amber-600 flex-shrink-0 mt-1" />
                    <div>
                        <h3 className="text-2xl font-bold text-gray-900">{conflict.title}</h3>
                        <p className="text-amber-600 font-bold">${conflict.value.toLocaleString()} at risk</p>
                    </div>
                </div>
                <p className="text-gray-600 mb-6">{conflict.description}</p>
                <h4 className="font-semibold text-gray-900 mb-4">Recommended Resolution Steps:</h4>
                <ul className="space-y-3">
                    {steps.map((step, i) => (
                        <li key={i} className="flex items-center gap-3 text-gray-700">
                            <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            <span>{step}</span>
                        </li>
                    ))}
                </ul>
                <button onClick={() => dispatch({ type: 'CLOSE_MODALS' })} className="w-full mt-8 bg-gray-800 text-white py-3 rounded-xl font-medium hover:bg-gray-700 transition-colors">
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
        <div className="animate-slide-in-right bg-white border border-gray-300 rounded-lg p-4 flex items-start gap-3 shadow-xl">
            <div className="flex-shrink-0">
                {notification.type === 'alert' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                ) : (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                )}
            </div>
            <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
            </div>
            <button onClick={() => onRemove(notification.id)} className="text-gray-500 hover:text-gray-900">
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
    <nav className="sticky top-0 z-40 backdrop-blur-lg bg-white/95 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
                <a href="/" className="flex items-center space-x-2">
                    <img src="/foldera-glyph.svg" alt="Foldera Logo" width={32} height={32} />
                    <span className="text-xl font-semibold text-gray-900">Foldera</span>
                </a>
                <div className="hidden md:flex items-center space-x-8">
                    <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition">Pricing</a>
                    <a href="/dashboard" className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition">
                        Get Early Access
                    </a>
                </div>
            </div>
        </div>
    </nav>
);

const HeroSection = () => (
    <section className="relative z-10 bg-gradient-to-b from-gray-50 to-white px-6 py-16 md:py-24">
        <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
                Stop Wasting Mornings Fixing Broken Workflows.
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                Foldera monitors your tools 24/7, finds conflicts, and automatically fixes sync errors while you sleep. Wake up to solutions, not problems.
            </p>
            <a href="/dashboard" className="bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold py-4 px-8 rounded-lg shadow-lg transition-all transform hover:scale-105 inline-block">
                Start My 14-Day Free Trial
            </a>
            <p className="text-sm text-gray-500 mt-4">No credit card required • 2-minute setup</p>
        </div>
    </section>
);

const SocialProofBar = () => (
    <section className="relative z-10 bg-gray-100 py-8">
        <div className="max-w-5xl mx-auto px-4">
            <p className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wider">Built for teams at forward-thinking companies</p>
            <div className="flex justify-center items-center gap-8 md:gap-12 mt-4 opacity-50">
                <p className="font-bold text-lg text-gray-400">LOGO</p>
                <p className="font-bold text-lg text-gray-400">LOGO</p>
                <p className="font-bold text-lg text-gray-400">LOGO</p>
                <p className="font-bold text-lg text-gray-400">LOGO</p>
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
        <div className="relative bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <Icon className={`w-6 h-6 ${color}`} />
                <span className="text-xs text-gray-500 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full" /> LIVE
                </span>
            </div>
            <p className={`text-3xl font-light ${color} tracking-tight`}>
                {formatValue()}{unit}
            </p>
            <p className="text-sm text-gray-600 mt-2">{title}</p>
        </div>
    );
};

const ConflictCard = ({ conflict }) => {
    const { dispatch } = useDemo();
    return (
         <div
            className="relative bg-white rounded-xl p-5 border border-gray-200 hover:border-red-400 transition-all cursor-pointer group shadow-sm"
            onClick={() => dispatch({ type: 'SELECT_CONFLICT', payload: conflict })}
        >
            <div className="relative">
                <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            <h3 className="font-medium text-gray-900 group-hover:text-red-600 transition-colors">{conflict.title}</h3>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed">{conflict.description}</p>
                    </div>
                    <div className="text-right">
                        <span className="text-xl font-light text-amber-600">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(conflict.value)}
                        </span>
                        <p className="text-xs text-red-500 mt-1">AT RISK</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OpportunityCard = ({ opportunity }) => (
    <div className="relative bg-white rounded-xl p-5 border border-gray-200 hover:border-green-400 transition-all group shadow-sm">
        <div className="relative">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        <h3 className="font-medium text-gray-900 group-hover:text-green-600 transition-colors">{opportunity.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{opportunity.description}</p>
                </div>
                <div className="text-right">
                    <span className="text-xl font-light text-green-600">
                        +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(opportunity.value)}
                    </span>
                    <p className="text-xs text-green-500 mt-1">POTENTIAL</p>
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
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 shadow-lg animate-fade-in">
             <div ref={statsRef} className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
                <DashboardCard title="Active Items" value={state.stats.activeItems} icon={Zap} color="text-blue-600" />
                <DashboardCard title="Value at Risk" value={state.stats.valueAtRisk} icon={AlertTriangle} color="text-amber-600" />
                <DashboardCard title="Saved This Month" value={state.stats.savedThisMonth} icon={Shield} color="text-green-600" />
                <DashboardCard title="Hours Reclaimed" value={state.stats.hoursReclaimed} unit="h" icon={Clock} color="text-purple-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-3 animate-pulse" />
                        Critical Conflicts Detected
                        <span className="ml-auto text-sm text-red-500">{state.conflicts.length} items</span>
                    </h3>
                    <div className="space-y-4">
                        {state.conflicts.map(conflict => <ConflictCard key={conflict.id} conflict={conflict} />)}
                    </div>
                </div>
                <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse" />
                        Opportunities Identified
                        <span className="ml-auto text-sm text-green-500">{state.opportunities.length} items</span>
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
        <section ref={demoRef} className="relative z-10 py-20 md:py-24 px-4" id="demo">
             <div className="max-w-3xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4 tracking-tight text-gray-900">Your Morning Briefing, Solved.</h2>
                    <p className="text-gray-600 mb-8 max-w-2xl mx-auto">Instead of a list of new problems, Foldera gives you a list of problems it already fixed.</p>
                    <button onClick={handleRunDemo} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-lg transform hover:scale-105 transition-all">
                        {state.demoHasRun ? 'Re-run Demo' : 'Run Live Demo'}
                    </button>
                </div>

                {state.loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[50vh]">
                        <CircleDashed className="w-16 h-16 text-blue-600 animate-spin" />
                        <p className="mt-6 text-gray-900 text-xl font-medium">Analyzing documents...</p>
                    </div>
                ) : !state.demoHasRun ? (
                    <div className="text-center min-h-[40vh] flex flex-col items-center justify-center">
                        <div className="w-24 h-24 bg-gray-100 rounded-3xl flex items-center justify-center mb-6 border border-gray-200">
                            <Target className="w-12 h-12 text-blue-600" />
                        </div>
                        <p className="text-2xl text-gray-900 font-semibold mb-4">Your dashboard is ready.</p>
                        <p className="text-gray-600 mb-8">Click "Run Live Demo" above to start.</p>
                    </div>
                ) : (
                    <BriefingDashboard />
                )}
            </div>
        </section>
    );
};

const PricingSection = () => {
    const Check = (props) => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="20 6 9 17 4 12" /></svg>
    );

    return (
        <section className="py-20 md:py-24 px-4 bg-gray-50" id="pricing">
            <div className="max-w-md mx-auto">
                <div className="bg-white rounded-2xl p-8 text-center shadow-2xl border border-gray-200">
                    <h3 className="text-2xl font-bold mb-2 text-gray-900">One Simple Plan.</h3>
                    <p className="text-gray-600 mb-6">Start with a full-featured 14-day trial. See the value, then decide.</p>
                    <div className="text-5xl font-bold my-4 text-gray-900">$79<span className="text-2xl text-gray-500">/mo</span></div>
                    <p className="text-gray-500 mb-8">After your free trial ends.</p>
                    
                    <ul className="text-left space-y-3 mb-10 text-gray-700">
                        <li className="flex items-start gap-3"><Check className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-500" /><span>Unlimited connectors</span></li>
                        <li className="flex items-start gap-3"><Check className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-500" /><span>Real-time monitoring & fixes</span></li>
                        <li className="flex items-start gap-3"><Check className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-500" /><span>Daily summary reports</span></li>
                        <li className="flex items-start gap-3"><Check className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-500" /><span>Priority support</span></li>
                    </ul>
                    
                    <a href="/dashboard" className="w-full block text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg transition-all text-lg transform hover:scale-105">
                        Start My 14-Day Free Trial
                    </a>
                    <p className="font-semibold text-gray-500 mt-4 text-sm">No credit card required. Cancel anytime.</p>
                </div>
            </div>
        </section>
    );
};

const FinalCTA = () => (
    <section className="relative z-10 py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold mb-6 tracking-tight text-gray-900">
                Start Your First Problem-Free Morning.
            </h2>
            <p className="text-xl text-gray-600 mb-8">
                It takes 2 minutes to connect your tools. Let Foldera catch the first error tonight.
            </p>
            <a href="/dashboard" className="bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold py-4 px-10 rounded-lg shadow-lg transition-all transform hover:scale-105 inline-block">
                Claim Your 14-Day Free Trial
            </a>
        </div>
    </section>
);

const Footer = () => (
    <footer className="relative z-10 border-t border-gray-200 py-8 px-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="text-gray-500 text-sm">© 2025 Foldera, Inc.</div>
            <div className="flex space-x-6 text-sm">
                <a href="#" className="text-gray-500 hover:text-gray-900 transition">Privacy</a>
                <a href="#" className="text-gray-500 hover:text-gray-900 transition">Terms</a>
                <a href="#" className="text-gray-500 hover:text-gray-900 transition">Contact</a>
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
            <div className="bg-white text-gray-800 antialiased">
                <Header />
                <main>
                    <HeroSection />
                    <SocialProofBar />
                    <LiveDemoSection />
                    <PricingSection />
                    <FinalCTA />
                </main>
                <Footer />
            </div>
        </DemoProvider>
    );
}