import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { explainConcept } from '../../lib/gemini';
import { useStore } from '../../lib/store';
import ReactMarkdown from 'react-markdown';
import { VolumeX, Send, Sparkles } from 'lucide-react';

import { createPortal } from 'react-dom';

export default function AIExplainPanel({ task, onClose, isOpen, goal }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const [language, setLanguage] = useState('English');

    const languages = [
        { name: 'English', code: 'en-US' },
        { name: 'Hinglish', code: 'hi-IN' },
        { name: 'Spanish', code: 'es-ES' },
        { name: 'French', code: 'fr-FR' },
        { name: 'German', code: 'de-DE' }
    ];

    // Initialize conversation
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([{
                role: 'assistant',
                content: `I can help you understand **${task.title}**. \n\nThis is a key step towards your goal of becoming a **${goal}**. What would you like to know?`,
                timestamp: new Date()
            }]);
        }
    }, [isOpen, task, goal]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (text = input) => {
        if (!text.trim()) return;

        const userMessage = { role: 'user', content: text, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const history = messages.map(m => ({ role: m.role, content: m.content }));
            history.push({ role: 'user', content: text });

            const aiResponseText = await explainConcept(task, history, goal, language);

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: aiResponseText,
                timestamp: new Date()
            }]);
        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "I'm having trouble connecting. Please try again.",
                timestamp: new Date(),
                isError: true
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    // STT Logic - Removed

    const suggestions = [
        "Explain this simply",
        "Show me a code example",
        "Why is this important?",
        "Give me a practice problem"
    ];

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed right-0 top-0 h-full w-full md:w-[500px] bg-white border-l-4 border-black shadow-[-10px_0_30px_rgba(0,0,0,0.2)] z-[9999] flex flex-col"
                >
                    {/* Header */}
                    <div className="bg-brutal-yellow border-b-4 border-black p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-black text-white p-2">
                                <Sparkles size={20} className={isLoading ? 'animate-spin' : ''} />
                            </div>
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-black/60">AI Mentor</div>
                                <h2 className="text-lg font-black uppercase truncate w-48">{task.title}</h2>
                            </div>
                        </div>
                        <div className="flex gap-2 items-center">
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="bg-white border-2 border-black p-1 text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_#000] focus:outline-none"
                            >
                                {languages.map(l => (
                                    <option key={l.code} value={l.name}>{l.name}</option>
                                ))}
                            </select>
                            <button onClick={onClose} className="p-2 hover:bg-black hover:text-white transition-colors border-2 border-black bg-white font-black text-xs uppercase shadow-[2px_2px_0px_0px_#000]">
                                X
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 scrollbar-thin scrollbar-thumb-black">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[90%] p-4 border-3 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${msg.role === 'assistant' ? 'bg-white' : 'bg-brutal-blue text-white'}`}>
                                    <div className={`flex items-center gap-2 mb-2 border-b-2 pb-1 ${msg.role === 'assistant' ? 'border-black/10' : 'border-white/20'}`}>
                                        <span className="text-[10px] font-black uppercase">{msg.role === 'assistant' ? 'SYSTEM_MENTOR' : 'USER_INPUT'}</span>
                                    </div>
                                    <div className={`prose prose-sm font-mono text-xs leading-relaxed ${msg.role === 'assistant' ? 'text-black' : 'text-white'}`}>
                                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white p-3 border-3 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    <span className="animate-pulse font-black text-xs uppercase">Computing Response...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Suggestions */}
                    {messages.length < 5 && (
                        <div className="p-3 bg-gray-100 border-t-2 border-dashed border-black flex flex-wrap gap-2">
                            {suggestions.map(s => (
                                <button
                                    key={s}
                                    onClick={() => handleSend(s)}
                                    className="text-[10px] font-black uppercase px-2 py-1 bg-white border-2 border-black hover:bg-brutal-yellow transition-all"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input */}
                    <div className="p-4 bg-white border-t-4 border-black">
                        <div className="flex gap-2">
                            {/* Voice Input Removed */}
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="ASK ANYTHING..."
                                className="flex-1 p-3 border-2 border-black font-mono text-xs uppercase focus:outline-none focus:bg-brutal-yellow/5"
                                disabled={isLoading}
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={isLoading || !input.trim()}
                                className="bg-black text-white px-6 border-2 border-black font-black uppercase text-xs hover:bg-brutal-yellow hover:text-black transition-all shadow-[4px_4px_0px_0px_#000] disabled:opacity-50 disabled:shadow-none translate-y-[-2px] hover:translate-y-0"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
