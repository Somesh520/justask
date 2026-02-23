import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Clock } from 'lucide-react'

export function GoalInput({ onSubmit, disabled }) {
    const [goal, setGoal] = useState('')
    const [deadline, setDeadline] = useState('')
    const [step, setStep] = useState(1) // 1 = Goal, 2 = Deadline
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async () => {
        if (isLoading || disabled || deadline.length === 0) return
        setIsLoading(true)
        try {
            await onSubmit(goal, deadline)
        } finally {
            setIsLoading(false)
        }
    }

    const handleGoalKeyDown = (e) => {
        if (e.key === 'Enter' && goal.length > 3) {
            setStep(2)
        }
    }

    const handleDeadlineKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSubmit()
        }
    }

    // Typewriter effect logic
    const placeholderText = "I want to be a..."
    const [placeholder, setPlaceholder] = useState('')

    useEffect(() => {
        let i = 0
        const interval = setInterval(() => {
            setPlaceholder(placeholderText.slice(0, i))
            i++
            if (i > placeholderText.length) clearInterval(interval)
        }, 100)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="w-full max-w-6xl relative">
            <AnimatePresence mode="wait">
                {step === 1 ? (
                    <motion.div
                        key="step1"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="w-full"
                    >
                        <div className="brutal-border bg-white p-2 relative z-10 flex items-center shadow-brutal transition-transform focus-within:-translate-y-1 focus-within:shadow-[8px_8px_0px_0px_#000]">
                            <span className="text-2xl font-black px-6 select-none shrink-0 border-r-3 border-black mr-4 py-2 bg-brutal-yellow">
                                GOAL
                            </span>
                            <div className="flex-1 flex flex-col">
                                <input
                                    type="text"
                                    value={goal}
                                    onChange={(e) => setGoal(e.target.value)}
                                    onKeyDown={handleGoalKeyDown}
                                    placeholder="e.g. FULL STACK DEVELOPER..."
                                    className="w-full text-3xl font-black outline-none font-mono bg-transparent placeholder:text-gray-200 uppercase"
                                    autoFocus
                                />
                                {goal.length > 0 && goal.length <= 3 && (
                                    <span className="text-[10px] font-black text-red-500 font-mono">TYPE AT LEAST 4 CHARACTERS...</span>
                                )}
                                {goal.length > 3 && (
                                    <span className="text-[10px] font-black text-brutal-blue font-mono animate-pulse">PRESS ENTER ↵</span>
                                )}
                            </div>
                            <button
                                onClick={() => goal.length > 3 && setStep(2)}
                                disabled={goal.length <= 3}
                                className={`ml-2 px-6 py-2 bg-black text-white font-black text-lg flex items-center gap-2 hover:bg-brutal-blue transition-all ${goal.length > 3 ? 'opacity-100' : 'opacity-40 cursor-not-allowed'}`}
                            >
                                NEXT <ArrowRight size={20} strokeWidth={3} />
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="w-full"
                    >
                        <div className="brutal-border bg-white p-2 relative z-10 flex items-center shadow-brutal transition-transform focus-within:-translate-y-1 focus-within:shadow-[8px_8px_0px_0px_#000]">
                            <span className="text-2xl font-black px-6 select-none shrink-0 border-r-3 border-black mr-4 py-2 bg-brutal-red text-white">
                                DEADLINE
                            </span>
                            <div className="flex-1 flex flex-col">
                                <input
                                    type="text"
                                    value={deadline}
                                    onChange={(e) => setDeadline(e.target.value)}
                                    onKeyDown={handleDeadlineKeyDown}
                                    placeholder="e.g. 3 MONTHS..."
                                    className="w-full text-3xl font-black outline-none font-mono bg-transparent placeholder:text-gray-200 uppercase"
                                    autoFocus
                                />
                                {deadline.length > 0 && (
                                    <span className="text-[10px] font-black text-brutal-red font-mono animate-pulse uppercase">READY? PRESS ENTER ↵</span>
                                )}
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={isLoading || deadline.length === 0}
                                className={`ml-2 px-6 py-2 bg-black text-white font-black text-lg flex items-center gap-2 hover:bg-brutal-yellow hover:text-black transition-all ${deadline.length > 0 ? 'opacity-100' : 'opacity-40 cursor-not-allowed'} ${isLoading ? 'animate-pulse' : ''}`}
                            >
                                {isLoading ? 'STARTING...' : 'START'}
                                {isLoading ? <Clock size={20} className="animate-spin" /> : <ArrowRight size={20} strokeWidth={3} />}
                            </button>
                        </div>
                        <button
                            onClick={() => setStep(1)}
                            className="mt-4 text-xs font-black opacity-50 hover:opacity-100 bg-white border-2 border-black px-3 py-1 flex items-center gap-1 transition-all"
                        >
                            ← BACK TO GOAL
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Decorative elements */}
            <div className="absolute -top-6 -right-6 w-12 h-12 bg-brutal-blue border-3 border-black z-0" />
            <div className="absolute -bottom-4 -left-4 w-full h-4 bg-gray-200 border-3 border-black z-0 -rotate-1" />
        </div>
    )
}
