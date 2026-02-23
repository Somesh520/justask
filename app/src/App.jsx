import React, { useEffect, useState, useMemo } from 'react'; // Consolidated React and hooks imports
import { onAuthStateChanged } from 'firebase/auth'; // Firebase Auth
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'; // Firestore functions
import { auth, db } from './lib/firebase'; // Consolidated Firebase imports (db added)
import { useStore } from './lib/store'; // Consolidated Zustand store import
import { motion, AnimatePresence } from 'framer-motion';

// Your existing component imports
import { GoalInput } from './features/landing/GoalInput';
import { SwipeStack, LevelSummary } from './features/assessment/SwipeStack';
import { MetroMap } from './features/roadmap/MetroMap';
import { parseCareerGoal, generateQuestions } from './lib/gemini';
import { Sidebar } from './components/layout/Sidebar';
import { AuthModal } from './features/auth/AuthModal';
import { ContributionGrid } from './features/auth/ContributionGrid';
import { BlueprintExchange } from './features/social/BlueprintExchange';
import { TheManifest } from './features/manifest/TheManifest';
import { generateTailoringQuestions } from './lib/gemini';

import { User, Zap, Flame, Clock, Timer, AlertTriangle, Volume2, VolumeX, Play, SkipForward, Terminal, Trophy } from 'lucide-react';
import { ProfilePage } from './features/profile/ProfilePage';
import { LoadingScreen } from './components/common/LoadingScreen';
import { GauntletOverlay } from './features/gauntlet/GauntletOverlay';
import { GauntletWorkspace } from './features/gauntlet/GauntletWorkspace';
import { TodaysQuest } from './features/roadmap/TodaysQuest';
import { ApiKeyModal } from './components/common/ApiKeyModal';
import { MarketIntelPanel } from './features/roadmap/MarketIntelPanel';
import { getAvailableRoadmaps } from './lib/roadmapService';

