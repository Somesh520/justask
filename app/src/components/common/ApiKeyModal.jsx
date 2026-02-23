import React, { useState } from 'react';
import { useStore } from '../../lib/store';
import { Key, CheckCircle, AlertCircle, Server, Globe, Box, PlayCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PROVIDERS = [
    { id: 'openrouter', name: 'OpenRouter', icon: Globe, defaultBase: 'https://openrouter.ai/api/v1' },
    { id: 'openai', name: 'OpenAI', icon: Box, defaultBase: 'https://api.openai.com/v1' },
    { id: 'groq', name: 'Groq', icon: Box, defaultBase: 'https://api.groq.com/openai/v1' },
    { id: 'gemini', name: 'Google Gemini', icon: Box, defaultBase: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
    { id: 'custom', name: 'Custom (Local/Other)', icon: Server, defaultBase: 'http://localhost:11434/v1' }
];

export const ApiKeyModal = () => {
    const { apiConfig, setApiConfig, isApiKeyModalOpen, setApiKeyModalOpen } = useStore();
    const [selectedProvider, setSelectedProvider] = useState(apiConfig?.provider || 'openrouter');
    const [apiKey, setApiKey] = useState(apiConfig?.apiKey || '');
    const [baseUrl, setBaseUrl] = useState(apiConfig?.baseUrl || 'https://openrouter.ai/api/v1');
    const [model, setModel] = useState(apiConfig?.model || 'arcee-ai/trinity-large-preview:free');

    // For local validation state
    const [error, setError] = useState('');

    // Controlled by store state now
    if (!isApiKeyModalOpen) return null;

    const handleClose = () => {
        setApiKeyModalOpen(false);
    };

    const handleProviderChange = (providerId) => {
        setSelectedProvider(providerId);
        const provider = PROVIDERS.find(p => p.id === providerId);
        if (provider) {
            setBaseUrl(provider.defaultBase);
            // Reset model default based on provider?
            if (providerId === 'openai') setModel('gpt-4o-mini');
            if (providerId === 'openrouter') setModel('arcee-ai/trinity-large-preview:free');
            if (providerId === 'groq') setModel('llama-3.3-70b-versatile');
            if (providerId === 'gemini') setModel('gemini-1.5-flash');
            if (providerId === 'custom') setModel('llama3');
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');

        if (selectedProvider === 'openrouter' && !apiKey.startsWith('sk-or-')) {
            setError('OpenRouter keys usually start with "sk-or-"');
            return;
        }

        if (selectedProvider === 'openai' && !apiKey.startsWith('sk-')) {
            setError('OpenAI keys usually start with "sk-"');
            return;
        }

        if (selectedProvider === 'groq' && !apiKey.startsWith('gsk_')) {
            setError('Groq keys usually start with "gsk_"');
            return;
        }

        setApiConfig({
            provider: selectedProvider,
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim(),
            model: model.trim()
        });
        setApiKeyModalOpen(false);
    };


    const activeProvider = PROVIDERS.find(p => p.id === selectedProvider);

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[999] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] max-w-2xl w-full flex flex-col md:flex-row overflow-hidden"
                >
                    {/* Sidebar Provider Selection */}
                    <div className="w-full md:w-1/3 bg-gray-50 border-b-4 md:border-b-0 md:border-r-4 border-black p-4 flex flex-col gap-2">
                        <div className="font-black uppercase text-xs text-gray-400 mb-2 tracking-widest">Select Provider</div>

                        {PROVIDERS.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleProviderChange(p.id)}
                                className={`flex items-center gap-3 p-3 text-left border-2 transition-all font-bold uppercase text-xs
                                    ${selectedProvider === p.id
                                        ? 'bg-black text-white border-black shadow-[2px_2px_0px_0px_#888]'
                                        : 'bg-white text-gray-500 border-transparent hover:border-black hover:bg-gray-100'
                                    }
                                `}
                            >
                                <p.icon size={16} />
                                {p.name}
                            </button>
                        ))}
                    </div>

                    {/* Main Form Area */}
                    <div className="w-full md:w-2/3 p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="bg-black text-white p-2">
                                {activeProvider && <activeProvider.icon size={24} />}
                            </div>
                            <h2 className="text-2xl font-black uppercase">One Last Thing...</h2>
                        </div>

                        <p className="font-mono text-sm mb-6 text-gray-600">
                            We need one more Key to move forward to your goal. Configure your bridge to the AI network below.
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-4">

                            {/* Base URL (Hidden for OpenRouter/OpenAI unless simplified?) -> actually useful to show for custom */}
                            {selectedProvider === 'custom' && (
                                <div>
                                    <label className="block font-black uppercase text-[10px] mb-1">Base URL</label>
                                    <input
                                        type="text"
                                        value={baseUrl}
                                        onChange={e => setBaseUrl(e.target.value)}
                                        className="w-full bg-gray-100 border-2 border-black p-2 font-mono text-sm focus:outline-none focus:bg-white transition-all"
                                        placeholder="http://localhost:11434/v1"
                                    />
                                </div>
                            )}

                            {/* API Key */}
                            <div>
                                <label className="block font-black uppercase text-[10px] mb-1">API Key</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={e => { setApiKey(e.target.value); setError(''); }}
                                    className="w-full bg-gray-100 border-2 border-black p-3 font-mono text-sm focus:outline-none focus:bg-white focus:shadow-[4px_4px_0px_0px_#000] transition-all"
                                    placeholder={
                                        selectedProvider === 'openrouter' ? 'sk-or-...' :
                                            selectedProvider === 'groq' ? 'gsk_...' :
                                                'sk-...'
                                    }
                                />
                            </div>

                            {/* Model selection (Simplification: Text input for now) */}
                            <div>
                                <label className="block font-black uppercase text-[10px] mb-1">Model ID</label>
                                <input
                                    type="text"
                                    value={model}
                                    onChange={e => setModel(e.target.value)}
                                    className="w-full bg-gray-100 border-2 border-black p-2 font-mono text-sm focus:outline-none focus:bg-white transition-all"
                                    placeholder="gpt-4, claude-3, etc."
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-brutal-red font-bold text-xs mt-2">
                                    <AlertCircle size={14} /> {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={!apiKey && selectedProvider !== 'custom'} // specific logic
                                className="w-full bg-black text-white py-4 mt-4 border-2 border-transparent font-black uppercase tracking-wider hover:bg-brutal-green hover:text-black hover:border-black hover:shadow-brutal transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Connect System
                            </button>
                        </form>

                        {selectedProvider === 'gemini' && (
                            <div className="mt-4 p-3 bg-red-50 border-l-4 border-red-500 text-xs text-red-700">
                                <strong>Important CORS Warning:</strong> Google's direct API often blocks requests from deployed websites (Vercel, etc.) due to CORS headers.
                                <br /><br />
                                If you see connection errors, please select <strong>OpenRouter</strong> above and use a Gemini model through them (it acts as a secure proxy).
                            </div>
                        )}

                        <div className="mt-6 p-3 bg-gray-50 border-l-4 border-black text-xs font-mono text-gray-500">
                            <strong>Security Note:</strong> Your API key is stored <u>locally on your device</u> via LocalStorage. It is never sent to our servers, only directly to the AI provider you choose.
                        </div>

                        {selectedProvider === 'openrouter' && (
                            <div className="mt-4 text-center">
                                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="font-mono text-xs text-gray-400 hover:text-black underline">
                                    Get a free key from OpenRouter.ai &rarr;
                                </a>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
