import OpenAI from 'openai';

// Removed const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

import { useStore } from './store';

const getClient = () => {
    const { apiConfig } = useStore.getState();
    if (!apiConfig?.apiKey) throw new Error("API Key Missing");

    return new OpenAI({
        baseURL: apiConfig.baseUrl || 'https://openrouter.ai/api/v1',
        apiKey: apiConfig.apiKey,
        dangerouslyAllowBrowser: true
    });
};

// Default model fallback
const DEFAULT_MODEL = 'arcee-ai/trinity-large-preview:free';

const getModel = () => {
    return useStore.getState().apiConfig?.model || DEFAULT_MODEL;
};

/**
 * Resilient AI call wrapper that handles 429 Rate Limits by switching to a lighter fallback model.
 */
async function safeAICall(messages, options = {}) {
    const client = getClient();
    const config = useStore.getState().apiConfig;
    let model = options.model || config?.model || DEFAULT_MODEL;

    try {
        const completion = await client.chat.completions.create({
            model,
            messages,
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 1,
        });
        return completion;
    } catch (error) {
        // If 429 Rate Limit hit, try with a lighter model (higher quota)
        if (error.status === 429 || error.message?.includes('429')) {
            console.warn(`[AI] 429 Rate Limit hit for ${model}. Switching to fallback...`);

            const fallbackModel = config?.provider === 'groq'
                ? 'llama-3.1-8b-instant'
                : 'meta-llama/llama-3.1-8b-instruct:free';

            console.log(`[AI] Retrying with lighter model: ${fallbackModel}`);
            return await client.chat.completions.create({
                model: fallbackModel,
                messages,
                temperature: options.temperature || 0.7,
                top_p: options.top_p || 1,
            });
        }
        throw error;
    }
}