function App() {
  // Destructure all necessary state and actions from your Zustand store
  const {
    setUser,                 // For setting basic Firebase user info
    logoutUser,              // For clearing state on logout
    setEngagementMetrics,    // To populate engagementMetrics from Firestore
    setSessions,             // To populate sessions (roadmaps) from Firestore
    setInitialLoadComplete,  // To mark hydration as done
    isInitialLoadComplete,   // Guard for UI
    setActiveSessionId,      // To set the active session after loading
    sessions,
    activeSessionId,
    createSession,           // For creating new sessions (triggers sync)
    createOfficialRoadmapSession, // For creating sessions from roadmap.sh
    setQuestions,            // For setting assessment questions
    user,
    isLoggedIn,              // Replaces 'isAuthenticated' for auth status
    setCurrentTask,          // For navigating to a specific task
    completeTask,            // For marking tasks complete (triggers sync)
    engagementMetrics,       // To display user-specific metrics
    showExchange,
    setShowExchange,
    showManifest,
    setShowManifest,
    showQuests,
    setShowQuests,
    setPhase,
    compileManifest,
    marketIntel,
    showIntel,
    setShowIntel,
    fetchMarketIntel,
    theme,
    setTheme,
    // API & Demo Mode State
    apiConfig,
    demoMode,
    setApiKeyModalOpen
  } = useStore();

  const activeSession = sessions[activeSessionId];
  const phase = activeSession ? activeSession.phase : 'landing';
  const [showReplan, setShowReplan] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [replanDays, setReplanDays] = useState(7);
  const [soundOn, setSoundOn] = useState(false);
  const [showOfficialPicker, setShowOfficialPicker] = useState(false);
  const [officialLoading, setOfficialLoading] = useState(null); // slug or null

  // Fetch Market Intel when entering roadmap phase
  useEffect(() => {
    if (phase === 'roadmap' && activeSession?.role && !marketIntel) {
      fetchMarketIntel(activeSession.role);
    }
  }, [phase, activeSession?.role]);

  // ===============================================
  // Firestore Data Fetching on Auth State Change
  // (The "Read (On Load/Login)" part of Phase 4)
  // ===============================================
  useEffect(() => {
    if (!auth) {
      console.warn("Firebase Auth is not initialized. Skipping auth listener.");
      setInitialLoadComplete(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => { // Made callback async
      if (firebaseUser) {
        console.log("Firebase user detected:", firebaseUser.uid);

        // 1. Set basic Firebase user info in Zustand
        // This gives immediate user data while we fetch more from Firestore.
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });

        // 2. Fetch User Document (for engagementMetrics and more) from Firestore
        if (db) {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userDataFromFirestore = userDocSnap.data();
            console.log("User data from Firestore:", userDataFromFirestore);

            // --- Streak Decay Logic ---
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            let currentStreak = userDataFromFirestore.currentStreak || 0;
            const lastActive = userDataFromFirestore.lastActiveDate;

            if (currentStreak > 0 && lastActive && lastActive !== today && lastActive !== yesterday) {
              console.log("Streak decayed - resetting to 0");
              currentStreak = 0;
              // The next syncToFirestore will persist this 0 to the DB
            }

            // Update user in Zustand with Firestore-specific fields
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              lastActiveDate: userDataFromFirestore.lastActiveDate,
            });

            // Set engagementMetrics in Zustand (using decayed streak if applicable)
            setEngagementMetrics({
              currentStreak: currentStreak,
              totalProjects: userDataFromFirestore.totalProjects || 0,
              heatmapData: userDataFromFirestore.heatmapData || {},
              showTrap: userDataFromFirestore.showTrap ?? false,
            });

          } else {
            console.warn("Firestore user document not found for:", firebaseUser.uid);
            // This case should ideally not happen if AuthModal correctly creates it on first sign-in.
            // If it does, you might want to consider creating a default Firestore user document here
            // or guiding the user through a setup process.
          }

          // 3. Fetch Goals (sessions) from the sub-collection in Firestore
          const roadmapsCollectionRef = collection(db, "users", firebaseUser.uid, "goals");
          const roadmapsSnapshot = await getDocs(roadmapsCollectionRef);
          const loadedSessions = {};
          let firstSessionId = null; // To set the activeSessionId if any roadmaps exist

          roadmapsSnapshot.forEach(doc => {
            const sessionData = doc.data();
            loadedSessions[doc.id] = { id: doc.id, ...sessionData }; // Store with ID
            // Try to set an active roadmap: prefer 'active' status, otherwise just take the first one
            if (!firstSessionId && sessionData.status === "active") {
              firstSessionId = doc.id;
            } else if (!firstSessionId) {
              firstSessionId = doc.id;
            }
          });
          console.log("Loaded sessions from Firestore:", loadedSessions);
          setSessions(loadedSessions); // Update Zustand store with loaded roadmaps (merges with local if any)
        } else {
          console.warn("Firestore service is not initialized.");
        }
        setInitialLoadComplete(true); // Hydration done


      } else {
        // User is signed out.
        console.log("No Firebase user is signed in.");
        logoutUser(); // Clear all user-related state in Zustand
        setInitialLoadComplete(true); // Don't block guest users
      }
    });

    // Clean up the listener on component unmount to prevent memory leaks
    return () => unsubscribe();
  }, [setUser, logoutUser, setEngagementMetrics, setSessions, setActiveSessionId]); // Dependencies for useEffect

  // GAUNTLET AUTO-TRIGGER: Detect 100% completion and transition to reveal phase
  useEffect(() => {
    if (!activeSession || activeSession.phase !== 'roadmap') return;

    const roadmap = activeSession.roadmap;
    if (!roadmap?.nodes) return;

    const allNodesDone = roadmap.nodes.every(n => n.status === 'completed');
    if (allNodesDone && !activeSession.gauntletDismissed) {
      console.log("Roadmap 100% Complete. Triggering Gauntlet Reveal...");
      setPhase(activeSessionId, 'gauntlet-reveal');
    }
  }, [activeSession, activeSessionId, setPhase]);

  // Time of Day theme calculation
  const timeOfDayBg = useMemo(() => {
    // RED ALERT: Roadmap complete but Gauntlet pending
    const nodes = activeSession?.roadmap?.nodes;
    const allNodesDone = nodes && nodes.length > 0 && nodes.every(n => n.status === 'completed');
    const gauntletPassed = activeSession?.gauntlet?.status === 'passed';

    if (allNodesDone && !gauntletPassed && phase === 'roadmap') {
      return 'bg-brutal-red animate-pulse-slow';
    }

    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'bg-[#FFFBF0]'; // warm morning
    if (hour >= 12 && hour < 18) return 'bg-brutal-white'; // neutral afternoon
    return 'bg-[#F0F0F5]'; // cool night
  }, [activeSession, phase]);


  // Helper to parse "3 months", "2 weeks", etc. for deadlines
  const calculateTargetDate = (inputStr) => {
    if (!inputStr) return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // Default 90 days

    const str = inputStr.toLowerCase();
    const now = new Date();
    let daysToAdd = 90; // fallback

    const match = str.match(/(\d+)\s*(month|week|day|year)/);
    if (match) {
      const val = parseInt(match[1]);
      const unit = match[2];
      if (unit.startsWith('day')) daysToAdd = val;
      else if (unit.startsWith('week')) daysToAdd = val * 7;
      else if (unit.startsWith('month')) daysToAdd = val * 30;
      else if (unit.startsWith('year')) daysToAdd = val * 365;
    }

    return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
  };

  // Handler for submitting a new goal
  const handleGoalSubmit = async (goal, deadline) => {
    console.log('Goal submitted:', goal, deadline);

    // 0. CHECK FOR API KEY OR DEMO MODE
    const hasKey = apiConfig?.apiKey && apiConfig.apiKey.length > 5;
    if (!hasKey && !demoMode) {
      console.log("No API Key or Demo Mode detected. Triggering Modal.");
      setApiKeyModalOpen(true);
      return; // Stop execution here. User must configure key/demo and click submit again.
    }

    // 1. Parse goal via Gemini
    const result = await parseCareerGoal(goal);
    console.log('Gemini Result:', result);

    if (result.isValid) {
      // Parse deadline to date format
      const targetDate = calculateTargetDate(deadline);

      // 2. Create Session (this sets it as active)
      createSession(goal, result.role, targetDate);

      // 3. Generate questions via Gemini
      console.log('Generating questions for:', result.role);
      const questions = await generateQuestions(result.role);

      if (questions && questions.length > 0) {
        setQuestions(questions);
      } else {
        alert('Failed to generate questions. Please try again.');
      }
    } else {
      alert("Invalid goal.");
    }
  };

  // Calculate time metrics for display
  const daysLeft = activeSession?.deadline && !isNaN(new Date(activeSession.deadline)) ? Math.ceil((new Date(activeSession.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
  const dayNumber = activeSession?.createdAt ? Math.max(1, Math.ceil((new Date() - new Date(activeSession.createdAt)) / (1000 * 60 * 60 * 24))) : 1;
  const totalDays = activeSession?.createdAt && activeSession?.deadline ? Math.ceil((new Date(activeSession.deadline) - new Date(activeSession.createdAt)) / (1000 * 60 * 60 * 24)) : 90;

  // Safe display for total days
  const displayTotalDays = isNaN(totalDays) ? '90' : totalDays;

  // Apply Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Find current focus: first incomplete task across all nodes
  const currentFocusTask = useMemo(() => {
    if (!activeSession?.roadmap?.nodes) return null;

    for (const node of activeSession.roadmap.nodes) {
      if (node.status === 'locked') continue;
      for (const sub of (node.subNodes || [])) {
        for (let i = 0; i < (sub.tasks || []).length; i++) {
          const task = sub.tasks[i];
          const t = typeof task === 'string' ? { title: task } : task;
          if (!t.completed) {
            return { ...t, nodeId: node.id, subNodeId: sub.id, taskIndex: i };
          }
        }
      }
    }

    // EDGE CASE: If all tasks are done but gauntlet is not completed
    const allNodesDone = activeSession.roadmap.nodes.every(n => n.status === 'completed');
    const gauntletPassed = activeSession.gauntlet?.status === 'passed';

    if (allNodesDone && !gauntletPassed) {
      return {
        title: 'FINAL GAUNTLET',
        isGauntlet: true,
        brief: activeSession.gauntlet?.title || 'Capstone Challenge'
      };
    }

    return null;
  }, [activeSession]);

  // Handler for Start/Skip buttons
  const handleStartNow = () => {
    if (currentFocusTask) {
      if (currentFocusTask.isGauntlet) {
        setPhase(activeSessionId, 'gauntlet-reveal');
        return;
      }
      setCurrentTask({ nodeId: currentFocusTask.nodeId, subNodeId: currentFocusTask.subNodeId, taskIndex: currentFocusTask.taskIndex });
    }
  };

  const handleSkip = () => {
    if (currentFocusTask) {
      completeTask(currentFocusTask.nodeId, currentFocusTask.subNodeId, currentFocusTask.taskIndex); // completeTask also triggers syncToFirestore
    }
  };
  const todayKey = new Date().toISOString().split('T')[0];
  const timeToday = activeSession?.dailyLog?.[todayKey]?.timeSpent || 0;

  // Motivational quotes
  const QUOTES = [
    "Every expert was once a beginner.",
    "The best time to start was yesterday. The next best time is now.",
    "Small daily improvements lead to staggering long-term results.",
    "You don't have to be great to start. You have to start to be great.",
    "Progress, not perfection.",
    "Consistency beats intensity.",
    "The only way to learn is to build.",
    "Show your work. Ship your code.",
    "Your roadmap is yours alone. Own it.",
    "One task at a time. That's the whole secret."
  ];
  const quoteIndex = activeSessionId ? activeSessionId.charCodeAt(0) % QUOTES.length : 0;
  const quote = QUOTES[quoteIndex];

  return (
    <div className={`min-h-screen ${timeOfDayBg} flex flex-col items-center p-4 relative overflow-hidden transition-colors duration-1000`}>
      <AnimatePresence>
        {!isInitialLoadComplete && <LoadingScreen />}
      </AnimatePresence>
      <ApiKeyModal />
      {phase !== 'gauntlet-active' && <Sidebar />}
      {/* AuthModal will appear based on engagementMetrics.showTrap state */}
      {engagementMetrics.showTrap && <AuthModal />}
      {showProfile && <ProfilePage onClose={() => setShowProfile(false)} />}
      {showExchange && (
        <BlueprintExchange onClose={() => setShowExchange(false)} />
      )}

      {showManifest && (
        <TheManifest onClose={() => setShowManifest(false)} />
      )}

      {/* Profile Icon - Top Right Absolute */}
      {phase !== 'gauntlet-active' && (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 items-end">
          <button
            onClick={() => setShowProfile(true)}
            className="bg-white border-2 border-black p-2 shadow-brutal hover:translate-y-0.5 hover:shadow-none transition-all"
            title="View Profile"
          >
            <User size={24} strokeWidth={2.5} />
          </button>

          {isLoggedIn && (
            <button
              onClick={() => setShowQuests(true)}
              className="group bg-brutal-yellow border-2 border-black px-3 py-2 shadow-brutal hover:translate-y-0.5 hover:shadow-none transition-all flex items-center gap-2"
              title="Daily Ritual"
            >
              <Flame size={20} className="text-brutal-red" />
              <span className="font-black text-xs uppercase hidden group-hover:block">Daily Ritual</span>
            </button>
          )}

          {/* Theme Switcher */}
          {isLoggedIn && (
            <div className="flex flex-col gap-2 bg-white/50 p-1 border-2 border-black shadow-brutal">
              <button
                onClick={() => setTheme('default')}
                className={`w-6 h-6 border-2 border-black transition-all hover:scale-110 bg-white ${theme === 'default' ? 'ring-2 ring-brutal-yellow' : ''}`}
                title="Light"
              />
              <button
                onClick={() => setTheme('dracula')}
                className={`w-6 h-6 border-2 border-black transition-all hover:scale-110 bg-[#bd93f9] ${theme === 'dracula' ? 'ring-2 ring-white' : ''}`}
                title="Dracula"
              />
              <button
                onClick={() => setTheme('nord')}
                className={`w-6 h-6 border-2 border-black transition-all hover:scale-110 bg-[#88c0d0] ${theme === 'nord' ? 'ring-2 ring-white' : ''}`}
                title="Nord"
              />
              <button
                onClick={() => setTheme('monokai')}
                className={`w-6 h-6 border-2 border-black transition-all hover:scale-110 bg-[#f92672] ${theme === 'monokai' ? 'ring-2 ring-white' : ''}`}
                title="Monokai"
              />
            </div>
          )}
        </div>
      )}

      <TodaysQuest isOpen={showQuests} onClose={() => setShowQuests(false)} />

      {/* Background Dot Pattern */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(#000 2px, transparent 2px)', backgroundSize: '24px 24px' }}
      />

      <div className="z-10 w-full max-w-7xl flex flex-col items-center gap-6">

        {/* Market Intelligence Panel */}
        {phase === 'roadmap' && showIntel && (
          <MarketIntelPanel data={marketIntel} onClose={() => setShowIntel(false)} />
        )}

        {/* Dynamic Header */}
        {showExchange ? null : phase === 'roadmap' ? (
          <div className="w-full flex flex-col bg-white border-3 border-black shadow-brutal mb-4">
            {/* Top Row: Goal + Metrics */}
            <div className="flex flex-col md:flex-row justify-between items-center px-6 py-5 gap-4">
              <div>
                <span className="font-mono text-xs text-gray-500 uppercase">Current Goal</span>
                <h1 className="text-3xl font-black uppercase leading-none">{activeSession?.role || activeSession?.goal}</h1>
              </div>

              <div className="flex gap-3 flex-wrap items-center">
                {/* Day Counter */}
                <div className="flex items-center gap-1.5 bg-black text-white px-4 py-2 font-mono text-base font-bold">
                  <Zap size={18} fill="currentColor" /> DAY {dayNumber}/{displayTotalDays}
                </div>
                {/* Streak - Now uses engagementMetrics.currentStreak */}
                <div className="flex items-center gap-1.5 bg-brutal-red text-white px-4 py-2 font-mono text-base font-bold">
                  <Flame size={18} fill="currentColor" /> STREAK: {engagementMetrics.currentStreak || 0}
                </div>
                {/* Days Left */}
                <div className="flex items-center gap-1.5 bg-brutal-yellow text-black px-4 py-1.5 font-mono text-base font-bold border-2 border-black">
                  <Clock size={18} strokeWidth={3} /> {daysLeft > 0 ? daysLeft : 0} DAYS LEFT
                </div>
                {/* Time Today */}
                <div className="flex items-center gap-1.5 bg-gray-100 text-black px-4 py-1.5 font-mono text-base border-2 border-black">
                  <Timer size={18} strokeWidth={2.5} /> {Math.floor(timeToday / 60)}h {timeToday % 60}m TODAY
                </div>
              </div>
            </div>

            {/* Bottom Row: Current Focus + Actions */}
            <div className="flex flex-col md:flex-row items-center justify-between border-t-2 border-black px-6 py-4 bg-gray-50 gap-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-gray-500 uppercase whitespace-nowrap">Current Focus:</span>
                <span className={`font-black text-xl uppercase truncate max-w-md ${currentFocusTask?.isGauntlet ? 'text-brutal-red bg-black px-2' : ''}`}>
                  {currentFocusTask ? currentFocusTask.title : 'All caught up! 🎉'}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={handleStartNow} className={`${currentFocusTask?.isGauntlet ? 'bg-brutal-yellow' : 'bg-brutal-green'} text-black px-5 py-2 border-2 border-black font-bold text-base uppercase shadow-[3px_3px_0px_0px_#000] hover:translate-y-0.5 hover:shadow-none transition-all flex items-center gap-2`}>
                  {currentFocusTask?.isGauntlet ? <Trophy size={18} /> : <Play size={18} fill="currentColor" />}
                  {currentFocusTask?.isGauntlet ? 'Enter Gauntlet' : 'Start Now'}
                </button>
                <button onClick={handleSkip} className="bg-white text-black px-5 py-2 border-2 border-black font-bold text-base uppercase shadow-[3px_3px_0px_0px_#000] hover:translate-y-0.5 hover:shadow-none transition-all flex items-center gap-2">
                  <SkipForward size={18} fill="currentColor" /> Skip
                </button>
                <button
                  onClick={() => setShowReplan(true)}
                  className="bg-brutal-red/10 text-brutal-red px-4 py-2 border-2 border-brutal-red font-bold text-sm uppercase shadow-[2px_2px_0px_0px_rgba(239,68,68,0.5)] hover:translate-y-0.5 hover:shadow-none transition-all flex items-center gap-2"
                >
                  <AlertTriangle size={18} strokeWidth={3} /> Life Happened
                </button>
                <button
                  onClick={() => setSoundOn(!soundOn)}
                  className={`px-3 py-1.5 border-2 border-black text-sm transition-all ${soundOn ? 'bg-brutal-yellow' : 'bg-white'} flex items-center justify-center`}
                  title={soundOn ? 'Sound On' : 'Sound Off'}
                >
                  {soundOn ? <Volume2 size={18} strokeWidth={3} /> : <VolumeX size={18} strokeWidth={3} />}
                </button>
              </div>
            </div>

            {/* Quote Bar */}
            <div className="text-center py-1.5 border-t border-gray-200 bg-white">
              <p className="font-mono text-xs text-gray-400 italic">"{quote}"</p>
            </div>

            {/* Heatmap (Visible if we have sessions) - now passing heatmapData */}
            {activeSession && <ContributionGrid heatmapData={engagementMetrics.heatmapData} />}

          </div>
        ) : (
          /* Landing Header */
          <div className="text-center space-y-4 mt-8">
            <div className="inline-block bg-brutal-black text-white px-4 py-1 font-bold mb-4 transform -rotate-2 border-2 border-transparent hover:border-brutal-yellow transition-colors">
              V4.0 ONLINE
            </div>
            <h1 className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-none shadow-brutal-text">
              Just Ask.
            </h1>
            <p className="text-xl md:text-2xl font-mono font-bold bg-brutal-yellow inline-block px-4 py-1 border-3 border-black shadow-brutal transform rotate-1">
              Goal First. Action Always.
            </p>

            {/* User Greeting if logged in - now uses isLoggedIn */}
            {isLoggedIn && user && (
              <div className="mt-4 font-mono text-lg font-bold text-center">
                Welcome back, <span className="text-brutal-blue">{user.displayName}</span>!
              </div>
            )}
          </div>
        )}

        {/* Phase Switcher */}
        <div className="w-full flex justify-center mt-12 min-h-[400px]">
          <AnimatePresence mode="wait">
            {!showExchange && (
              <motion.div
                key={activeSessionId + phase}
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -100, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                className="w-full flex justify-center"
              >
                {phase === 'landing' && (
                  <div className="flex flex-col items-center gap-16">
                    <GoalInput onSubmit={handleGoalSubmit} disabled={!isInitialLoadComplete} />

                    {/* Official Roadmaps Picker */}
                    <div className="w-full max-w-3xl">
                      <motion.button
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowOfficialPicker(!showOfficialPicker)}
                        className="w-full px-8 py-5 bg-brutal-blue text-white border-4 border-black font-black text-xl uppercase shadow-[6px_6px_0px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all flex items-center justify-center gap-3"
                      >
                        <span className="text-2xl">🗺️</span>
                        {showOfficialPicker ? 'HIDE CURATED ROADMAPS' : 'BROWSE CURATED ROADMAPS'}
                        <span className="text-xs bg-black text-brutal-yellow px-2 py-1 rounded-sm ml-2">AI POWERED</span>
                      </motion.button>

                      <AnimatePresence>
                        {showOfficialPicker && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="overflow-hidden"
                          >
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4 p-4 bg-white border-4 border-black">
                              {getAvailableRoadmaps().map(rm => (
                                <motion.button
                                  key={rm.slug}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  disabled={officialLoading !== null}
                                  onClick={async () => {
                                    setOfficialLoading(rm.slug);
                                    try {
                                      await createOfficialRoadmapSession(rm.slug);
                                    } catch (err) {
                                      alert(`Failed to load roadmap: ${err.message}`);
                                    } finally {
                                      setOfficialLoading(null);
                                      setShowOfficialPicker(false);
                                    }
                                  }}
                                  className={`p-4 border-2 border-black font-bold text-left transition-all ${officialLoading === rm.slug
                                    ? 'bg-brutal-yellow animate-pulse'
                                    : officialLoading !== null
                                      ? 'opacity-50 cursor-not-allowed bg-gray-100'
                                      : 'bg-white hover:bg-brutal-yellow shadow-brutal hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none'
                                    }`}
                                >
                                  <div className="text-2xl mb-1">{rm.icon}</div>
                                  <div className="font-mono text-sm uppercase tracking-wide">{rm.title}</div>
                                  {officialLoading === rm.slug && (
                                    <div className="text-xs mt-1 font-mono text-gray-600 animate-pulse">Loading...</div>
                                  )}
                                </motion.button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {isLoggedIn && (
                      <motion.button
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={compileManifest}
                        className="group relative px-10 py-5 bg-brutal-green border-4 border-black font-black text-2xl uppercase shadow-[8px_8px_0px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <Terminal size={28} strokeWidth={3} />
                          Compile Manifest
                        </div>
                        <div className="absolute -top-4 -right-4 bg-black text-white text-[12px] px-3 py-1.5 rotate-12 group-hover:rotate-0 transition-transform border-2 border-white">
                          VERIFIED ASSET
                        </div>
                      </motion.button>
                    )}
                  </div>
                )}

                {(phase === 'assessment' || phase === 'blueprint-assessment') && (
                  <SwipeStack isTailoring={phase === 'blueprint-assessment'} />
                )}

                {phase === 'level-summary' && (
                  <LevelSummary />
                )}

                {phase === 'roadmap' && (
                  <div className="w-full">
                    <MetroMap />
                  </div>
                )}

                {phase === 'gauntlet-reveal' && (
                  <GauntletOverlay />
                )}

                {phase === 'gauntlet-active' && (
                  <GauntletWorkspace />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Feature Grid (Only on Landing) */}
        {!showExchange && phase === 'landing' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-12 mb-12">
            <div className="brutal-border p-6 bg-white shadow-brutal hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all cursor-crosshair">
              <h3 className="font-bold text-xl mb-2 flex items-center gap-2">
                <span className="w-4 h-4 bg-brutal-red rounded-full border-2 border-black"></span>
                GAP ANALYSIS
              </h3>
              <p className="font-mono text-sm text-gray-600">
                Identify what you don't know in 30 seconds.
              </p>
            </div>
            <div className="brutal-border p-6 bg-brutal-blue text-white shadow-brutal hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all cursor-crosshair">
              <h3 className="font-bold text-xl mb-2 flex items-center gap-2">
                <span className="w-4 h-4 bg-white rounded-full border-2 border-black"></span>
                METRO MAP
              </h3>
              <p className="font-mono text-sm opacity-90">
                Non-linear roadmap for non-linear careers.
              </p>
            </div>
            <div className="brutal-border p-6 bg-white shadow-brutal hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all cursor-crosshair">
              <h3 className="font-bold text-xl mb-2 flex items-center gap-2">
                <span className="w-4 h-4 bg-brutal-yellow rounded-full border-2 border-black"></span>
                MICRO-WINS
              </h3>
              <p className="font-mono text-sm text-gray-600">
                Track progress, not just tutorials watched.
              </p>
            </div>
            {/* Heatmap on landing too if authed - now uses isLoggedIn and passes heatmapData */}
            {isLoggedIn && (
              <div className="col-span-3">
                <ContributionGrid heatmapData={engagementMetrics.heatmapData} />
              </div>
            )}
          </div>
        )}

      </div>

      {/* Emergency Replan Modal */}
      {
        showReplan && (
          <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white border-3 border-black shadow-brutal max-w-md w-full">
              <div className="bg-brutal-red text-white px-4 py-3 font-bold font-mono text-sm uppercase tracking-wider">
                ⚠️ Life Happened — That's OK
              </div>
              <div className="p-6 space-y-4">
                <p className="font-mono text-sm text-gray-600">
                  Plans adapt. You're not quitting — you're being realistic. How many extra days do you need?
                </p>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={replanDays}
                    onChange={(e) => setReplanDays(Number(e.target.value))}
                    className="flex-1 accent-brutal-red"
                  />
                  <span className="font-black text-2xl font-mono min-w-[60px] text-center">+{replanDays}d</span>
                </div>
                <p className="font-mono text-xs text-gray-400">
                  New deadline: {activeSession?.deadline ? new Date(new Date(activeSession.deadline).getTime() + replanDays * 86400000).toLocaleDateString() : 'N/A'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      // TODO: wire to store to actually update deadline (and then syncToFirestore)
                      setShowReplan(false);
                    }}
                    className="flex-1 bg-brutal-yellow text-black py-2 border-2 border-black font-bold text-sm uppercase shadow-brutal hover:translate-y-0.5 hover:shadow-none transition-all"
                  >
                    Extend Plan
                  </button>
                  <button
                    onClick={() => setShowReplan(false)}
                    className="px-4 py-2 border-2 border-black font-bold text-sm uppercase hover:bg-gray-100 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}

export default App;
