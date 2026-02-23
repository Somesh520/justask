import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Terminal, Clock, Send, XCircle, Trophy, AlertTriangle, Lightbulb,
    Layout
} from 'lucide-react';
import { useStore } from '../../lib/store';
import { CodingSandbox } from './CodingSandbox';
import { CrisisTerminal } from './CrisisTerminal';
import { HostileNegotiation } from './HostileNegotiation';
import { ResourceSqueeze } from './ResourceSqueeze';
import { RedPenTeardown } from './RedPenTeardown';
import confetti from 'canvas-confetti';
import { MasteryCertificate } from '../profile/MasteryCertificate';

export function GauntletWorkspace() {
    const { activeSessionId, sessions, submitGauntlet, dismissGauntlet, generateCertificate } = useStore();
    const session = sessions[activeSessionId];
    const gauntlet = session?.gauntlet;

    // State for different engines
    const [files, setFiles] = useState(gauntlet?.starterCode || {});

    // Generic reflection state (fallback)
    const [reflection, setReflection] = useState('');

    const [isVerifying, setIsVerifying] = useState(false);
    const [result, setResult] = useState(null);
    const [showCertificate, setShowCertificate] = useState(false);
    const [generatedCert, setGeneratedCert] = useState(null);

    if (!gauntlet) return null;

    // ... existing getEffectiveType ...
    const getEffectiveType = () => {
        const validTypes = ['coding_sandbox', 'crisis_terminal', 'hostile_negotiation', 'resource_squeeze', 'red_pen_teardown'];
        if (gauntlet.type && validTypes.includes(gauntlet.type)) return gauntlet.type;
        if (gauntlet.type === 'technical') return 'coding_sandbox';
        return 'coding_sandbox'; // Default
    };

    const effectiveType = getEffectiveType();

    const handleSubmit = async () => {
        setIsVerifying(true);
        let submission = {};

        switch (effectiveType) {
            case 'coding_sandbox':
                submission = { code: files, type: 'technical' };
                break;
            case 'crisis_terminal':
                submission = { type: 'crisis', result: 'Survived' };
                break;
            default:
                submission = { reflection, type: 'physical' };
        }

        const res = await submitGauntlet(activeSessionId, submission);
        setResult(res);
        setIsVerifying(false);

        if (res.passed) {
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#FFE633', '#22C55E', '#3B82F6', '#EF4444']
            });
            const cert = await generateCertificate(activeSessionId);
            setGeneratedCert(cert);
        }
    };

    // Render the correct engine
    const renderEngine = () => {
        switch (effectiveType) {
            case 'coding_sandbox':
                return <CodingSandbox gauntlet={gauntlet} files={files} setFiles={setFiles} />;
            case 'crisis_terminal':
                return <CrisisTerminal gauntlet={gauntlet} />;
            case 'hostile_negotiation':
                return <HostileNegotiation gauntlet={gauntlet} />;
            case 'resource_squeeze':
                return <ResourceSqueeze gauntlet={gauntlet} />;
            case 'red_pen_teardown':
                return <RedPenTeardown gauntlet={gauntlet} />;
            default:
                // Fallback / Physical
                return (
                    <div className="flex-1 p-12 max-w-2xl mx-auto space-y-8">
                        <h2 className="text-4xl font-black uppercase italic">Submit Your Proof</h2>
                        <textarea
                            value={reflection}
                            onChange={(e) => setReflection(e.target.value)}
                            placeholder="Detail your process, challenges, and breakthroughs..."
                            className="w-full h-64 p-6 border-4 border-black font-mono text-lg focus:bg-brutal-yellow/10 focus:outline-none shadow-[8px_8px_0px_0px_#000]"
                        />
                        <div className="p-8 border-4 border-black border-dashed bg-gray-100 text-center cursor-pointer hover:bg-white transition-all">
                            <Layout className="mx-auto mb-4 opacity-30" size={48} />
                            <p className="font-black uppercase tracking-widest">DRAG IMAGES / VIDEOS HERE</p>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-[600] bg-white flex flex-col font-mono">
            {/* TOP BAR */}
            <div className="h-16 bg-black text-white flex items-center justify-between px-6 border-b-4 border-black relative">
                <div className="flex items-center gap-4">
                    <div className="bg-brutal-red p-1 rotate-12">
                        <Terminal size={20} strokeWidth={3} />
                    </div>
                    <h2 className="text-xl font-black uppercase tracking-tighter hidden md:block">
                        GAUNTLET // {gauntlet.title}
                    </h2>
                </div>

                {/* ESCAPE HATCH */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <button
                        onClick={() => dismissGauntlet(activeSessionId)}
                        className="bg-brutal-red text-white px-8 py-3 border-4 border-black font-black uppercase text-xl hover:translate-y-1 hover:shadow-none transition-all shadow-[8px_8px_0px_0px_#000] flex items-center gap-3 group"
                    >
                        <XCircle size={24} className="group-hover:rotate-90 transition-transform" />
                        <span className="hidden md:inline">NOT READY</span>
                    </button>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden lg:flex items-center gap-2 text-brutal-yellow">
                        <Clock size={18} />
                        <span className="font-black underline uppercase text-xs">TIMER: {gauntlet.timeLimit}</span>
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={isVerifying}
                        className="bg-brutal-green text-black px-6 py-2 border-2 border-white font-black uppercase text-sm hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-2"
                    >
                        {isVerifying ? <span className="animate-spin opacity-50">✦</span> : <Send size={16} strokeWidth={3} />}
                        SUBMIT
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT SIDEBAR: Instructions (Common) */}
                <div className="w-80 border-r-4 border-black bg-gray-100 flex flex-col p-6 overflow-y-auto hidden lg:flex">
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xs font-black uppercase text-gray-400 mb-2 tracking-widest">The Mission</h3>
                            <p className="text-sm font-bold uppercase leading-tight bg-white p-3 border-2 border-black rotate-1">
                                {gauntlet.brief}
                            </p>
                        </div>
                        <div>
                            <h3 className="text-xs font-black uppercase text-gray-400 mb-2 tracking-widest">Requirements</h3>
                            <div className="space-y-2">
                                {gauntlet.requirements.map((req, idx) => (
                                    <div key={idx} className="flex gap-2 text-xs font-bold items-start bg-white p-2 border-2 border-black shadow-[2px_2px_0px_0px_#000]">
                                        <span className="text-brutal-red font-black">□</span>
                                        <span>{req}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-brutal-blue/10 p-4 border-2 border-brutal-blue text-xs mt-auto">
                            <div className="flex items-center gap-2 text-brutal-blue font-black uppercase mb-1">
                                <Lightbulb size={14} /> AI Hint Usage: 1/3
                            </div>
                            <p className="text-gray-600">Need a push? Use your hints wisely. Mastery is earned, not given.</p>
                        </div>
                    </div>
                </div>

                {/* MAIN AREA: Engine Specific */}
                <div className="flex-1 flex flex-col bg-gray-50 relative overflow-hidden">
                    {renderEngine()}
                </div>
            </div>

            {/* RESULTS OVERLAY (Common) */}
            <AnimatePresence>
                {result && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 z-[700] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className={`w-full max-w-xl p-10 border-8 border-black shadow-[16px_16px_0px_0px_#000] text-center
                                ${result.passed ? 'bg-white' : 'bg-brutal-red text-white'}
                            `}
                        >
                            <div className={`w-24 h-24 mx-auto mb-6 flex items-center justify-center border-4 border-black bg-black text-white ${result.passed ? 'rotate-12' : 'animate-bounce'}`}>
                                {result.passed ? <Trophy size={48} strokeWidth={3} /> : <AlertTriangle size={48} strokeWidth={3} />}
                            </div>

                            <h3 className="text-5xl font-black uppercase mb-4 tracking-tighter italic">
                                {result.passed ? 'MASTERED' : 'RETRY REQUIRED'}
                            </h3>

                            <div className={`p-6 border-4 border-black mb-8 text-left ${result.passed ? 'bg-gray-50' : 'bg-black text-white'}`}>
                                <p className="font-bold text-lg mb-4 underline uppercase">AI Feedback Score: {result.score}/100</p>
                                <p className="font-mono text-sm italic">"{result.feedback}"</p>
                            </div>

                            <div className="flex flex-col gap-4">
                                {result.passed ? (
                                    <button
                                        onClick={() => setShowCertificate(true)}
                                        className="w-full bg-brutal-green text-black border-4 border-black py-4 font-black text-2xl uppercase shadow-[8px_8px_0px_0px_#000] hover:translate-y-1 hover:shadow-none transition-all flex items-center justify-center gap-3"
                                    >
                                        <Trophy size={24} /> CLAIM MY GLORY
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setResult(null)}
                                        className="w-full bg-brutal-yellow text-black border-4 border-black py-4 font-black text-2xl uppercase shadow-[8px_8px_0px_0px_#000] hover:translate-y-1 hover:shadow-none transition-all"
                                    >
                                        I'LL DO BETTER
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Certificate Display */}
            {showCertificate && generatedCert && (
                <MasteryCertificate
                    certificate={generatedCert}
                    onClose={() => {
                        setShowCertificate(false);
                        window.location.href = '/';
                    }}
                />
            )}
        </div>
    );
}
