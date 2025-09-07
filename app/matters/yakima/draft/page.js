"use client";
import { useState, useEffect } from 'react';

export default function DraftPage() {
    const [metrics, setMetrics] = useState(null);
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [step, setStep] = useState(1);
    const [selectedArgs, setSelectedArgs] = useState([]);
    const [tone, setTone] = useState('professional');
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        const fetchSummaryMetrics = async () => {
            setPageIsLoading(true);
            const simulatedData = { constructiveDenials: 4, privilegeLogFailures: 2, highRiskViolations: 2 };
            setMetrics(simulatedData);
            setPageIsLoading(false);
        };
        fetchSummaryMetrics();
    }, []);

    const recommendedArgs = [];
    if (metrics) {
        if (metrics.constructiveDenials > 0) recommendedArgs.push({ id: 'bad_faith', title: 'Argue Pattern of Bad Faith', description: `Leverage the ${metrics.constructiveDenials} constructive denials.` });
        if (metrics.privilegeLogFailures > 0) recommendedArgs.push({ id: 'privilege_waiver', title: 'Argue Waiver of Privilege', description: `The ${metrics.privilegeLogFailures} privilege log failures suggest waiver.` });
        if (metrics.highRiskViolations > 0) recommendedArgs.push({ id: 'in_camera_review', title: 'Demand In Camera Review', description: `The ${metrics.highRiskViolations} high-risk violations necessitate judicial review.` });
    }

    const handleToggleArg = (id) => setSelectedArgs(prev => prev.includes(id) ? prev.filter(argId => argId !== id) : [...prev, id]);

    const generateDraft = async () => {
        setIsGenerating(true);
        const response = await fetch('/api/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId: 'yakima', arguments: selectedArgs, tone: tone }),
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Surgical_Motion_Yakima.docx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } else {
            console.error("Failed to generate surgical draft");
            alert("An error occurred while generating the document. Please check the Vercel logs for more details.");
        }
        setIsGenerating(false);
    };

    if (pageIsLoading) {
        return <main className="min-h-screen p-6 flex justify-center items-center"><div className="text-center"><p className="text-xl">Loading Case Recommendations...</p></div></main>;
    }

    return (
        <main className="min-h-screen p-6 pb-28 lg:max-w-4xl lg:mx-auto">
            <h1 className="glow-text text-3xl font-bold mb-6 text-center">Surgical Draft Assistant</h1>
            
            {step === 1 && (
                <div className="card-enhanced">
                    <h2 className="text-xl font-semibold mb-1">Step 1: Select Core Arguments</h2>
                    <p className="text-gray-400 mb-4">The Wigdor engine has analyzed the live data and recommends these key points.</p>
                    <div className="space-y-3">{recommendedArgs.map(arg => (<div key={arg.id} onClick={() => handleToggleArg(arg.id)} className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedArgs.includes(arg.id) ? 'bg-cyan-900 border-cyan-400' : 'border-gray-600 hover:border-gray-400'}`}><p className="font-bold">{arg.title}</p><p className="text-sm text-gray-300">{arg.description}</p></div>))}</div>
                    <button onClick={() => setStep(2)} className="btn w-full mt-6" disabled={selectedArgs.length === 0}>Next: Set Tone</button>
                </div>
            )}

            {step === 2 && (
                <div className="card-enhanced">
                    <h2 className="text-xl font-semibold mb-4">Step 2: Set the Tone</h2>
                    <div className="space-y-3"><div onClick={() => setTone('professional')} className={`p-4 border rounded-lg cursor-pointer transition-all ${tone === 'professional' ? 'bg-cyan-900 border-cyan-400' : 'border-gray-600 hover:border-gray-400'}`}><p className="font-bold">Firm but Professional</p><p className="text-sm text-gray-300">Outlines failures and requests remedies clearly.</p></div><div onClick={() => setTone('aggressive')} className={`p-4 border rounded-lg cursor-pointer transition-all ${tone === 'aggressive' ? 'bg-cyan-900 border-cyan-400' : 'border-gray-600 hover:border-gray-400'}`}><p className="font-bold">Aggressively Seek Sanctions</p><p className="text-sm text-gray-300">Asserts bad faith and explicitly demands sanctions.</p></div></div>
                    <div className="flex gap-4 mt-6">
                        <button onClick={() => setStep(1)} className="btn-secondary w-full">Back</button>
                        <button onClick={generateDraft} className="btn w-full" disabled={isGenerating}>
                            {isGenerating ? 'Generating Document...' : 'Generate Surgical .docx'}
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}
