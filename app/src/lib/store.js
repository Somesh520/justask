// src/lib/store.js

import { create } from 'zustand';
// Removed `persist` and `createJSONStorage` as we are now syncing directly with Firestore.
// import { persist, createJSONStorage } from 'zustand/middleware'

// Import Firebase Firestore functions and `db` instance
import { db } from './firebase'; // Ensure db is correctly imported from your firebase.js
import { doc, writeBatch, Timestamp, collection, query, orderBy, limit, onSnapshot, getDoc, setDoc, runTransaction, increment, deleteDoc } from 'firebase/firestore'; // Import necessary Firestore functions

import { generateRoadmap, parseCareerGoal, generateQuestions, generateManifest } from './gemini';
// Assuming uuidv4 is still used for session IDs; if not, use generateId for consistency.
// import { v4 as uuidv4 } from 'uuid'; // User will need to install this or we use a simple random string

// Simple ID generator - ensure this is unique enough for your use case or use uuidv4
const generateId = () => Math.random().toString(36).substr(2, 9);


export const useStore = create((set, get) => ({

    // ===========================================
    // Core State Variables
    // ===========================================

    // User Authentication State (managed by Firebase onAuthStateChanged in App.jsx)
    user: null,         // { uid, email, displayName, photoURL } - Firebase Auth User data
    isLoggedIn: false,  // Replaces previous 'isAuthenticated'
    // API Configuration
    apiConfig: (() => {
        const localConfig = JSON.parse(localStorage.getItem('api_config'));
        const envGroqKey = import.meta.env.VITE_GROQ_API_KEY;
        const envOpenRouterKey = import.meta.env.VITE_OPENROUTER_API_KEY;

        // Priority 1: Valid local config (that isn't a dummy)
        if (localConfig && localConfig.apiKey && !localConfig.apiKey.includes('dummy')) {
            return localConfig;
        }

        // Priority 2: Environmental Groq Key
        if (envGroqKey && !envGroqKey.includes('dummy')) {
            return {
                provider: 'groq',
                apiKey: envGroqKey,
                baseUrl: 'https://api.groq.com/openai/v1',
                model: 'llama-3.3-70b-versatile'
            };
        }

        // Priority 3: Environmental OpenRouter Key
        if (envOpenRouterKey && !envOpenRouterKey.includes('dummy')) {
            return {
                provider: 'openrouter',
                apiKey: envOpenRouterKey,
                baseUrl: 'https://openrouter.ai/api/v1',
                model: 'arcee-ai/trinity-large-preview:free'
            };
        }

        // Fallback to whatever we have
        return localConfig || {
            provider: 'openrouter',
            apiKey: '',
            baseUrl: 'https://openrouter.ai/api/v1',
            model: 'arcee-ai/trinity-large-preview:free'
        };
    })(),
    isApiKeyModalOpen: false,


    // Engagement Metrics (will be synced with users/{uid} document in Firestore)
    engagementMetrics: {
        currentStreak: 0,      // From Firestore schema
        totalProjects: 0,      // From Firestore schema (renamed from tasksCompletedTotal)
        heatmapData: {},       // From Firestore schema
        showTrap: false,       // Local UI state, but needs to be managed in store
        nodeInteractions: 0,   // Local metric, not directly in Firestore user doc schema
        sessionStartTime: Date.now(), // Local metric
    },

    // Session/Roadmap Management (will be synced with users/{uid}/roadmaps subcollection)
    sessions: {},           // Keyed by ID: { id, goal, role, deadline, phase, questions, roadmap, dailyLog, etc. }
    activeSessionId: null,
    currentTaskIds: null,   // { nodeId, subNodeId, taskIndex } or null
    showExchange: false,    // Toggles the Blueprint Marketplace view
    showManifest: false,    // Toggles the Shipping Manifest view
    manifestData: null,     // Holds the AI-generated manifest
    showQuests: false,      // Toggles the Daily Ritual / Quest panel
    reviewQueue: [],        // List of flagged tasks for later review { nodeId, subNodeId, taskIndex, flaggedAt, title, parentTitle }

    isInitialLoadComplete: false, // Tracks if first Firestore hydration is done


    // ===========================================
    // Core Actions for Firebase Integration
    // ===========================================

    // Action to set user data from Firebase Auth (called by App.jsx's onAuthStateChanged)
    setUser: (userData) => set({ user: userData, isLoggedIn: true }),

    // Action to set API Key
    // Action to set API Config
    setApiConfig: (config) => {
        localStorage.setItem('api_config', JSON.stringify(config));
        // Backwards compatibility for legacy local storage
        if (config.provider === 'openrouter') {
            localStorage.setItem('openrouter_api_key', config.apiKey);
        }
        set({ apiConfig: config });
    },

    setApiKeyModalOpen: (isOpen) => set({ isApiKeyModalOpen: isOpen }),

    // Action to clear user data on logout (called by App.jsx's onAuthStateChanged)
    logoutUser: () => set({
        user: null,
        isLoggedIn: false,
        engagementMetrics: { // Reset engagement metrics to initial state on logout
            currentStreak: 0,
            totalProjects: 0,
            heatmapData: {},
            showTrap: false,
            nodeInteractions: 0,
            sessionStartTime: Date.now(),
        },
        sessions: {},
        activeSessionId: null,
        currentTaskIds: null,
        showManifest: false,
        manifestData: null,
        showQuests: false,
    }),

    // Actions to populate state after fetching from Firestore (Read on Load/Login)
    setEngagementMetrics: (metrics) => set((state) => ({
        engagementMetrics: {
            ...state.engagementMetrics, // Keep local-only metrics if they exist
            currentStreak: metrics.currentStreak || 0,
            totalProjects: metrics.totalProjects || 0,
            heatmapData: metrics.heatmapData || {},
            showTrap: metrics.showTrap ?? false, // Use nullish coalescing for boolean
        }
    })),
    setSessions: (sessionsData) => set((state) => ({
        sessions: { ...state.sessions, ...sessionsData }, // MERGE to prevent race condition overwrites
    })),
    setInitialLoadComplete: (status) => set({ isInitialLoadComplete: status }),
    setActiveSessionId: (id) => set({ activeSessionId: id }),
    setShowExchange: (show) => set({ showExchange: show, activeSessionId: show ? null : get().activeSessionId }),
    setPhase: (sessionId, phase) => set(state => ({
        sessions: {
            ...state.sessions,
            [sessionId]: { ...state.sessions[sessionId], phase }
        }
    })),

    setShowManifest: (show) => set({ showManifest: show }),
    setShowQuests: (show) => set({ showQuests: show }),

    dismissGauntlet: (sessionId) => {
        set(s => ({
            sessions: {
                ...s.sessions,
                [sessionId]: {
                    ...s.sessions[sessionId],
                    phase: 'roadmap',
                    gauntletDismissed: true
                }
            }
        }));
        get().syncToFirestore();
    },

    compileManifest: async () => {
        const state = get();
        if (!state.isLoggedIn || !state.user) return;

        // 1. Aggregate Evidence and Progress
        const evidencePacket = {
            name: state.user.displayName,
            isTest: state.user.displayName === 'hari', // Auto-test for user 'hari'
            metrics: state.engagementMetrics,
            roadmaps: Object.values(state.sessions).map(s => {
                const completedNodes = (s.roadmap?.nodes || []).filter(n => n.status === 'completed');
                const evidenceLinks = [];

                (s.roadmap?.nodes || []).forEach(node => {
                    (node.subNodes || []).forEach(sub => {
                        (sub.tasks || []).forEach(task => {
                            if (task.completed && task.evidence) {
                                evidenceLinks.push(...task.evidence);
                            }
                        });
                    });
                });

                return {
                    goal: s.goal,
                    role: s.role,
                    completedCount: completedNodes.length,
                    totalNodes: (s.roadmap?.nodes || []).length,
                    evidence: evidenceLinks
                };
            })
        };

        try {
            const manifest = await generateManifest(evidencePacket);
            if (manifest) {
                set({ manifestData: manifest, showManifest: true });
            }
        } catch (error) {
            console.error("Manifest Compilation Error:", error);
        }
    },

    // Action to manage the "trap" modal visibility (used by AuthModal)
    openTrap: () => set(state => ({
        engagementMetrics: { ...state.engagementMetrics, showTrap: true }
    })),
    closeTrap: () => set(state => ({
        engagementMetrics: { ...state.engagementMetrics, showTrap: false }
    })),


    // ===========================================
    // NEW: syncToFirestore HELPER FOR BATCH WRITES
    // This function commits current state changes to Firestore
    // = ===========================================
    syncToFirestore: async () => {
        const state = get(); // Get the current state
        if (!state.user || !state.user.uid || !db) {
            // Silently return if not logged in or db not initialized
            return;
        }

        const batch = writeBatch(db);
        const userUid = state.user.uid;

        // 1. Update user document (users/{uid})
        const userRef = doc(db, "users", userUid);
        const userUpdateData = {
            displayName: state.user.displayName, // Assuming this can be updated
            email: state.user.email,             // Assuming this can be updated
            currentStreak: state.engagementMetrics.currentStreak,
            totalProjects: state.engagementMetrics.totalProjects,
            heatmapData: state.engagementMetrics.heatmapData,
            lastActiveDate: state.user.lastActiveDate || null
        };
        batch.set(userRef, userUpdateData, { merge: true }); // Always use set with merge for robustness

        // 2. Update roadmaps sub-collection (users/{uid}/roadmaps)
        // Iterate through all sessions and update them
        Object.keys(state.sessions).forEach(sessionId => {
            const roadmapRef = doc(db, "users", userUid, "goals", sessionId);
            const sessionData = state.sessions[sessionId];
            // Use set with merge:true to update or create roadmap documents
            batch.set(roadmapRef, sessionData, { merge: true });
        });

        try {
            await batch.commit();
            console.log("Firestore batch commit successful!");
        } catch (error) {
            console.error("Error committing Firestore batch:", error);
            // TODO: Implement robust error handling, e.g., revert optimistic UI, show notification, retry mechanism
        }
    },


    // ===========================================
    // Existing Actions (modified for optimistic update + background sync)
    // ===========================================

    createSession: (goal, role, deadline) => {
        const id = generateId();
        const newSession = {
            id,
            goal,
            role,
            deadline,
            status: "active", // Default status for new roadmaps
            phase: 'assessment',
            questions: [],
            currentQuestionIndex: 0,
            knownSkills: [],
            gapSkills: [],
            roadmap: null,
            createdAt: new Date().toISOString(),
            // Ensure session.streak and lastActiveDate are relevant if kept, or remove
            streak: 0,
            lastActiveDate: null,
            dailyLog: {} // { 'YYYY-MM-DD': { tasksCompleted: 0, timeSpent: 0 } }
        };

        set(state => ({
            sessions: { ...state.sessions, [id]: newSession },
            activeSessionId: id,
            // Optimistically update totalProjects (from engagementMetrics)
            engagementMetrics: {
                ...state.engagementMetrics,
                totalProjects: state.engagementMetrics.totalProjects + 1
            }
        }));
        get().syncToFirestore(); // Trigger background sync after creating session and updating metrics
        return id;
    },

    switchSession: (id) => {
        set({ activeSessionId: id, currentTaskIds: null, showExchange: false });
        get().setLastActive();
    },
    setCurrentTask: (ids) => set({ currentTaskIds: ids }),

    updateNodePosition: (nodeId, x, y) => {
        set(state => {
            const session = state.sessions[state.activeSessionId];
            if (!session || !session.roadmap) return {};

            const newNodes = session.roadmap.nodes.map(node =>
                node.id === nodeId ? { ...node, x, y } : node
            );

            return {
                sessions: {
                    ...state.sessions,
                    [state.activeSessionId]: {
                        ...session,
                        roadmap: { ...session.roadmap, nodes: newNodes }
                    }
                }
            };
        });
        get().syncToFirestore();
    },

    setLastActive: () => {
        set((state) => {
            const session = state.sessions[state.activeSessionId];
            if (!session) return {};
            const todayISO = new Date().toISOString();

            return {
                sessions: {
                    ...state.sessions,
                    [state.activeSessionId]: {
                        ...session,
                        lastActiveDate: todayISO
                    }
                }
            };
        });
        get().syncToFirestore();
    },

    setQuestions: (questions) => {
        set(state => {
            const session = state.sessions[state.activeSessionId];
            if (!session) return {};

            return {
                sessions: {
                    ...state.sessions,
                    [state.activeSessionId]: { ...session, questions }
                }
            };
        });
        get().syncToFirestore(); // Sync after questions are set (initial setup)
    },

    answerQuestion: (skill, knowIt) => {
        set((state) => {
            const session = state.sessions[state.activeSessionId];
            if (!session) return {};

            const newKnown = knowIt ? [...session.knownSkills, skill] : session.knownSkills;
            const newGap = !knowIt ? [...session.gapSkills, skill] : session.gapSkills;
            const nextIndex = session.currentQuestionIndex + 1;

            if (nextIndex >= session.questions.length) {
                // Assessment complete, prepare for roadmap generation
                const updatedSession = {
                    ...session,
                    knownSkills: newKnown,
                    gapSkills: newGap,
                    currentQuestionIndex: nextIndex,
                    phase: 'roadmap' // Optimistically set phase to show loading
                };

                // Optimistic update
                set(state => ({
                    sessions: {
                        ...state.sessions,
                        [state.activeSessionId]: updatedSession
                    }
                }));
                get().syncToFirestore(); // Sync after assessment completion and phase update

                // Asynchronously generate roadmap and update state again
                generateRoadmap(session.role, newKnown, newGap).then(roadmap => {
                    set(s => {
                        if (!s.sessions[s.activeSessionId]) return {}; // Session might have changed or been deleted

                        const sessionsAfterRoadmap = {
                            ...s.sessions,
                            [s.activeSessionId]: {
                                ...s.sessions[s.activeSessionId],
                                roadmap,
                                phase: 'roadmap' // Ensure phase is roadmap
                            }
                        };
                        return { sessions: sessionsAfterRoadmap };
                    });
                    get().syncToFirestore(); // Sync after roadmap is generated and added to state
                    get().publishBlueprint(get().activeSessionId); // Automatically integrate into exchange
                }).catch(err => {
                    console.error("Error generating roadmap:", err);
                    // TODO: Handle error, perhaps revert phase
                });

                return {}; // State already updated by the initial set()
            }

            // Still in assessment phase
            const updatedSessions = {
                ...state.sessions,
                [state.activeSessionId]: {
                    ...session,
                    knownSkills: newKnown,
                    gapSkills: newGap,
                    currentQuestionIndex: nextIndex
                }
            };
            return { sessions: updatedSessions };
        });
        // No sync for individual answerQuestion unless it's the last one (handled above)
    },

    submitEvidence: (nodeId, subNodeId, taskIndex, evidence) => {
        set((state) => {
            const session = state.sessions[state.activeSessionId];
            if (!session || !session.roadmap) return {};

            const newNodes = session.roadmap.nodes.map(node => {
                if (node.id !== nodeId) return node;

                const newSubNodes = node.subNodes.map(sub => {
                    if (sub.id !== subNodeId) return sub;

                    const newTasks = [...sub.tasks];
                    const task = newTasks[taskIndex];

                    const taskObj = typeof task === 'string' ? { title: task } : { ...task };

                    const currentEvidence = taskObj.evidence || [];
                    taskObj.evidence = [...currentEvidence, { ...evidence, timestamp: new Date().toISOString() }];

                    newTasks[taskIndex] = taskObj;
                    return { ...sub, tasks: newTasks };
                });

                return { ...node, subNodes: newSubNodes };
            });

            // Track engagement (local metric)
            const newInteractions = state.engagementMetrics.nodeInteractions + 1;

            const updatedSessions = {
                ...state.sessions,
                [state.activeSessionId]: {
                    ...session,
                    roadmap: { ...session.roadmap, nodes: newNodes }
                }
            };
            // --- HEATMAP & STREAK LOGIC ---
            const todayISO = new Date().toISOString();
            const todayYYYYMMDD = todayISO.split('T')[0];
            const yesterdayYYYYMMDD = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            let newCurrentStreak = state.engagementMetrics.currentStreak || 0;
            const lastActiveDateInUserDoc = state.user?.lastActiveDate;

            if (lastActiveDateInUserDoc === todayYYYYMMDD) {
                if (newCurrentStreak === 0) newCurrentStreak = 1;
            } else if (lastActiveDateInUserDoc === yesterdayYYYYMMDD) {
                newCurrentStreak += 1;
            } else {
                newCurrentStreak = 1;
            }

            const updatedHeatmapData = { ...(state.engagementMetrics.heatmapData || {}) };
            updatedHeatmapData[todayYYYYMMDD] = (updatedHeatmapData[todayYYYYMMDD] || 0) + 1;

            const updatedEngagementMetrics = {
                ...state.engagementMetrics,
                nodeInteractions: newInteractions,
                currentStreak: newCurrentStreak,
                heatmapData: updatedHeatmapData
            };

            return {
                sessions: updatedSessions,
                engagementMetrics: updatedEngagementMetrics,
                user: state.user ? { ...state.user, lastActiveDate: todayYYYYMMDD } : null
            };
        });
        get().syncToFirestore();
        if (get().activeSessionId) get().publishBlueprint(get().activeSessionId);
    },

    completeTask: (nodeId, subNodeId, taskIndex, sid = null) => {
        set((state) => {
            const targetSid = sid || state.activeSessionId;
            const session = state.sessions[targetSid];
            if (!session || !session.roadmap) return {};

            let unlockNext = false;

            const newNodes = session.roadmap.nodes.map((node, nIdx) => {
                if (node.id === nodeId) {
                    const newSubNodes = node.subNodes.map((sub, sIdx) => {
                        if (sub.id !== subNodeId) return sub;

                        const newTasks = [...sub.tasks];
                        const task = newTasks[taskIndex];
                        const taskObj = typeof task === 'string' ? { title: task } : { ...task };

                        taskObj.completed = true;
                        taskObj.completedAt = new Date().toISOString();
                        newTasks[taskIndex] = taskObj;

                        return { ...sub, tasks: newTasks };
                    });

                    // Check if node is fully completed (all tasks in all subnodes done)
                    const isFullyCompleted = newSubNodes.every(sn =>
                        sn.tasks.every(t => (typeof t === 'string' ? false : t.completed))
                    );

                    if (isFullyCompleted) {
                        unlockNext = true;

                        // CHECK FOR TOTAL ROADMAP COMPLETION
                        // Check if all OTHER nodes are already completed
                        const otherNodesDone = session.roadmap.nodes
                            .filter(n => n.id !== nodeId)
                            .every(n => n.status === 'completed');

                        if (otherNodesDone) {
                            return {
                                ...node,
                                subNodes: newSubNodes,
                                status: 'completed',
                                phase: 'gauntlet-reveal' // Trigger the Boss Fight!
                            };
                        }

                        return { ...node, subNodes: newSubNodes, status: 'completed' };
                    }

                    return { ...node, subNodes: newSubNodes };
                }
                return node;
            });

            if (unlockNext) {
                // Unlock the NEXT node in the sequence
                const activeNodeIndex = newNodes.findIndex(n => n.id === nodeId);
                if (activeNodeIndex !== -1 && activeNodeIndex < newNodes.length - 1) {
                    const nextNode = newNodes[activeNodeIndex + 1];
                    if (nextNode.status === 'locked') {
                        nextNode.status = 'active';
                    }
                }
            }

            // --- Firestore Schema Updates for User Document ---
            const todayISO = new Date().toISOString();
            const todayYYYYMMDD = todayISO.split('T')[0];
            const yesterdayYYYYMMDD = new Date(Date.now() - 86400000).toISOString().split('T')[0]; // YYYY-MM-DD for yesterday

            let newCurrentStreak = state.engagementMetrics.currentStreak || 0;
            const lastActiveDateInUserDoc = state.user?.lastActiveDate;

            if (lastActiveDateInUserDoc === todayYYYYMMDD) {
                // Already active today. If streak is somehow 0, make it 1 (failsafe for spoiled day)
                if (newCurrentStreak === 0) newCurrentStreak = 1;
            } else if (lastActiveDateInUserDoc === yesterdayYYYYMMDD) {
                newCurrentStreak += 1; // Increment streak
            } else {
                newCurrentStreak = 1; // Start/Restart streak
            }

            const updatedHeatmapData = { ...(state.engagementMetrics.heatmapData || {}) };
            updatedHeatmapData[todayYYYYMMDD] = (updatedHeatmapData[todayYYYYMMDD] || 0) + 1; // Increment intensity for today

            // --- Session-specific updates ---
            const sessionDailyLog = { ...(session.dailyLog || {}) };
            if (!sessionDailyLog[todayYYYYMMDD]) sessionDailyLog[todayYYYYMMDD] = { tasksCompleted: 0, timeSpent: 0 };
            sessionDailyLog[todayYYYYMMDD].tasksCompleted += 1;


            // --- Engagement Tracking for "Trap" and totalProjects ---
            // Assuming `totalProjects` now tracks total completed tasks across all sessions for the user
            const newTotalProjects = state.engagementMetrics.totalProjects + 1;
            let showTrap = state.engagementMetrics.showTrap;

            // TRAP LOGIC: Show if 1+ tasks completed AND not logged in
            if (newTotalProjects >= 1 && !state.isLoggedIn) {
                showTrap = true;
            }

            return {
                sessions: {
                    ...state.sessions,
                    [state.activeSessionId]: {
                        ...session,
                        roadmap: { ...session.roadmap, nodes: newNodes },
                        // This 'streak' on session is separate from user's currentStreak
                        // Update lastActiveDate in session for internal session streak tracking
                        lastActiveDate: todayISO,
                        dailyLog: sessionDailyLog
                    }
                },
                engagementMetrics: {
                    ...state.engagementMetrics,
                    currentStreak: newCurrentStreak,     // Update the user's overall streak
                    totalProjects: newTotalProjects,     // Update the user's total projects/tasks completed
                    heatmapData: updatedHeatmapData,     // Update the user's heatmap
                    showTrap: showTrap
                },
                // Update user object directly for lastActiveDate (so streak calculation is correct next time)
                // This will be picked up by syncToFirestore when it updates the user doc
                user: state.user ? { ...state.user, lastActiveDate: todayYYYYMMDD } : null
            };
        });
        get().syncToFirestore(); // Trigger background sync after optimistic update
        if (get().activeSessionId) get().publishBlueprint(get().activeSessionId);
    },

    logTime: (minutes) => {
        set((state) => {
            const session = state.sessions[state.activeSessionId];
            if (!session) return {};
            const todayYYYYMMDD = new Date().toISOString().split('T')[0];
            const dailyLog = { ...(session.dailyLog || {}) };
            if (!dailyLog[todayYYYYMMDD]) dailyLog[todayYYYYMMDD] = { tasksCompleted: 0, timeSpent: 0 };
            dailyLog[todayYYYYMMDD].timeSpent += minutes;
            return {
                sessions: { ...state.sessions, [state.activeSessionId]: { ...session, dailyLog } }
            };
        });
        get().syncToFirestore(); // Sync after logging time
    },

    toggleReviewLater: (nodeId, subNodeId, taskIndex) => {
        set((state) => {
            const session = state.sessions[state.activeSessionId];
            if (!session || !session.roadmap) return {};

            // 1. Find the task
            const node = session.roadmap.nodes.find(n => n.id === nodeId);
            const subNode = node?.subNodes?.find(s => s.id === subNodeId);
            const task = subNode?.tasks?.[taskIndex];

            if (!task) return {};

            const taskObj = typeof task === 'string' ? { title: task } : task;
            const isFlagged = !taskObj.reviewLater; // Toggle

            // 2. Update task in session
            const newNodes = session.roadmap.nodes.map(n => {
                if (n.id !== nodeId) return n;
                return {
                    ...n,
                    subNodes: n.subNodes.map(s => {
                        if (s.id !== subNodeId) return s;
                        const newTasks = [...s.tasks];
                        const t = newTasks[taskIndex];
                        const tUpdated = typeof t === 'string' ? { title: t } : { ...t };
                        tUpdated.reviewLater = isFlagged;
                        tUpdated.flaggedAt = isFlagged ? new Date().toISOString() : null;
                        newTasks[taskIndex] = tUpdated;
                        return { ...s, tasks: newTasks };
                    })
                };
            });

            // 3. Update Review Queue (Global list for sidebar)
            let newQueue = [...state.reviewQueue];
            const queueId = `${state.activeSessionId}-${nodeId}-${subNodeId}-${taskIndex}`;

            if (isFlagged) {
                newQueue.push({
                    id: queueId,
                    sessionId: state.activeSessionId,
                    nodeId, subNodeId, taskIndex,
                    title: taskObj.title,
                    parentTitle: node.title,
                    subTitle: subNode.title,
                    flaggedAt: new Date().toISOString()
                });
            } else {
                newQueue = newQueue.filter(q => q.id !== queueId);
            }

            return {
                sessions: {
                    ...state.sessions,
                    [state.activeSessionId]: {
                        ...session,
                        roadmap: { ...session.roadmap, nodes: newNodes }
                    }
                },
                reviewQueue: newQueue
            };
        });
        get().syncToFirestore();
    },

    deleteSession: async (id) => {
        const state = get();
        if (state.user?.uid && db) {
            try {
                const roadmapRef = doc(db, "users", state.user.uid, "goals", id);
                await deleteDoc(roadmapRef);
                console.log("Goal removed from cloud storage.");
            } catch (err) {
                console.error("Cloud deletion failed:", err);
            }
        }

        set(state => {
            const newSessions = { ...state.sessions };
            delete newSessions[id];
            // Decrement totalProjects in engagementMetrics if a session corresponds to a "project"
            const newTotalProjects = state.engagementMetrics.totalProjects - 1;
            return {
                sessions: newSessions,
                activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
                engagementMetrics: {
                    ...state.engagementMetrics,
                    totalProjects: Math.max(0, newTotalProjects) // Ensure it doesn't go below 0
                }
            };
        });
        get().syncToFirestore(); // Sync remaining state (engagement metrics)
    },

    reset: () => set({
        activeSessionId: null,
        currentTaskIds: null,
        // DO NOT reset sessions or metrics here, just clear active context
    }),

    // ===========================================
    // BLUEPRINT EXCHANGE ACTIONS
    // ===========================================

    publishBlueprint: async (sessionId, force = false) => {
        const state = get();
        const session = state.sessions[sessionId];
        if (!session || !state.user || !db) return;

        const blueprintRef = doc(db, "public_blueprints", sessionId);

        try {
            const existing = await getDoc(blueprintRef);

            // Only proceed if we are forcing it (initial publish) or if it's already in the exchange (syncing)
            if (!force && !existing.exists()) {
                console.log("Roadmap is private. Skipping sync to exchange.");
                return;
            }

            const metadata = existing.exists() ? {
                stealCount: existing.data().stealCount || 0,
                upvotes: existing.data().upvotes || 0,
                downvotes: existing.data().downvotes || 0,
                votes: existing.data().votes || {}
            } : {
                stealCount: 0,
                upvotes: 0,
                downvotes: 0,
                votes: {}
            };

            const blueprintData = {
                ...session,
                authorName: state.user.displayName,
                authorId: state.user.uid,
                ...metadata,
                publishedAt: existing.exists() ? existing.data().publishedAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await setDoc(blueprintRef, blueprintData);
            console.log("Blueprint synced to exchange!");
        } catch (error) {
            console.error("Publish Sync Error:", error);
        }
    },

    unpublishBlueprint: async (sessionId) => {
        const state = get();
        if (!state.user || !db) return;

        const blueprintRef = doc(db, "public_blueprints", sessionId);

        try {
            const docSnap = await getDoc(blueprintRef);
            if (!docSnap.exists()) return;

            // Security check: only the author can unpublish (authorId is stored in public_blueprints)
            if (docSnap.data().authorId !== state.user.uid) {
                console.error("Unauthorized unpublish attempt");
                return;
            }

            await deleteDoc(blueprintRef);
            console.log("Blueprint removed from exchange!");
        } catch (error) {
            console.error("Unpublish Error:", error);
            if (error.code === 'permission-denied') {
                console.warn("⚠️ PERMISSION DENIED: You must update your Firestore Security Rules in the Firebase Console to allow deletions on 'public_blueprints'.");
            }
        }
    },

    subscribeToExchange: (callback) => {
        const q = query(
            collection(db, "public_blueprints"),
            orderBy("publishedAt", "desc"),
            limit(50)
        );

        return onSnapshot(q, (snapshot) => {
            const blueprints = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            callback(blueprints);
        }, (error) => {
            console.error("Exchange Subscription Error:", error);
        });
    },

    stealBlueprint: async (blueprint, personalize = true) => {
        const state = get();
        if (!state.user) return;

        const newId = generateId();

        // Prepare nodes (reset status for new user)
        let nodes = blueprint.roadmap?.nodes || [];
        if (!personalize) {
            nodes = nodes.map((node, i) => ({
                ...node,
                status: i === 0 ? 'active' : 'locked',
                subNodes: (node.subNodes || []).map(sn => ({
                    ...sn,
                    tasks: (sn.tasks || []).map(t => {
                        const tObj = typeof t === 'string' ? { title: t } : { ...t };
                        return { ...tObj, completed: false, completedAt: null, evidence: [] };
                    })
                }))
            }));
        }

        // Lineage tracking
        const provenance = {
            isForked: true,
            originalAuthorId: blueprint.authorId,
            originalAuthorName: blueprint.authorName,
            forkedFromId: blueprint.id, // The public blueprint ID
            stolenAt: new Date().toISOString()
        };

        const stolenSession = {
            ...blueprint,
            id: newId,
            createdAt: new Date().toISOString(),
            lastActiveDate: new Date().toISOString(),
            isStolen: true,
            provenance, // Store forking history
            phase: personalize ? 'blueprint-assessment' : 'roadmap', // Use blueprint-assessment for tailoring
            currentQuestionIndex: 0,
            questions: [], // Clear initially to show loading state while AI thinks
            answers: {},
            knownSkills: [],
            gapSkills: [],
            progress: 0,
            roadmap: personalize ? blueprint.roadmap : { ...blueprint.roadmap, nodes }
        };

        // --- OPTIMISTIC UPDATE ---
        // Add to local state FIRST so App.jsx doesn't default to 'landing' phase
        set(s => ({
            sessions: { ...s.sessions, [newId]: stolenSession },
            showExchange: false,
            activeSessionId: newId
        }));

        try {
            if (personalize) {
                // Generate tailoring questions immediately
                const { generateTailoringQuestions } = await import('./gemini');
                const tailoringQuestions = await generateTailoringQuestions(blueprint.role || blueprint.goal, blueprint.roadmap?.nodes || []);

                // Update local state with questions once ready
                set(s => ({
                    sessions: {
                        ...s.sessions,
                        [newId]: { ...s.sessions[newId], questions: tailoringQuestions }
                    }
                }));
            }

            // Sync the new session to users/{uid}/goals immediately
            get().syncToFirestore();

            // Increment counter in Firestore (Public record)
            const blueprintRef = doc(db, "public_blueprints", blueprint.id);
            try {
                await runTransaction(db, async (transaction) => {
                    const bDoc = await transaction.get(blueprintRef);
                    if (bDoc.exists()) {
                        transaction.update(blueprintRef, {
                            stealCount: increment(1)
                        });
                    }
                });
            } catch (permError) {
                console.warn("Could not increment public steal count (Permissions):", permError);
                // We ignore this as the personal steal was successful
            }

            return newId;
        } catch (error) {
            console.error("Steal Error:", error);
            return newId; // Fallback: User still has the optimistic version
        }
    },

    voteBlueprint: async (blueprintId, voteType) => {
        const state = get();
        if (!state.user) return;
        const userId = state.user.uid;

        const blueprintRef = doc(db, "public_blueprints", blueprintId);

        try {
            await runTransaction(db, async (transaction) => {
                const bDoc = await transaction.get(blueprintRef);
                if (!bDoc.exists()) throw "Blueprint deleted";

                const data = bDoc.data();
                const votes = data.votes || {};
                const currentVote = votes[userId];

                let newUpvotes = data.upvotes || 0;
                let newDownvotes = data.downvotes || 0;

                // If user is clicking the same vote twice, remove it
                if (currentVote === voteType) {
                    delete votes[userId];
                    if (voteType === 'up') newUpvotes = Math.max(0, newUpvotes - 1);
                    else newDownvotes = Math.max(0, newDownvotes - 1);
                } else {
                    // Changing vote or first time voting
                    if (currentVote === 'up') newUpvotes = Math.max(0, newUpvotes - 1);
                    if (currentVote === 'down') newDownvotes = Math.max(0, newDownvotes - 1);

                    votes[userId] = voteType;
                    if (voteType === 'up') newUpvotes += 1;
                    else newDownvotes += 1;
                }

                transaction.update(blueprintRef, {
                    votes,
                    upvotes: newUpvotes,
                    downvotes: newDownvotes
                });
            });
            console.log("Vote recorded!");
        } catch (error) {
            console.error("Vote Error:", error);
        }
    },

    tailorBlueprint: async (sessionId, knownSkills, gapSkills) => {
        const state = get();
        const session = state.sessions[sessionId];
        if (!session) return;

        // Set phase to roadmap to show "Generating Map..." loading state
        set(s => ({
            sessions: {
                ...s.sessions,
                [sessionId]: {
                    ...session,
                    knownSkills,
                    gapSkills,
                    phase: 'roadmap',
                    roadmap: null // Clear old roadmap to ensure loading screen triggers
                }
            }
        }));

        // Re-generate roadmap using existing goal but new skill profile
        const targetRole = session.role || session.goal;
        const newRoadmap = await generateRoadmap(targetRole, knownSkills, gapSkills);

        set(s => ({
            sessions: {
                ...s.sessions,
                [sessionId]: {
                    ...s.sessions[sessionId],
                    roadmap: newRoadmap
                }
            }
        }));
        get().syncToFirestore();
        get().publishBlueprint(sessionId); // Update shared version if tailored
    },

    generateGauntletChallenge: async (sessionId) => {
        const state = get();
        const session = state.sessions[sessionId];
        if (!session) return;

        const { generateGauntletChallenge } = await import('./gemini');
        const milestoneTitles = (session.roadmap?.nodes || []).map(n => n.title);

        const challenge = await generateGauntletChallenge(session.role || session.goal, milestoneTitles);

        set(s => ({
            sessions: {
                ...s.sessions,
                [sessionId]: {
                    ...s.sessions[sessionId],
                    gauntlet: {
                        ...challenge,
                        status: 'not_started',
                        attempts: 0,
                        submissions: []
                    }
                }
            }
        }));
        get().syncToFirestore();
    },

    startGauntlet: (sessionId) => {
        set(s => ({
            sessions: {
                ...s.sessions,
                [sessionId]: {
                    ...s.sessions[sessionId],
                    phase: 'gauntlet-active',
                    gauntletDismissed: false, // Reset if they finally start
                    gauntlet: {
                        ...s.sessions[sessionId].gauntlet,
                        status: 'in_progress',
                        startedAt: new Date().toISOString()
                    }
                }
            }
        }));
        get().syncToFirestore();
    },

    submitGauntlet: async (sessionId, submissionData) => {
        const state = get();
        const session = state.sessions[sessionId];
        if (!session || !session.gauntlet) return;

        // Set local loading/pending state
        set(s => ({
            sessions: {
                ...s.sessions,
                [sessionId]: {
                    ...s.sessions[sessionId],
                    gauntlet: {
                        ...s.sessions[sessionId].gauntlet,
                        status: 'verifying'
                    }
                }
            }
        }));

        const { verifyGauntletSubmission } = await import('./gemini');
        const result = await verifyGauntletSubmission(session.gauntlet, submissionData);

        set(s => ({
            sessions: {
                ...s.sessions,
                [sessionId]: {
                    ...s.sessions[sessionId],
                    gauntlet: {
                        ...s.sessions[sessionId].gauntlet,
                        status: result.passed ? 'passed' : 'failed',
                        attempts: (s.sessions[sessionId].gauntlet.attempts || 0) + 1,
                        lastResult: result,
                        submissions: [
                            ...(s.sessions[sessionId].gauntlet.submissions || []),
                            { ...submissionData, result, timestamp: new Date().toISOString() }
                        ]
                    },
                    // Update main session status if passed
                    status: result.passed ? 'mastered' : s.sessions[sessionId].status
                }
            }
        }));

        get().syncToFirestore();
        return result;
    },

    createRoadmap: async (goal, deadline) => {
        // 1. Parse goal via Gemini
        const result = await parseCareerGoal(goal);
        if (!result.isValid) throw new Error("Invalid goal");

        const now = new Date();
        let daysToAdd = 90;
        const match = deadline.toLowerCase().match(/(\d+)\s*(month|week|day|year)/);
        if (match) {
            const val = parseInt(match[1]);
            const unit = match[2];
            if (unit.startsWith('day')) daysToAdd = val;
            else if (unit.startsWith('week')) daysToAdd = val * 7;
            else if (unit.startsWith('month')) daysToAdd = val * 30;
            else if (unit.startsWith('year')) daysToAdd = val * 365;
        }
        const targetDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

        // 2. Create Session
        const id = get().createSession(goal, result.role, targetDate);

        // 3. Generate questions
        const questions = await generateQuestions(result.role);
        if (questions && questions.length > 0) {
            get().setQuestions(questions);
        } else {
            throw new Error("Failed to generate questions");
        }
        return id;
    }

}));
