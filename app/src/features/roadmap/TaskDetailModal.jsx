import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, X, CheckSquare } from 'lucide-react'

export function TaskDetailModal({ task, onClose }) {
    if (!task) return null

    // Helper to handle legacy string tasks
    const title = typeof task === 'string' ? task : task.title
    const detail = typeof task === 'string' ? "No details available." : task.detail
    const resources = typeof task === 'string' ? [] : (task.resources || (task.link ? [{ type: 'doc', title: 'Start Resource', url: task.link }] : []))

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />

                {/* Modal */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="relative w-full max-w-lg bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 z-10"
                >
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1 hover:bg-black hover:text-white transition-colors border-2 border-transparent hover:border-black"
                    >
                        <X size={24} />
                    </button>

                    <div className="mb-6">
                        <span className="font-mono text-xs font-bold bg-brutal-yellow px-2 py-1 border-2 border-black inline-block mb-2 transform -rotate-2 shadow-[2px_2px_0px_0px_#000]">
                            TASK DETAILS
                        </span>
                        <h2 className="text-2xl font-black uppercase leading-tight">{title}</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-gray-50 p-4 border-l-4 border-black font-mono text-xs leading-relaxed max-h-40 overflow-y-auto">
                            {detail}
                        </div>

                        {resources.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">Resources</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    {resources.map((res, i) => (
                                        <a
                                            key={i}
                                            href={res.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-between w-full bg-white hover:bg-black hover:text-white p-3 font-bold border-2 border-black transition-all group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`p-1 border-2 border-black ${res.type === 'video' ? 'bg-brutal-red' : 'bg-brutal-blue'}`}>
                                                    <ExternalLink size={14} className="text-white" />
                                                </div>
                                                <span className="text-xs uppercase truncate w-40">{res.title}</span>
                                            </div>
                                            <span className="text-[10px] font-mono text-gray-400 group-hover:text-gray-300 uppercase">{res.type}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3 pt-4 border-t-2 border-dashed border-gray-300">
                            <div className="relative">
                                <input type="checkbox" className="peer w-6 h-6 appearance-none border-3 border-black bg-white checked:bg-brutal-green transition-colors cursor-pointer" />
                                <CheckSquare className="absolute top-0 left-0 pointer-events-none opacity-0 peer-checked:opacity-100 text-white" size={24} />
                            </div>
                            <span className="font-mono text-xs text-gray-500 uppercase font-bold">Mark as Completed</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
