import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { explainConcept } from '../../lib/gemini';
import { useStore } from '../../lib/store';
import ReactMarkdown from 'react-markdown';
import { Volume2, VolumeX, Mic, MicOff, Send, Sparkles } from 'lucide-react';

import { createPortal } from 'react-dom';

export default function AIExplainPanel({ task, onClose, isOpen, goal }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [ttsEnabled, setTtsEnabled] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [support, setSupport] = useState({ tts: true, stt: true });

    // Check for Browser Support
    useEffect(() => {
        const hasTTS = 'speechSynthesis' in window;
        const hasSTT = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
        setSupport({ tts: hasTTS, stt: hasSTT });
    }, []);

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

    // TTS Logic
    const speak = (text) => {
        if (!ttsEnabled || !support.tts) return;

        window.speechSynthesis.cancel();

        // Clean markdown for better pronunciation
        const cleanText = text
            .replace(/[*#_`]/g, '')
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // [link](url) -> link
            .trim();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
    };

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

            const aiResponseText = await explainConcept(task, history, goal);

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: aiResponseText,
                timestamp: new Date()
            }]);

            if (ttsEnabled) speak(aiResponseText);
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

    const recognitionRef = useRef(null);

    // Cleanup recognition on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    // STT Logic
    const toggleRecording = () => {
        if (!support.stt) {
            alert("Speech recognition is not supported in this browser. Try Chrome.");
            return;
        }

        if (isRecording) {
            try {
                recognitionRef.current?.stop();
            } catch (e) {
                console.error("Stop error:", e);
            }
            setIsRecording(false);
            return;
        }

        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();

            recognition.lang = 'en-US';
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;

            recognition.onstart = () => {
                setIsRecording(true);
                setInput('');
            };

            recognition.onend = () => {
                setIsRecording(false);
                recognitionRef.current = null;
            };

            recognition.onresult = (event) => {
                let fullTranscript = '';
                for (let i = 0; i < event.results.length; ++i) {
                    fullTranscript += event.results[i][0].transcript;
                }
                if (fullTranscript) setInput(fullTranscript);
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);

                // Don't stop for 'no-speech' if we want it to keep listening, 
                // but usually the browser stops it anyway. Use a friendly alert for major issues.
                if (event.error === 'not-allowed') {
                    alert("Microphone access denied. Please allow it in browser settings.");
                } else if (event.error === 'audio-capture') {
                    alert("No microphone found. Please check your hardware.");
                } else if (event.error === 'no-speech' && !isRecording) {
                    // Ignore transient no-speech
                }

                setIsRecording(false);
                recognitionRef.current = null;
            };

            recognitionRef.current = recognition;
            recognition.start();
        } catch (error) {
            console.error("STT Initialization Error:", error);
            setIsRecording(false);
        }
    };

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
                        <div className="flex gap-2">
                            {support.tts && (
                                <button
                                    onClick={() => {
                                        if (ttsEnabled) window.speechSynthesis.cancel();
                                        setTtsEnabled(!ttsEnabled);
                                    }}
                                    className={`p-2 border-2 border-black shadow-[2px_2px_0px_0px_#000] transition-all active:translate-y-0.5 active:shadow-none ${ttsEnabled ? 'bg-brutal-green' : 'bg-white'}`}
                                    title={ttsEnabled ? "Mute Mentor" : "Unmute Mentor"}
                                >
                                    {ttsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                                </button>
                            )}
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
                                        {msg.role === 'assistant' && isSpeaking && (
                                            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity }} className="w-2 h-2 bg-brutal-red rounded-full" />
                                        )}
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
                            {support.stt && (
                                <button
                                    onClick={toggleRecording}
                                    className={`p-3 border-2 border-black transition-all shadow-[2px_2px_0px_0px_#000] relative
                                        ${isRecording ? 'bg-brutal-red text-white animate-pulse' : 'hover:bg-brutal-yellow'}`}
                                    title="Voice Input"
                                >
                                    {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                                    {isRecording && (
                                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                        </span>
                                    )}
                                </button>
                            )}
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                placeholder={isRecording ? "LISTENING..." : "ASK ANYTHING..."}
                                className={`flex-1 p-3 border-2 border-black font-mono text-xs uppercase focus:outline-none focus:bg-brutal-yellow/5
                                    ${isRecording ? 'bg-brutal-red/5' : ''}`}
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
