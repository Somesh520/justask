import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ChevronRight, Plus, Globe, Share2, Trash2 } from 'lucide-react'
import { useStore } from '../../lib/store'
import { useSound } from '../../hooks/useSound'

export function Sidebar() {
    const [isOpen, setIsOpen] = useState(false)
    const { sessions, activeSessionId, switchSession, reset, showExchange, setShowExchange } = useStore()
    const { playClunk } = useSound()
    const [shakeId, setShakeId] = useState(null)
    const [confirmClearAll, setConfirmClearAll] = useState(false)

    // Sort sessions by creation time desc
    const sessionList = Object.values(sessions).sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    )

    const handleNewGoal = () => {
        reset() // Set activeSessionId to null -> Landing
        setShowExchange(false)
        setIsOpen(false)
    }

    const handleOpenExchange = () => {
        setShowExchange(true)
        setIsOpen(false)
    }

    const handleSelect = (id) => {
        // If clicking same session while in exchange, we still want to exit exchange
        if (id === activeSessionId && !showExchange) {
            setIsOpen(false)
            return
        }

        playClunk()
        setShakeId(id)
        setTimeout(() => setShakeId(null), 500)
        switchSession(id) // Now handles setShowExchange(false)
        setIsOpen(false)
    }

    const getStatusInfo = (session) => {
        const lastActive = session.lastActiveDate ? new Date(session.lastActiveDate) : new Date(session.createdAt)
        const diffDays = Math.floor((new Date() - lastActive) / (1000 * 60 * 60 * 24))
        const hasCobwebs = diffDays > 7

        const deadline = session.deadline ? new Date(session.deadline) : null
        const isMissed = deadline && deadline < new Date()

        return { hasCobwebs, isMissed }
    }

    return (
        <>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed top-4 left-4 z-[100] p-2 bg-white border-3 border-black shadow-brutal hover:translate-y-1 hover:shadow-none transition-all"
                title="Goal Drive"
            >
                <Menu size={24} />
            </button>



            {/* Backdrop */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110]"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', damping: 20 }}
                        className="fixed top-0 left-0 h-full w-80 bg-[#222] border-r-4 border-black z-[120] flex flex-col shadow-[8px_0px_0px_0px_#000]"
                    >
                        {/* Header: Industrial/Hardware feel */}
                        <div className="p-4 border-b-4 border-black flex justify-between items-center bg-brutal-yellow">
                            <h2 className="font-black text-xl uppercase tracking-tighter italic">Drive: GOALS.EXE</h2>
                            <button onClick={() => setIsOpen(false)} className="hover:bg-black/10 p-1">
                                <X size={24} strokeWidth={3} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 pr-6 space-y-6 bg-[#333]">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleNewGoal}
                                className="w-full flex items-center justify-center gap-2 p-4 bg-white border-4 border-black shadow-[4px_4px_0px_0px_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all font-black uppercase text-sm italic"
                            >
                                <Plus size={20} strokeWidth={3} />
                                LOAD NEW DISK
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleOpenExchange}
                                className={`w-full flex items-center justify-center gap-2 p-4 border-4 border-black shadow-[4px_4px_0px_0px_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all font-black uppercase text-sm italic ${showExchange ? 'bg-brutal-yellow' : 'bg-white'}`}
                            >
                                <Globe size={20} strokeWidth={3} />
                                ROADMAP EXCHANGE
                            </motion.button>

                            {/* Clear All Sessions */}
                            {sessionList.length > 1 && (
                                <AnimatePresence>
                                    {!confirmClearAll ? (
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => setConfirmClearAll(true)}
                                            className="w-full flex items-center justify-center gap-2 p-3 bg-brutal-red text-white border-4 border-black shadow-[4px_4px_0px_0px_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all font-black uppercase text-xs italic"
                                        >
                                            <Trash2 size={18} strokeWidth={3} />
                                            EJECT ALL DISKS ({sessionList.length})
                                        </motion.button>
                                    ) : (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="w-full p-4 bg-brutal-red border-4 border-black shadow-[4px_4px_0px_0px_#000]"
                                        >
                                            <p className="font-black text-white text-xs uppercase text-center mb-3">⚠️ DELETE ALL {sessionList.length} GOALS?</p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setConfirmClearAll(false)}
                                                    className="flex-1 p-2 bg-white border-3 border-black font-black text-xs uppercase shadow-[2px_2px_0px_0px_#000] hover:shadow-none hover:translate-y-0.5 transition-all"
                                                >
                                                    CANCEL
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        await useStore.getState().deleteAllSessions();
                                                        setConfirmClearAll(false);
                                                        setIsOpen(false);
                                                    }}
                                                    className="flex-1 p-2 bg-black text-white border-3 border-white font-black text-xs uppercase shadow-[2px_2px_0px_0px_#fff] hover:shadow-none hover:translate-y-0.5 transition-all"
                                                >
                                                    EJECT ALL
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            )}

                            {/* Review Queue Widget */}
                            {useStore.getState().reviewQueue?.length > 0 && (
                                <div className="border-4 border-black bg-white shadow-[4px_4px_0px_0px_#000]">
                                    <div className="bg-purple-600 text-white p-2 flex justify-between items-center border-b-4 border-black">
                                        <h3 className="font-black text-xs uppercase tracking-widest flex items-center gap-2">
                                            <span>📌</span> Review Queue ({useStore.getState().reviewQueue.length})
                                        </h3>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto bg-purple-50">
                                        {useStore.getState().reviewQueue.map((item) => (
                                            <div key={item.id} className="p-3 border-b-2 border-black last:border-b-0 hover:bg-white transition-colors group">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <div className="font-bold text-xs leading-tight mb-1">{item.title}</div>
                                                        <div className="text-[10px] text-gray-500 font-mono uppercase">{item.parentTitle}</div>
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            useStore.getState().toggleReviewLater(item.nodeId, item.subNodeId, item.taskIndex);
                                                        }}
                                                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Remove from queue"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const { switchSession, setCurrentTask } = useStore.getState();
                                                        switchSession(item.sessionId);
                                                        // Close sidebar
                                                        setIsOpen(false);
                                                        // Open the task modal (if we are in the right session)
                                                        setCurrentTask({ nodeId: item.nodeId, subNodeId: item.subNodeId, taskIndex: item.taskIndex });
                                                    }}
                                                    className="w-full text-[10px] font-black uppercase bg-purple-200 hover:bg-purple-300 py-1 border-2 border-black text-purple-900"
                                                >
                                                    Review Now
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                {sessionList.map(session => {
                                    const { hasCobwebs, isMissed } = getStatusInfo(session)
                                    const isActive = activeSessionId === session.id

                                    return (
                                        <motion.div
                                            key={session.id}
                                            animate={shakeId === session.id ? {
                                                x: [-2, 2, -2, 2, 0],
                                                y: [-1, 1, -1, 1, 0]
                                            } : {}}
                                            transition={{ duration: 0.2 }}
                                            onClick={() => handleSelect(session.id)}
                                            className={`
                                                relative cursor-pointer transition-all group
                                                ${isActive ? 'translate-x-4' : 'hover:translate-x-2'}
                                            `}
                                        >
                                            {/* Fork Tag */}
                                            {session.isStolen && (
                                                <div className="absolute -top-2 -right-2 z-20 bg-pink-500 text-white px-3 py-1 text-[10px] font-black uppercase border-2 border-black rotate-12 shadow-[2px_2px_0px_0px_#000]">
                                                    STOLEN
                                                </div>
                                            )}

                                            {/* Delete Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm("Are you letting go of our goal?")) {
                                                        useStore.getState().deleteSession(session.id);
                                                    }
                                                }}
                                                className="absolute -top-3 -left-3 z-30 bg-brutal-red text-white p-1.5 border-2 border-black rounded-full shadow-[2px_2px_0px_0px_#000] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all opacity-0 group-hover:opacity-100"
                                                title="Eject Goal"
                                            >
                                                <X size={14} strokeWidth={4} />
                                            </button>
                                            {/* Cartridge Shape */}
                                            <div className={`
                                                p-4 border-4 border-black shadow-[4px_4px_0px_0px_#000] 
                                                ${isActive ? 'bg-brutal-blue text-white shadow-none' : (session.isStolen ? 'bg-pink-100' : 'bg-brutal-white')}
                                                relative overflow-hidden
                                            `}>
                                                {/* Grip Lines (Cartridge Detail) */}
                                                <div className="absolute top-0 right-8 bottom-0 w-6 flex flex-col gap-1 py-4 opacity-20">
                                                    {[...Array(6)].map((_, i) => (
                                                        <div key={i} className="h-0.5 bg-black w-full" />
                                                    ))}
                                                </div>

                                                {/* Label Section */}
                                                <div className="relative z-10">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[10px] font-mono opacity-60 uppercase font-black tracking-widest">
                                                            ID: {session.id.substring(0, 8)}
                                                        </span>

                                                        {/* Status Light */}
                                                        <div className="flex items-center gap-2">
                                                            <div
                                                                className={`w-2.5 h-2.5 rounded-full border border-black shadow-[0_0_8px] 
                                                                    ${isMissed ? 'bg-brutal-red shadow-red-500' : 'bg-brutal-green shadow-green-500'}
                                                                `}
                                                                title={isMissed ? "Deadline Missed" : "Active"}
                                                            />
                                                        </div>
                                                    </div>

                                                    <h3 className="font-black text-lg leading-none uppercase italic mb-2">
                                                        {session.role || session.goal}
                                                    </h3>

                                                    <div className="flex justify-between items-center text-[10px] font-mono font-black uppercase">
                                                        <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                                                        <span className={`px-1 ${isActive ? 'bg-white text-black' : 'bg-black text-white'}`}>
                                                            {session.phase}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Cobweb Overlay */}
                                                {hasCobwebs && (
                                                    <div className="absolute inset-0 pointer-events-none opacity-40 mix-blend-multiply">
                                                        <svg viewBox="0 0 100 100" className="w-full h-full">
                                                            <path d="M0,0 Q50,20 100,0 M0,20 Q50,40 100,20 M20,0 Q40,50 20,100 M40,0 Q60,50 40,100" fill="none" stroke="gray" strokeWidth="0.5" />
                                                            <circle cx="20" cy="20" r="1.5" fill="gray" />
                                                            <circle cx="80" cy="15" r="1" fill="gray" />
                                                        </svg>
                                                    </div>
                                                )}

                                            </div>

                                            {/* Inserted Indicator */}
                                            {isActive && (
                                                <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-6 h-10 bg-black border-2 border-white rounded-r-lg z-[-1]" />
                                            )}
                                        </motion.div>
                                    )
                                })}
                            </div>

                            {sessionList.length === 0 && (
                                <div className="text-center text-white/30 font-mono text-sm mt-8 border-2 border-white/10 border-dashed p-8">
                                    [ EMPTY DRIVE ]
                                </div>
                            )}
                        </div>

                        {/* Footer Status Bar */}
                        <div className="p-2 bg-black text-[#0f0] font-mono text-[10px] uppercase flex justify-between">
                            <span>Ready...</span>
                            <span>System V4.0</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
