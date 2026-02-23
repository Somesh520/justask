import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Download, Award, ShieldCheck, Zap } from 'lucide-react'
import html2canvas from 'html2canvas'

export function MasteryCertificate({ certificate, onClose }) {
    const certRef = useRef(null)

    const handleDownload = async () => {
        if (!certRef.current) return;
        const canvas = await html2canvas(certRef.current, {
            scale: 3,
            backgroundColor: '#ffffff'
        });
        const link = document.createElement('a');
        link.download = `certificate-${certificate.id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative max-w-4xl w-full"
            >
                {/* Actions */}
                <div className="absolute -top-16 right-0 flex gap-4">
                    <button
                        onClick={handleDownload}
                        className="bg-brutal-green text-black px-6 py-3 border-4 border-black font-black uppercase shadow-[4px_4px_0px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-2"
                    >
                        <Download size={20} /> Download PNG
                    </button>
                    <button
                        onClick={onClose}
                        className="bg-white text-black px-6 py-3 border-4 border-black font-black uppercase shadow-[4px_4px_0px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                    >
                        Close
                    </button>
                </div>

                {/* The Certificate UI */}
                <div
                    ref={certRef}
                    className="aspect-[1.414/1] bg-white border-[12px] border-double border-black p-16 flex flex-col items-center justify-between text-black relative overflow-hidden"
                >
                    {/* Security Patterns */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 2px, transparent 2px)', backgroundSize: '20px 20px' }} />
                    <div className="absolute top-0 left-0 w-32 h-32 border-r-4 border-b-4 border-black" />
                    <div className="absolute bottom-0 right-0 w-32 h-32 border-l-4 border-t-4 border-black" />

                    <div className="flex flex-col items-center gap-4 z-10">
                        <Award size={80} strokeWidth={1} className="text-brutal-yellow" />
                        <h1 className="text-4xl font-black uppercase tracking-tight text-center">Certificate of Mastery</h1>
                        <div className="h-1 w-32 bg-black" />
                    </div>

                    <div className="flex flex-col items-center gap-6 z-10 w-full">
                        <p className="font-mono text-sm uppercase tracking-widest opacity-60">This serves as verified evidence that</p>
                        <h2 className="text-6xl font-black uppercase underline decoration-brutal-yellow decoration-8 underline-offset-8">{certificate.userName}</h2>
                        <p className="font-mono text-sm uppercase tracking-widest opacity-60">Has successfully successfully infiltrated and mastered</p>
                        <h3 className="text-3xl font-black uppercase bg-black text-white px-6 py-2">{certificate.role}</h3>
                    </div>

                    <div className="w-full flex justify-between items-end mt-12 z-10">
                        <div className="flex flex-col gap-2">
                            <div className="font-black uppercase text-xs">Verified By:</div>
                            <div className="text-lg font-black italic">JUSTASK_AI_ORACLE</div>
                            <div className="font-mono text-[10px] opacity-40">HASH: {certificate.id.substring(0, 16).toUpperCase()}</div>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                            <ShieldCheck size={48} />
                            <div className="font-black uppercase text-[10px] tracking-tighter">AUTHENTIC_MASTER_ID</div>
                        </div>

                        <div className="flex flex-col gap-2 text-right">
                            <div className="font-black uppercase text-xs">Date of Issue:</div>
                            <div className="text-lg font-black">{new Date(certificate.issuedAt).toLocaleDateString()}</div>
                            <div className="font-mono text-[10px] opacity-40">LEVEL_GAUNTLET: VERIFIED</div>
                        </div>
                    </div>

                    {/* Industrial Corner Stamps */}
                    <div className="absolute top-8 right-8 flex flex-col items-center rotate-12 opacity-10">
                        <Zap size={64} fill="currentColor" />
                        <span className="font-black text-xs uppercase">100%_REAL</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