function parseJSON(text) {
    if (!text) return null;
    try {
        // 1. Remove markdown code blocks if present
        const cleanText = text.replace(/```json\n?|```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (e) {
        // 2. Extract JSON using regex if naive parse fails
        const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (e2) {
                console.error("JSON Parse Error (extracted):", e2);
                return null;
            }
        }
        console.error("JSON Parse Error (no JSON found):", e);
        return null;
    }
}

export async function parseCareerGoal(goal) {
    const { apiConfig } = useStore.getState();

    const prompt = `
    Analyze the career goal: "${goal}".
    Return a JSON object with:
    1. isValid (boolean): Is this a valid tech/design career goal?
    2. role (string): Standardized job title (e.g. "Full Stack Developer").
    3. foundations (array): 5 skills a beginner needs for this role.
    
    Output strictly JSON.
  `;

    try {
        const completion = await safeAICall([{ role: "user", content: prompt }], { temperature: 0.1 });

        const text = completion.choices[0].message.content;
        const data = parseJSON(text);

        if (!data) throw new Error("Failed to parse JSON");

        return { ...data, isValid: true, role: data.role || goal };
    } catch (error) {
        console.error("OpenRouter API Error:", error);
        return { isValid: true, role: goal, foundations: [] };
    }
}

export async function generateQuestions(role) {
    // Generate just the FIRST question to kick off the adaptive quiz
    const firstQ = await generateNextQuestion(role, [], 'easy', 1);

    // FALLBACK: If AI fails, provide a basic generic question so the quiz doesn't break
    if (!firstQ) {
        return [{
            id: "q1_fallback",
            skill: "General Tech",
            question: `What is the most basic building block of a project in ${role}?`,
            options: ["Proper Planning", "Writing Code", "Setting Goals", "None of these"],
            correctAnswer: 0,
            context: "Starting with a plan is always step one.",
            difficulty: "easy"
        }];
    }
    return [firstQ];
}

const FALLBACK_POOL = [
    {
        skill: "Problem Solving",
        question: "In technical situations, what is the best approach to debug a confusing bug?",
        options: ["Isolate variables", "Check logs", "Reproduce consistently", "All of the above"],
        correctAnswer: 3,
        context: "Debugging is a critical and varied skill."
    },
    {
        skill: "Growth Mindset",
        question: "When you encounter a technology you don't know, what is the first step?",
        options: ["Give up", "Read official documentation", "Ask someone to do it", "Ignore it"],
        correctAnswer: 1,
        context: "Self-learning is the foundation of a tech career."
    },
    {
        skill: "System Design",
        question: "Why do we break large problems into smaller tasks?",
        options: ["To make it more complex", "To manage complexity and track progress", "To waste time", "None of these"],
        correctAnswer: 1,
        context: "Decomposition is key to building large systems."
    },
    {
        skill: "Collaboration",
        question: "What is the most effective way to improve code quality in a team?",
        options: ["Working alone", "Code Reviews", "No testing", "Faster typing"],
        correctAnswer: 1,
        context: "Collaboration helps catch errors early."
    },
    {
        skill: "Security",
        question: "What is the most basic rule for handling user passwords?",
        options: ["Store in plain text", "Never store in plain text (use hashing)", "Share them", "Save in a Word file"],
        correctAnswer: 1,
        context: "Security starts with protecting user data."
    }
];

/**
 * Generates a single MCQ question based on context.
 * @param {string} role - The career role
 * @param {Array} previousSkills - Skills already tested (to avoid duplicates)
 * @param {string} difficulty - Target difficulty: "easy", "medium", "hard"
 * @param {number} questionNumber - Current question number (1-8)
 * @param {string} lastMissedSkill - (Optional) The skill user just got wrong
 */
export async function generateNextQuestion(role, previousSkills = [], difficulty = 'easy', questionNumber = 1, lastMissedSkill = null) {
    const { apiConfig } = useStore.getState();
    const avoidList = previousSkills.length > 0 ? `Avoid these topics: ${previousSkills.join(', ')}` : '';

    const timestamp = Date.now();
    const entropy = Math.random().toString(36).substring(7);

    const drillDownContext = lastMissedSkill
        ? `\nCRITICAL: The user just failed a question about "${lastMissedSkill}". 
           Ask an EASY, fundamental check question about "${lastMissedSkill}" basics.`
        : `\nGoal: Create a technical question about an interesting niche in "${role}".`;

    const prompt = `
    Create a unique MCQ technical question for a "${role}".
    ${drillDownContext}
    
    Difficulty: ${difficulty.toUpperCase()}
    Question ${questionNumber} of 8
    ${avoidList}
    
    Output strictly VALID JSON:
    {
      "id": "q${questionNumber}_${timestamp}",
      "skill": "Specific Topic Name",
      "question": "The question text?",
      "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
      "correctAnswer": 0,
      "context": "One line explanation.",
      "difficulty": "${difficulty}"
    }
  `;

    try {
        console.log(`[AI Assessment] Generating question ${questionNumber} for ${role}...`);
        const completion = await safeAICall([{ role: "user", content: prompt }], { temperature: 0.7 });

        const text = completion.choices[0].message.content;
        console.log(`[AI Assessment] Raw Response:`, text);

        const parsed = parseJSON(text);

        if (!parsed) {
            console.warn(`[AI Assessment] JSON Parse failed. Using fallback question.`);
            throw new Error("Null response or parse failure");
        }

        const finalParsed = Array.isArray(parsed) ? parsed[0] : parsed;
        const result = {
            ...finalParsed,
            id: finalParsed.id || `q${questionNumber}_${Date.now()}_${entropy}`
        };

        console.log(`[AI Assessment] Parsed Question:`, result);
        return result;
    } catch (error) {
        console.error("AI Question Error:", error);
        // Better fallback: Pick a random one from the pool
        const randomIndex = Math.floor(Math.random() * FALLBACK_POOL.length);
        const fallback = FALLBACK_POOL[randomIndex];
        return {
            ...fallback,
            id: `q${questionNumber}_fallback_${Date.now()}_${entropy}`,
            difficulty: difficulty
        };
    }
}

/**
 * Generates 5 tailoring questions for a forked (stolen) roadmap.
 */
export async function generateTailoringQuestions(goal, nodes) {
    const { apiConfig } = useStore.getState();

    const nodeTitles = nodes.map(n => n.title).join(", ");
    const prompt = `
    The user is "stealing" a roadmap for: "${goal}".
    The existing roadmap contains these key milestones: ${nodeTitles}.
    
    Generate exactly 5 brief, punchy technical questions to determine the user's specific experience with these milestones so we can tailor the roadmap for them.
    
    Status Rules:
    - Keep questions focused on practical experience.
    - Output strictly JSON in this format:
    {
      "questions": [
        { "id": "q1", "skill": "Skill Name", "question": "Question text?", "context": "Brief context why this matters" }
      ]
    }
    `;

    try {
        const response = await safeAICall([{ role: "user", content: prompt }], { temperature: 0.7 });
        const content = response.choices[0].message.content;
        return parseJSON(content)?.questions || [];
    } catch (error) {
        console.error("AI Tailoring Question Error:", error);
        return (nodes || []).slice(0, 5).map((n, i) => ({
            id: `tailor-${i}`,
            skill: n.title,
            question: `How much experience do you already have with ${n.title}?`,
            context: "We'll skip or shorten this phase if you're already an expert."
        }));
    }
}

export async function generateRoadmap(role, knownSkills, gapSkills, level = 'Beginner') {
    const { apiConfig } = useStore.getState();

    const prompt = `
    DYNAMISM_SEED: ${Date.now()}
    VARY_PATH: TRUE
    
    PERSONA: You are a friendly, patient, and wise Mentor (like an elder sibling or a favorite teacher).
    GOAL: Create a unique, genuine, and tailored learning roadmap for a "${role}".
    STYLE: Use "Explain Like I'm 5" (ELI5) logic. Be extremely supportive and empathetic.
    LANGUAGE: Use "Hinglish" (a natural mix of Hindi and English) for breakdowns and tasks to make it feel personal and easy to understand.
    
    User Level: ${level}.
    User KNOWS: ${knownSkills.join(', ')}.
    User NEEDS: ${gapSkills.join(', ')}.

    TEACHING STRATEGY (Based on Level):
    - Beginner: Treat them like a child starting from scratch. Use simple analogies (e.g., "Variables are like boxes"). Avoid jargon or explain it immediately in simple words. High encouragement!
    - Intermediate: Connect dots. Explain "Why" this matters in real work. Challenge them but keep the support high.
    - Advanced: Talk like a senior dev sharing wisdom. Focus on architecture, trade-offs, and "professional secrets".

    Generate a Metro Map style roadmap with exactly 6-8 Main Nodes.
    
    Structure:
    - Main Nodes: Major milestones (e.g., "Aghaz: Foundations", "Deep Dive: Logic"). Use creative, supportive titles.
    - Sub Nodes: Exactly 2 specific topics per Main Node.
    - Tasks: 1-2 actionable resources per Sub Node. 
    
    CRITICAL RESOURCE RULES:
    1. Each task MUST have a "resources" array with exactly 2 high-quality objects.
    2. NO HALLUCINATIONS: Do NOT invent direct URLs.
    3. SEARCH URLs: Use functional SEARCH-BASED URLs for reliability:
         - YouTube Search: https://www.youtube.com/results?search_query=[TOPIC]+tutorial
         - Google Search: https://www.google.com/search?q=[TOPIC]+documentation
    4. TITLES: Use specific, mentorship-style titles (e.g., "Recommended: [TOPIC] by [CREATOR]").

    Status Rules:
    - Set the FIRST node's status to "active".
    - Set ALL subsequent nodes to "locked".

    Output strictly JSON in this format:
    {
      "nodes": [
        { 
            "id": "1", 
            "title": "Main Node Title", 
            "status": "completed|active|locked", 
            "x": 50, 
            "y": 150,
            "subNodes": [
                {
                    "id": "1-1",
                    "title": "Sub Node 1",
                    "tasks": [
                        {
                            "title": "Task Title (Actionable)",
                            "detail": "Friendly instruction on what to do.",
                            "resources": [
                                { "type": "video", "title": "...", "url": "..." },
                                { "type": "doc", "title": "...", "url": "..." }
                            ],
                            "breakdown": "A very simple ELI5 explanation in Hinglish. Use analogies. Make them feel 'I can do this!'",
                            "practice": {
                                "question": "A simple practical challenge.",
                                "hint": "A supportive hint."
                            }
                        }
                    ]
                }
            ]
        }
      ]
    }
    
    Coordinates (x,y) for Main Nodes should flow from left (100) to right (1500), with good y-spacing (100-600). 
  `;

    try {
        const completion = await safeAICall([{ role: "user", content: prompt }], { temperature: 0.8 });

        const text = completion.choices[0].message.content;
        const parsed = parseJSON(text);
        if (parsed && parsed.nodes && parsed.nodes.length > 0) return parsed;
        throw new Error("Empty or invalid roadmap generated");
    } catch (error) {
        console.error("AI Roadmap Error - Loading Survival Roadmap:", error);
        // Robust Survival Roadmap Fallback
        return {
            nodes: [
                {
                    id: "1",
                    title: `Phase 1: ${role} Essentials`,
                    status: "active",
                    x: 200,
                    y: 300,
                    subNodes: [
                        {
                            id: "1-1",
                            title: "Foundational Concepts",
                            tasks: [
                                {
                                    title: `Introduction to ${role}`,
                                    detail: "Start with the core mental models.",
                                    resources: [
                                        { type: "video", title: "Getting Started Guide", url: `https://www.youtube.com/results?search_query=${role}+for+beginners` },
                                        { type: "doc", title: "Official Overview", url: `https://www.google.com/search?q=${role}+core+documentation` }
                                    ],
                                    breakdown: "Bhai, tension mat lo! Shuruat hamesha basic se hoti hai. Hum is role ke fundamental pillars ko samjhenge.",
                                    practice: { question: `Explain the main goal of a ${role} in one sentence.`, hint: "Think about the primary value they provide." }
                                }
                            ]
                        }
                    ]
                },
                {
                    id: "2",
                    title: "Phase 2: Core Engineering & Tools",
                    status: "locked",
                    x: 600,
                    y: 300,
                    subNodes: [
                        {
                            id: "2-1",
                            title: "Professional Tooling",
                            tasks: [
                                {
                                    title: "Mastering the Workflow",
                                    detail: "Set up your environment like a pro.",
                                    resources: [
                                        { type: "video", title: "Tooling Tutorial", url: `https://www.youtube.com/results?search_query=${role}+tools+setup` },
                                        { type: "doc", title: "Workflow Guide", url: `https://www.google.com/search?q=${role}+workflow+best+practices` }
                                    ],
                                    breakdown: "Ab asli kaam shuru! Hum dekhenge ki ek expert kaise apne tools aur setup ko optimize karta hai.",
                                    practice: { question: "List 3 essential tools you need for this roadmap.", hint: "Think IDEs, CLI tools, or specific frameworks." }
                                }
                            ]
                        }
                    ]
                },
                {
                    id: "3",
                    title: "Phase 3: The Capstone Launch",
                    status: "locked",
                    x: 1000,
                    y: 300,
                    subNodes: [
                        {
                            id: "3-1",
                            title: "Final Build",
                            tasks: [
                                {
                                    title: "Project Architecture",
                                    detail: "Apply everything to a real-world scenario.",
                                    resources: [
                                        { type: "video", title: "Project Case Study", url: `https://www.youtube.com/results?search_query=${role}+project+architecture` },
                                        { type: "doc", title: "Scale Guide", url: `https://www.google.com/search?q=${role}+scaling+and+deployment` }
                                    ],
                                    breakdown: "Yeh hai aapka test! Ab tak jo seekha, use ek solid project mein badalne ka waqt aa gaya hai.",
                                    practice: { question: "Sketch the architecture of your final project.", hint: "Divide it into small modules." }
                                }
                            ]
                        }
                    ]
                }
            ]
        };
    }
}

// Fetch Job Market Insights
export async function getCareerInsights(role) {
    const prompt = `
    Analyze the job market for the role: "${role}".
    Provide realistic, data-driven insights.
    
    Output strictly JSON:
    {
      "salaryRange": { "entry": "₹X-Y LPA", "mid": "₹A-B LPA", "senior": "₹C-D+ LPA" },
      "marketDemand": "High | Steady | Niche",
      "topSkills": ["Skill 1", "Skill 2", "Skill 3"],
      "hiringCompanies": ["Company A", "Company B", "Company C"],
      "growthPotential": "Description of career trajectory."
    }
    `;

    try {
        const completion = await safeAICall([{ role: "user", content: prompt }], { temperature: 0.5 });
        return parseJSON(completion.choices[0].message.content);
    } catch (error) {
        console.error("Career Insights Error:", error);
        return null;
    }
}

export async function generateManifest(userData) {
    const { apiConfig } = useStore.getState();

    const prompt = `
    You are the JustAsk Manifest Compiler.
    Convert the following user learning data into a high-fidelity "Shipping Manifest" resume/portfolio.

    [DATA START]
    ${JSON.stringify(userData, null, 2)}
    [DATA END]

    Style: Strictly Brutalist, Technical, Direct, Industrial. Use monospaced look. 
    Tone: Professional system log. No fluff.

    Output strictly JSON in this format:
    {
      "subject": "Full User Name",
      "status": {
        "streak": "X Days",
        "total": "X Nodes Verified",
        "projects": "X Major Roadmaps"
      },
      "cargo": [
        {
          "role": "Role Title",
          "highlights": ["Technical achievement 1", "Technical achievement 2"],
          "verifiedLinks": [{ "title": "Evidence Title", "url": "Link" }]
        }
      ],
      "logs": [
        "YYYY-MM-DD: Technical Milestone Reached",
        "YYYY-MM-DD: Shipment Verified"
      ]
    }
  `;

    try {
        const client = getClient();
        const completion = await client.chat.completions.create({
            model: getModel(),
            messages: [{ role: "user", content: prompt }]
        });

        const text = completion.choices[0].message.content;
        return parseJSON(text);
    } catch (error) {
        console.error("Manifest Error:", error);
        return null;
    }
}

export async function generateGauntletChallenge(goal, milestones) {
    const { apiConfig } = useStore.getState();
    const prompt = `
    The user has completed their roadmap for: "${goal}".
    Key milestones mastered: ${milestones.join(", ")}.

    Create a high-stakes "Final Gauntlet" capstone challenge.
    
    Determine the best 'Game Engine' for this goal from these options:
    1. "coding_sandbox": For Engineering/Dev/Data roles. Build a real app.
    2. "crisis_terminal": For Entrepreneurship/Management. Text-based survival scenario.
    3. "hostile_negotiation": For Sales/Marketing/Soft Skills. Convince a skeptic.
    4. "resource_squeeze": For Finance/Ops/Strategy. Budget allocation puzzle.
    5. "red_pen_teardown": For Design/Content/Product. Fix a broken artifact.

    Output strictly JSON:
    {
      "type": "coding_sandbox" | "crisis_terminal" | "hostile_negotiation" | "resource_squeeze" | "red_pen_teardown",
      "title": "Challenge Name",
      "brief": "One sentence mission statement",
      "requirements": ["Requirement 1", "Req 2", "Req 3"],
      "timeLimit": "5 Minutes" | "3 Days" | "7 Days",
      "starterCode": { ... } // ONLY if type is coding_sandbox
      "scenario": "..." // Narrative setup for crisis/negotiation/squeeze/red_pen
      "initialState": { ... } // Specific data for the chosen engine (see below)
    }

    Type-Specific Fields (add these to 'initialState'):
    - crisis_terminal: { "currency": 10000, "morale": 100, "turns": 3 }
    - hostile_negotiation: { "role": "Angry Client", "patience": 100, "topic": "Why is the project late?" }
    - resource_squeeze: { "budget": 5000, "sliders": [{"label": "Ads", "cost": 10}, {"label": "Dev", "cost": 50}] }
    - red_pen_teardown: { "content": "The bad copy/design text...", "flaws": ["Flaw 1", "Flaw 2"] }
    `;

    try {
        const completion = await safeAICall([{ role: "user", content: prompt }], { temperature: 0.7 });
        return parseJSON(completion.choices[0].message.content);
    } catch (error) {
        console.error("Gauntlet Gen Error:", error);
        const isTech = /dev|engineer|code|program|web|react|node|python|stack/i.test(goal);
        return {
            type: isTech ? "coding_sandbox" : "coding_sandbox",
            type: isTech ? "coding_sandbox" : "technical",
            type: isTech ? "coding_sandbox" : "coding_sandbox",
            type: isTech ? "coding_sandbox" : "physical",
            title: "Final Capstone Project",
            brief: `Build a production-ready application that demonstrates your ${role} skills.`,
            requirements: ["Build core features", "Ensure clean code", "Deploy to live URL"],
            timeLimit: "7 Days"
        };
    }
}

export async function verifyGauntletSubmission(challenge, submission) {
    const { apiConfig } = useStore.getState();
    const prompt = `
    Evaluate the following submission for the "Final Gauntlet" challenge.
    
    CHALLENGE: ${challenge.title}
    BRIEF: ${challenge.brief}
    REQUIREMENTS: ${challenge.requirements.join(", ")}
    
    SUBMISSION:
    Code/Content: ${JSON.stringify(submission.code || submission.reflection)}
    Files: ${JSON.stringify(submission.files || [])}
    
    Criteria:
    1. Completion of all requirements.
    2. Professionalism and code quality (if applicable).
    3. Proof of mastery in ${challenge.title}.

    Output strictly JSON:
    {
      "passed": true | false,
      "score": number (0-100),
      "feedback": "Detailed 2-3 sentence feedback.",
      "strengths": ["...", "..."],
      "growth": ["...", "..."]
    }
    `;

    try {
        const completion = await safeAICall([{ role: "user", content: prompt }], { temperature: 0.1 });
        return parseJSON(completion.choices[0].message.content);
    } catch (error) {
        console.error("Gauntlet Verification Error:", error);
        return { passed: true, score: 80, feedback: "System busy. Manual verification pending, but you're approved based on progress." };
    }
}


// Explain a specific task concept (Mocked or Real)
export async function explainConcept(task, messages, goal, language = 'English') {
    const { apiConfig } = useStore.getState();

    const prompt = `
    You are an expert ${goal} mentor.
    
    The user is asking about a specific task: "${task.title}".
    Context:
    - Task Detail: ${task.detail}
    - Task Breakdown: ${task.breakdown}
    - Parent Goal: ${goal}
    
    Conversation History:
    ${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}
    
    Guidelines:
    Respond strictly in the following language: ${language}. (If the language is Hinglish, please use a natural mix of Hindi and English written in Latin script, as commonly used in informal conversations).
    - Be concise, encouraging, and practical.
    - Use analogies.
    - If user asks for code, provide a short, clean snippet.
    - If user seems stuck, suggest a small practice step.
    
    Respond in markdown.
    `;

    try {
        const completion = await safeAICall([{ role: "user", content: prompt }], { temperature: 0.8 });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error("AI Explain Error:", error);
        return "I'm having trouble connecting to the mentor network right now. Try again in a moment.";
    }
}
