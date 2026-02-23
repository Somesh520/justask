import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Zap, Target, TrendingUp, ArrowRight, CheckCircle, XCircle } from 'lucide-react'
import { useStore } from '../../lib/store'

export function SwipeStack({ isTailoring }) {
    const { sessions, activeSessionId, answerQuestion, tailorBlueprint } = useStore()
    const session = sessions[activeSessionId]

    const questions = session?.questions || []
    const currentQuestionIndex = session?.currentQuestionIndex || 0
    const currentQuestion = questions[currentQuestionIndex]
    const answeredCount = (session?.answers || []).length

    const [selectedOption, setSelectedOption] = useState(null)
    const [showResult, setShowResult] = useState(false)
    const [isCorrect, setIsCorrect] = useState(false)

    // Reset selection when question changes
    useEffect(() => {
        setSelectedOption(null)
        setShowResult(false)
    }, [currentQuestionIndex])

    const handleOptionSelect = (optionIndex) => {
        if (showResult) return // Prevent double click
        setSelectedOption(optionIndex)
        const correct = optionIndex === currentQuestion.correctAnswer
        setIsCorrect(correct)
        setShowResult(true)

        // Wait a moment to show result, then proceed
        setTimeout(() => {
            if (isTailoring) {
                const isLastQuestion = answeredCount + 1 >= 8 ||
                    questions.filter(q => !(session?.answers || []).some(a => a.questionId === q.id)).length <= 1
                if (isLastQuestion) {
                    const newKnown = correct ? [...session.knownSkills, currentQuestion.skill] : session.knownSkills
                    const newGap = !correct ? [...session.gapSkills, currentQuestion.skill] : session.gapSkills
                    tailorBlueprint(activeSessionId, newKnown, newGap)
                    return
                }
            }
            answerQuestion(currentQuestion.skill, optionIndex)
        }, 1200)
    }

    // AI Generating State
    if (session?.generatingQuestion) {
        return (
            <div className="w-full max-w-lg h-[400px] bg-white brutal-border flex flex-col items-center justify-center gap-6 z-10 overflow-hidden relative">
                {/* Background scanning effect */}
                <motion.div
                    animate={{ y: [-400, 400] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-b from-transparent via-brutal-green/10 to-transparent pointer-events-none"
                />

                <div className="relative">
                    <Zap size={48} className="text-brutal-yellow animate-bounce" fill="currentColor" />
                    <motion.div
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 bg-brutal-yellow/30 rounded-full blur-xl"
                    />
                </div>

                <div className="flex flex-col items-center gap-2 px-6 text-center">
                    <h2 className="text-2xl font-black uppercase tracking-tighter">AI is Thinking...</h2>
                    <p className="font-mono text-xs text-gray-500 uppercase tracking-widest">
                        Evaluating performance & crafting next challenge
                    </p>
                </div>

                {/* Loading bar bits */}
                <div className="flex gap-1">
                    {[0, 1, 2, 3].map(i => (
                        <motion.div
                            key={i}
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 0.8, delay: i * 0.2, repeat: Infinity }}
                            className="w-3 h-3 bg-black"
                        />
                    ))}
                </div>
            </div>
        )
    }

    // Loading State
    if (!questions || questions.length === 0) {
        return (
            <div className="w-full max-w-lg h-[400px] bg-white brutal-border flex flex-col items-center justify-center gap-4 z-10">
                <div className="w-16 h-16 border-4 border-black border-t-brutal-red rounded-full animate-spin"></div>
                <h2 className="text-2xl font-black uppercase animate-pulse text-center px-4">
                    {isTailoring ? "Initializing Tailoring..." : "Generating Quiz..."}
                </h2>
                <p className="font-mono text-sm text-gray-500">
                    {isTailoring ? "Analyzing Blueprint Milestones" : `Building questions for "${session?.role || 'career path'}"`}
                </p>
            </div>
        )
    }

    // End State
    if (!currentQuestion) {
        return (
            <div className="w-full max-w-lg h-[400px] bg-white brutal-border flex flex-col items-center justify-center gap-4 z-10">
                <div className="w-16 h-16 border-4 border-black border-t-brutal-yellow rounded-full animate-spin"></div>
                <h2 className="text-2xl font-black uppercase animate-pulse text-center px-4">Analyzing Results...</h2>
            </div>
        )
    }

    const difficultyConfig = {
        easy: { color: 'bg-green-500 text-white', label: 'EASY' },
        medium: { color: 'bg-yellow-400 text-black', label: 'MEDIUM' },
        hard: { color: 'bg-red-500 text-white', label: 'HARD' }
    }
    const diff = difficultyConfig[currentQuestion.difficulty] || difficultyConfig.easy

    const optionLabels = ['A', 'B', 'C', 'D']

    return (
        <div className="w-full max-w-lg z-10">
            {/* Progress Header */}
            <div className="flex justify-between items-center mb-4">
                <span className="bg-black text-[#0f0] px-4 py-1.5 font-black font-mono text-sm shadow-brutal uppercase tracking-widest border-2 border-white">
                    Q{answeredCount + 1} / 8
                </span>
                <span className={`px-3 py-1.5 ${diff.color} border-2 border-black font-black text-xs uppercase shadow-[2px_2px_0px_0px_#000]`}>
                    {diff.label}
                </span>
            </div>

            {/* Score Bar */}
            <div className="w-full h-2 bg-gray-200 border-2 border-black mb-4 overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(answeredCount / 8) * 100}%` }}
                    className="h-full bg-brutal-green"
                    transition={{ duration: 0.3 }}
                />
            </div>

            {/* Question Card */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentQuestion.id || currentQuestionIndex}
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -30, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="bg-white border-4 border-black shadow-[6px_6px_0px_0px_#000] overflow-hidden"
                >
                    {/* Skill Tag */}
                    <div className="bg-black text-white px-4 py-2 font-mono text-xs uppercase tracking-wider flex justify-between items-center">
                        <span>{currentQuestion.skill}</span>
                        <span className="text-gray-400">{currentQuestion.context}</span>
                    </div>

                    {/* Question */}
                    <div className="p-6">
                        <h3 className="text-xl font-black leading-snug mb-6">
                            {currentQuestion.question}
                        </h3>

                        {/* Options */}
                        <div className="space-y-3">
                            {(currentQuestion.options || []).map((option, i) => {
                                let optionStyle = 'bg-white hover:bg-gray-50 hover:translate-x-1 hover:shadow-none cursor-pointer'
                                let icon = null

                                if (showResult) {
                                    if (i === currentQuestion.correctAnswer) {
                                        optionStyle = 'bg-green-100 border-green-600'
                                        icon = <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
                                    } else if (i === selectedOption && !isCorrect) {
                                        optionStyle = 'bg-red-100 border-red-500'
                                        icon = <XCircle size={20} className="text-red-500 flex-shrink-0" />
                                    } else {
                                        optionStyle = 'bg-gray-50 opacity-50'
                                    }
                                }

                                return (
                                    <motion.button
                                        key={i}
                                        whileTap={!showResult ? { scale: 0.98 } : {}}
                                        onClick={() => handleOptionSelect(i)}
                                        disabled={showResult}
                                        className={`w-full flex items-center gap-3 p-4 border-3 border-black text-left font-mono text-sm shadow-[3px_3px_0px_0px_#000] transition-all ${optionStyle}`}
                                    >
                                        <span className="w-8 h-8 bg-black text-white flex items-center justify-center font-black text-sm flex-shrink-0">
                                            {optionLabels[i]}
                                        </span>
                                        <span className="flex-1 font-bold">{option}</span>
                                        {icon}
                                    </motion.button>
                                )
                            })}
                        </div>

                        {/* Result Feedback */}
                        <AnimatePresence>
                            {showResult && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`mt-4 p-3 border-3 border-black font-black text-sm uppercase text-center ${isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                                >
                                    {isCorrect ? '✅ CORRECT!' : `❌ Wrong — Answer: ${optionLabels[currentQuestion.correctAnswer]}`}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

// Level Summary Screen (unchanged)
export function LevelSummary() {
    const { sessions, activeSessionId, proceedToRoadmap } = useStore()
    const session = sessions[activeSessionId]

    if (!session) return null

    const { knownSkills = [], gapSkills = [], level = 'Beginner', score = 0, totalAnswered = 0, role } = session

    const levelConfig = {
        Beginner: { color: 'bg-brutal-red', emoji: '🌱', message: "Don't worry! Everyone starts here. Your roadmap will focus on building solid fundamentals.", barColor: 'bg-brutal-red' },
        Intermediate: { color: 'bg-brutal-yellow', emoji: '⚡', message: "Nice foundation! Your roadmap will skip the basics and focus on deeper concepts & projects.", barColor: 'bg-brutal-yellow' },
        Advanced: { color: 'bg-brutal-green', emoji: '🚀', message: "Impressive skills! Your roadmap will focus on advanced patterns, architecture, and real-world challenges.", barColor: 'bg-brutal-green' }
    }
    const config = levelConfig[level] || levelConfig.Beginner

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 20 }}
            className="w-full max-w-lg z-10"
        >
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] overflow-hidden">
                {/* Header */}
                <div className={`${config.color} p-6 border-b-4 border-black`}>
                    <div className="text-center">
                        <div className="text-5xl mb-2">{config.emoji}</div>
                        <div className="text-[10px] font-mono font-black uppercase tracking-[0.3em] opacity-70 mb-1">SKILL LEVEL DETECTED</div>
                        <h2 className="text-4xl font-black uppercase tracking-tight">{level}</h2>
                        <p className="font-mono text-sm mt-2 opacity-80">{score}/{totalAnswered} correct</p>
                    </div>
                </div>

                {/* Score Bar */}
                <div className="p-6 border-b-4 border-black bg-gray-50">
                    <div className="flex justify-between items-center mb-3">
                        <span className="font-black text-sm uppercase">Quiz Score</span>
                        <span className="font-mono text-sm font-bold">{Math.round((score / Math.max(totalAnswered, 1)) * 100)}%</span>
                    </div>
                    <div className="w-full h-6 bg-gray-200 border-3 border-black overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(score / Math.max(totalAnswered, 1)) * 100}%` }}
                            transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                            className={`h-full ${config.barColor}`}
                        />
                    </div>
                </div>

                {/* Skills Breakdown */}
                <div className="p-6 space-y-4">
                    {knownSkills.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp size={16} strokeWidth={3} className="text-brutal-green" />
                                <span className="font-black text-xs uppercase text-brutal-green">Strengths</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {knownSkills.map((skill, i) => (
                                    <span key={i} className="px-2 py-1 bg-green-100 border-2 border-black text-[10px] font-black uppercase">{skill}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {gapSkills.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Target size={16} strokeWidth={3} className="text-brutal-red" />
                                <span className="font-black text-xs uppercase text-brutal-red">To Learn</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {gapSkills.map((skill, i) => (
                                    <span key={i} className="px-2 py-1 bg-red-100 border-2 border-black text-[10px] font-black uppercase">{skill}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    <p className="font-mono text-sm text-gray-600 bg-gray-50 p-3 border-2 border-dashed border-black italic">
                        {config.message}
                    </p>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={proceedToRoadmap}
                        className="w-full p-4 bg-black text-white border-4 border-black font-black text-lg uppercase shadow-[6px_6px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all flex items-center justify-center gap-3"
                    >
                        <Zap size={22} fill="currentColor" />
                        Generate My {level} Roadmap
                        <ArrowRight size={22} strokeWidth={3} />
                    </motion.button>
                </div>
            </div>
        </motion.div>
    )
}
