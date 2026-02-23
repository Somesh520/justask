import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { Download, Check, Lock, Play, Plus, Minus, Info, ClipboardList, MessageCircleQuestion, BookMarked, CalendarCheck, Share2, Trophy } from 'lucide-react'
import { useStore } from '../../lib/store'
import html2canvas from 'html2canvas'
import { TaskThreadView } from './TaskThreadView'
import { NextUpPanel } from './NextUpPanel'
import AIExplainPanel from './AIExplainPanel'

export function MetroMap() {
    const { sessions, activeSessionId, currentTaskIds, setCurrentTask, updateNodePosition, completeTask, publishBlueprint, setShowQuests, setPhase } = useStore()
    const activeSession = sessions[activeSessionId]
    const roadmap = activeSession?.roadmap

    // AI Explain State
    const [aiTask, setAiTask] = useState(null)

    const [isPublishing, setIsPublishing] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const exportRef = useRef(null)

    const handlePublish = async () => {
        setIsPublishing(true)
        try {
            await publishBlueprint(activeSessionId)
            alert("Roadmap Published to Network! 🚀")
        } finally {
            setIsPublishing(false)
        }
    }

    const handleExport = async () => {
        if (!localNodes || localNodes.length === 0) {
            alert("No roadmap to export!");
            return;
        }
        setIsExporting(true);
        try {
            const PADDING = 100;
            const NODE_R = 60;
            const LABEL_W = 200;
            const LABEL_H = 50;

            // Calculate bounding box of all nodes
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            localNodes.forEach(n => {
                minX = Math.min(minX, n.x - NODE_R);
                minY = Math.min(minY, n.y - NODE_R);
                maxX = Math.max(maxX, n.x + NODE_R + LABEL_W);
                maxY = Math.max(maxY, n.y + NODE_R + 60 + LABEL_H);
            });

            const mapW = maxX - minX + PADDING * 2;
            const mapH = maxY - minY + PADDING * 2;
            const SCALE = 2; // Retina-quality

            const canvas = document.createElement('canvas');
            canvas.width = mapW * SCALE;
            canvas.height = (mapH + 120) * SCALE; // +120 for header
            const ctx = canvas.getContext('2d');
            ctx.scale(SCALE, SCALE);

            const offsetX = -minX + PADDING;
            const offsetY = -minY + PADDING + 120; // push content down for header

            // --- Background ---
            const bgGrad = ctx.createLinearGradient(0, 0, mapW, mapH + 120);
            bgGrad.addColorStop(0, '#0f0f0f');
            bgGrad.addColorStop(1, '#1a1a2e');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, mapW, mapH + 120);

            // --- Dot grid ---
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            for (let x = 0; x < mapW; x += 24) {
                for (let y = 0; y < mapH + 120; y += 24) {
                    ctx.beginPath();
                    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // --- Header ---
            ctx.fillStyle = '#FFDE00';
            ctx.fillRect(0, 0, mapW, 100);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, mapW, 100);

            ctx.fillStyle = '#000';
            ctx.font = 'bold 48px monospace';
            ctx.textBaseline = 'middle';
            ctx.fillText('JUSTASK.', 30, 38);

            ctx.font = 'bold 20px monospace';
            ctx.fillStyle = '#333';
            ctx.fillText(`CAREER: ${(activeSession?.role || activeSession?.goal || 'ROADMAP').toUpperCase()}`, 30, 76);

            // date top right
            ctx.font = '14px monospace';
            ctx.fillStyle = '#555';
            ctx.textAlign = 'right';
            ctx.fillText(new Date().toLocaleDateString(), mapW - 20, 76);
            ctx.textAlign = 'left';

            // --- Connection Lines ---
            for (let i = 0; i < localNodes.length - 1; i++) {
                const a = localNodes[i];
                const b = localNodes[i + 1];
                ctx.beginPath();
                ctx.setLineDash([10, 8]);
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(255,222,0,0.4)';
                ctx.moveTo(a.x + offsetX, a.y + offsetY);
                ctx.lineTo(b.x + offsetX, b.y + offsetY);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // --- Nodes ---
            const statusColors = {
                completed: { fill: '#3B82F6', stroke: '#fff', text: '#fff' },
                active: { fill: '#FFDE00', stroke: '#000', text: '#000' },
                locked: { fill: '#FF4D4D', stroke: '#fff', text: '#fff' },
            };

            localNodes.forEach((node) => {
                const cx = node.x + offsetX;
                const cy = node.y + offsetY;
                const colors = statusColors[node.status] || statusColors.locked;

                // Shadow
                ctx.shadowColor = colors.fill;
                ctx.shadowBlur = 24;

                // Circle
                ctx.beginPath();
                ctx.arc(cx, cy, NODE_R, 0, Math.PI * 2);
                ctx.fillStyle = colors.fill;
                ctx.fill();
                ctx.strokeStyle = colors.stroke;
                ctx.lineWidth = 4;
                ctx.stroke();
                ctx.shadowBlur = 0;

                // Status icon text
                ctx.font = 'bold 22px monospace';
                ctx.fillStyle = colors.text;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const icon = node.status === 'completed' ? '✓' : node.status === 'active' ? '▶' : '🔒';
                ctx.fillText(icon, cx, cy - 10);

                // Task count
                const taskCount = node.subNodes?.reduce((s, sub) => s + (sub.tasks?.length || 0), 0) || 0;
                ctx.font = 'bold 13px monospace';
                ctx.fillText(`${taskCount} TASKS`, cx, cy + 14);

                // Label box (below the node)
                const lx = cx - LABEL_W / 2;
                const ly = cy + NODE_R + 16;

                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.rect(lx, ly, LABEL_W, LABEL_H);
                ctx.fill();
                ctx.stroke();

                // Shadow offset
                ctx.fillStyle = '#000';
                ctx.fillRect(lx + 4, ly + 4, LABEL_W, LABEL_H);
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.beginPath();
                ctx.rect(lx, ly, LABEL_W, LABEL_H);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#000';
                ctx.font = 'bold 13px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Word-wrap label
                const words = (node.title || 'Node').split(' ');
                let line = '';
                let lineY = ly + 14;
                words.forEach((word, i) => {
                    const testLine = line + word + ' ';
                    if (ctx.measureText(testLine).width > LABEL_W - 10 && i > 0) {
                        ctx.fillText(line.trim(), cx, lineY);
                        line = word + ' ';
                        lineY += 16;
                    } else {
                        line = testLine;
                    }
                });
                ctx.fillText(line.trim(), cx, lineY);
            });

            // --- Footer ---
            const footerY = mapH + 115;
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(0, footerY, mapW, 15);
            ctx.font = '11px monospace';
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.textAlign = 'center';
            ctx.fillText('Generated by JUSTASK AI • Your Career, Your Roadmap', mapW / 2, footerY + 8);

            // --- Download ---
            const link = document.createElement('a');
            link.download = `justask-roadmap-${(activeSession?.role || 'career').replace(/\s+/g, '-').toLowerCase()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error("Export failed:", err);
            alert("Export failed. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    // Local state for nodes to allow dragging
    const [localNodes, setLocalNodes] = useState([])

    // Sync local nodes when roadmap changes
    useEffect(() => {
        if (roadmap?.nodes) {
            setLocalNodes(roadmap.nodes)
        }
    }, [roadmap])

    // State
    // const [selectedTaskIds, setSelectedTaskIds] = useState(null) // REMOVED
    const [expandedNodes, setExpandedNodes] = useState({})
    const [expandedSubNodes, setExpandedSubNodes] = useState({})
    const [showFABMenu, setShowFABMenu] = useState(false)

    // Derive selected task from store to ensure reactivity
    const selectedTask = (currentTaskIds && roadmap?.nodes) ?
        roadmap.nodes.find(n => n.id === currentTaskIds.nodeId)
            ?.subNodes?.find(s => s.id === currentTaskIds.subNodeId)
            ?.tasks?.[currentTaskIds.taskIndex]
        : null

    // Inject IDs into the derived task object for TaskThreadView to use
    const taskToRender = selectedTask ? {
        ...selectedTask,
        nodeId: currentTaskIds.nodeId,
        subNodeId: currentTaskIds.subNodeId,
        taskIndex: currentTaskIds.taskIndex
    } : null


    // Refs for Auto-Zoom
    const transformRef = useRef(null)
    const hasCenteredRef = useRef(false)

    // Check if we are waiting for the roadmap
    const isGenerating = !roadmap && activeSession?.phase === 'roadmap'

    // Auto-focus on active node
    useEffect(() => {
        if (roadmap && roadmap.nodes && transformRef.current && !hasCenteredRef.current) {
            const nodes = roadmap.nodes
            const activeNode = nodes.find(n => n.status === 'active') || nodes[0]

            if (activeNode) {
                const { setTransform } = transformRef.current
                const scale = 1.0
                // Viewport dimensions (approximate or window based)
                const viewportW = window.innerWidth
                const viewportH = 800 // The container height is hardcoded to 800px in JSX

                // Calculate target position to center the active node
                // Formula: TargetPos = (ViewportCenter) - (NodePos + Padding) * Scale
                // Node coordinates are relative to the padded container (200px padding)
                const targetX = (viewportW / 2) - ((activeNode.x + 200) * scale)
                const targetY = (viewportH / 2) - ((activeNode.y + 200) * scale)

                // Small delay to ensure layout is ready
                setTimeout(() => {
                    setTransform(targetX, targetY, scale, 1000, "easeOutCubic")
                    hasCenteredRef.current = true
                }, 100)
            }
        }
    }, [roadmap])

    if (isGenerating) {
        return (
            <div className="w-full h-[600px] bg-white brutal-border flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 border-4 border-black border-t-brutal-yellow rounded-full animate-spin"></div>
                <h2 className="text-2xl font-black uppercase animate-pulse">Generating Map...</h2>
                <p className="font-mono text-sm text-gray-500">Constructing your career lattice</p>
            </div>
        )
    }

    if (!roadmap) return null

    const allNodesDone = roadmap.nodes && roadmap.nodes.length > 0 && roadmap.nodes.every(n => n.status === 'completed');

    const toggleNode = (nodeId) => {
        // Allow interaction even if all nodes are done. 
        // usage of setPhase(..., 'gauntlet-reveal') is now exclusively via the floating button.
        setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }))
    }

    const toggleSubNode = (subNodeId) => {
        setExpandedSubNodes(prev => ({ ...prev, [subNodeId]: !prev[subNodeId] }))
    }

    // Calculate SVG path using LOCAL nodes
    const pathData = localNodes.reduce((acc, node, i) => {
        if (i === 0) return `M ${node.x} ${node.y}`
        return `${acc} L ${node.x} ${node.y}`
    }, '')

    return (
        <>
            <div className="w-full h-[800px] bg-gray-50 brutal-border relative overflow-hidden">
                <TransformWrapper
                    ref={transformRef}
                    initialScale={0.5}
                    minScale={0.1}
                    maxScale={4}
                    centerOnInit={false} // We handle it manually via useEffect
                    limitToBounds={false}
                >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            {/* Zoom Controls - Bottom Left */}
                            <div className="absolute bottom-8 left-8 flex flex-col gap-2 z-50">
                                <button type="button" onClick={() => zoomIn()} className="w-10 h-10 bg-white border-2 border-black flex items-center justify-center shadow-brutal hover:bg-brutal-yellow active:translate-y-1 active:shadow-none transition-all">
                                    <Plus size={20} />
                                </button>
                                <button type="button" onClick={() => zoomOut()} className="w-10 h-10 bg-white border-2 border-black flex items-center justify-center shadow-brutal hover:bg-brutal-yellow active:translate-y-1 active:shadow-none transition-all">
                                    <Minus size={20} />
                                </button>
                            </div>

                            {/* FAB Menu - Top Right */}
                            <div className="absolute top-6 right-6 flex flex-col items-end gap-2 z-[100]">
                                <button
                                    type="button"
                                    onClick={() => setShowFABMenu(!showFABMenu)}
                                    className={`w-16 h-16 border-2 border-black flex items-center justify-center shadow-brutal active:translate-y-1 active:shadow-none transition-all ${showFABMenu ? 'bg-brutal-yellow' : 'bg-white hover:bg-brutal-yellow'}`}
                                >
                                    <ClipboardList size={32} />
                                </button>

                                <AnimatePresence>
                                    {showFABMenu && (
                                        <motion.div
                                            initial={{ scale: 0, opacity: 0, originY: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0, opacity: 0 }}
                                            className="flex flex-col items-end gap-2 mt-2"
                                        >
                                            {[
                                                { icon: <CalendarCheck size={20} />, label: "Today's Quest", action: () => { setShowQuests(true); setShowFABMenu(false); } },
                                                { icon: <Download size={20} />, label: isExporting ? 'Capturing...' : 'Download Roadmap', action: handleExport },
                                                ...(!activeSession?.isStolen ? [{ icon: <Share2 size={20} />, label: isPublishing ? 'Uploading...' : 'Publish to Exchange', action: handlePublish }] : []),
                                                { icon: <MessageCircleQuestion size={20} />, label: 'AI Explain', action: () => { } },
                                                { icon: <BookMarked size={20} />, label: 'Review Later', action: () => { } },
                                            ].map((item, idx) => (
                                                <motion.button
                                                    key={idx}
                                                    type="button"
                                                    initial={{ x: 20, opacity: 0 }}
                                                    animate={{ x: 0, opacity: 1 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    onClick={item.action}
                                                    className="flex items-center gap-2 bg-white border-2 border-black px-4 py-3 text-sm font-mono font-bold uppercase shadow-brutal hover:bg-brutal-yellow active:translate-y-0.5 active:shadow-none transition-all whitespace-nowrap"
                                                >
                                                    {item.icon} {item.label}
                                                </motion.button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* ENTER THE GAUNTLET CTA - Only if 100% complete and in roadmap phase */}
                            {allNodesDone && (
                                <motion.div
                                    initial={{ y: 50, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="absolute bottom-8 right-8 z-[200]"
                                >
                                    <button
                                        onClick={() => setPhase(activeSessionId, 'gauntlet-reveal')}
                                        className="bg-brutal-green text-black px-8 py-4 border-4 border-black font-black text-2xl uppercase shadow-[8px_8px_0px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-4 group"
                                    >
                                        <Trophy size={32} className="group-hover:rotate-12 transition-transform" />
                                        ENTER THE GAUNTLET
                                    </button>
                                </motion.div>
                            )}



                            <TransformComponent wrapperClass="w-full h-full" contentClass="w-full h-full">
                                <div ref={exportRef} className="relative min-w-[2500px] min-h-[1500px] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] p-[200px]">

                                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
                                        {/* Gradient definitions */}
                                        <defs>
                                            <radialGradient id="completionAura">
                                                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.15" />
                                                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                                            </radialGradient>
                                        </defs>

                                        {/* Completion Aura behind completed nodes */}
                                        {localNodes.map(node => node.status === 'completed' && (
                                            <circle key={`aura-${node.id}`} cx={node.x} cy={node.y} r={120} fill="url(#completionAura)" />
                                        ))}

                                        {/* Prerequisite Lines between Main Nodes */}
                                        {localNodes.map((node, i) => {
                                            if (i === 0) return null;
                                            const prev = localNodes[i - 1];
                                            const isCompleted = prev.status === 'completed' && node.status !== 'locked';
                                            const isLocked = node.status === 'locked';
                                            return (
                                                <line
                                                    key={`path-${i}`}
                                                    x1={prev.x} y1={prev.y} x2={node.x} y2={node.y}
                                                    stroke={isCompleted ? '#22C55E' : isLocked ? '#9CA3AF' : '#000'}
                                                    strokeWidth={isCompleted ? 14 : isLocked ? 6 : 12}
                                                    strokeDasharray={isLocked ? '12 8' : 'none'}
                                                    strokeLinecap="round"
                                                />
                                            );
                                        })}

                                        {/* Lines for SubNodes and TaskNodes (Using Absolute Coordinates) */}
                                        {localNodes.map(node => (
                                            expandedNodes[node.id] && node.subNodes?.map((sub, index) => {
                                                const total = node.subNodes.length;
                                                const angleDeg = (360 / total) * index + 90;
                                                const angleRad = (angleDeg * Math.PI) / 180;
                                                const radius = 300;
                                                const subX = node.x + Math.cos(angleRad) * radius;
                                                const subY = node.y + Math.sin(angleRad) * radius;

                                                return (
                                                    <g key={`sub-task-lines-${sub.id}`}>
                                                        {/* Main -> Sub Line */}
                                                        <motion.line
                                                            x1={node.x} y1={node.y} x2={subX} y2={subY}
                                                            stroke="black" strokeWidth="4" strokeDasharray="8 4"
                                                            initial={{ pathLength: 0, opacity: 0 }}
                                                            animate={{ pathLength: 1, opacity: 1 }}
                                                        />

                                                        {/* Sub -> Task Lines */}
                                                        {expandedSubNodes[sub.id] && sub.tasks?.map((task, j) => {
                                                            const taskDistance = 150 + j * 80;
                                                            const taskX = subX + Math.cos(angleRad) * taskDistance;
                                                            const taskY = subY + Math.sin(angleRad) * taskDistance;

                                                            return (
                                                                <motion.line
                                                                    key={`line-${sub.id}-${j}`}
                                                                    x1={subX} y1={subY} x2={taskX} y2={taskY}
                                                                    stroke="black" strokeWidth="2"
                                                                    initial={{ pathLength: 0, opacity: 0 }}
                                                                    animate={{ pathLength: 1, opacity: 1 }}
                                                                />
                                                            );
                                                        })}
                                                    </g>
                                                );
                                            })
                                        ))}
                                    </svg>

                                    {/* Nodes Layer */}
                                    <div className="absolute inset-0">
                                        {localNodes.map((node, i) => (
                                            <div key={node.id}>
                                                <MainNode
                                                    node={node}
                                                    isExpanded={!!expandedNodes[node.id]}
                                                    onClick={() => toggleNode(node.id)}
                                                    onDragEnd={() => { }}

                                                />

                                                {/* Render SubNodes (Orbital Layout) */}
                                                <AnimatePresence>
                                                    {expandedNodes[node.id] && (
                                                        <div className="absolute" style={{ left: node.x, top: node.y }}>
                                                            {/* Orbit Ring */}
                                                            <motion.div
                                                                initial={{ opacity: 0, scale: 0.8 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                exit={{ opacity: 0, scale: 0.8 }}
                                                                className="absolute rounded-full border-2 border-dashed border-gray-400 -z-10"
                                                                style={{
                                                                    width: 400,
                                                                    height: 400,
                                                                    left: -200,
                                                                    top: -200
                                                                }}
                                                            />

                                                            {node.subNodes?.map((sub, index) => {
                                                                const total = node.subNodes.length
                                                                const angleDeg = (360 / total) * index + 90
                                                                const angleRad = (angleDeg * Math.PI) / 180
                                                                const radius = 300 // Orbit radius
                                                                const subX = Math.cos(angleRad) * radius
                                                                const subY = Math.sin(angleRad) * radius

                                                                return (
                                                                    <motion.div
                                                                        key={sub.id}
                                                                        initial={{ x: 0, y: 0, opacity: 0 }}
                                                                        animate={{ x: subX, y: subY, opacity: 1 }}
                                                                        exit={{ x: 0, y: 0, opacity: 0 }}
                                                                        className="absolute"
                                                                    >
                                                                        <SubNode
                                                                            data={sub}
                                                                            isExpanded={!!expandedSubNodes[sub.id]}
                                                                            color={node.status === 'completed' ? 'bg-brutal-blue' : 'bg-brutal-yellow'}
                                                                            onClick={() => toggleSubNode(sub.id)}
                                                                        />

                                                                        {/* Task Nodes for this SubNode */}
                                                                        <AnimatePresence>
                                                                            {expandedSubNodes[sub.id] && sub.tasks?.map((task, j) => {
                                                                                const taskDistance = 150 + j * 80 // Linear stack outwards
                                                                                // Calculate relative position to the sub-node (which is already at subX, subY)
                                                                                const taskX = Math.cos(angleRad) * taskDistance;
                                                                                const taskY = Math.sin(angleRad) * taskDistance;

                                                                                return (
                                                                                    <TaskNode
                                                                                        key={`${sub.id}-task-${j}`}
                                                                                        centerX={taskX} centerY={taskY} parentX={0} parentY={0}
                                                                                        data={task}
                                                                                        onClick={() => setCurrentTask({ nodeId: node.id, subNodeId: sub.id, taskIndex: j })}
                                                                                    />
                                                                                )
                                                                            })}
                                                                        </AnimatePresence>
                                                                    </motion.div>
                                                                )

                                                            })}
                                                        </div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </TransformComponent>
                        </>
                    )}
                </TransformWrapper>
            </div>

            {/* Task Thread View Modal */}
            <AnimatePresence>
                {taskToRender && (
                    <TaskThreadView
                        task={taskToRender}
                        onClose={() => setCurrentTask(null)}
                        onComplete={() => {
                            completeTask(taskToRender.nodeId, taskToRender.subNodeId, taskToRender.taskIndex);
                            setCurrentTask(null);
                        }}
                        onAIExplain={() => setAiTask(taskToRender)}
                    />
                )}
            </AnimatePresence>

            {/* AI Explain Panel */}
            <AIExplainPanel
                task={aiTask}
                isOpen={!!aiTask}
                onClose={() => setAiTask(null)}
                goal={activeSession?.role || activeSession?.goal}
            />


            {/* Next Up Panel (Fixed Bottom Right) */}
            <NextUpPanel nodes={localNodes} onTaskClick={(ids) => setCurrentTask(ids)} />
        </>
    )
}

const MainNode = ({ node, isExpanded, onClick, onDragEnd }) => {
    // ... existing colors ...
    const statusColors = {
        completed: 'bg-brutal-blue text-white',
        active: 'bg-brutal-yellow text-black',
        locked: 'bg-brutal-red text-white'
    }

    const icons = {
        completed: <Check size={48} strokeWidth={4} />,
        active: <Play size={48} strokeWidth={4} fill="currentColor" />,
        locked: <Lock size={48} strokeWidth={3} />
    }

    // Knowledge Density: scale node by task count
    const taskCount = node.subNodes?.reduce((sum, s) => sum + (s.tasks?.length || 0), 0) || 0
    const baseSize = 128
    const scaledSize = Math.min(176, baseSize + taskCount * 8) // grows with more tasks
    const halfSize = scaledSize / 2

    return (
        <motion.div

            initial={{ scale: 0 }}
            animate={{ scale: 1, x: 0, y: 0 }} // Reset drag visual state on re-render to defer to 'style' (left/top)
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
                // Prevent click when dragging
                if (Math.abs(e.movementX) > 1 || Math.abs(e.movementY) > 1) return;
                onClick && onClick();
            }}
            // Use absolute positioning driven by state
            style={{ left: node.x, top: node.y, width: scaledSize, height: scaledSize, marginLeft: -halfSize, marginTop: -halfSize }}
            className={`absolute rounded-full border-4 border-black shadow-brutal cursor-default z-20 flex items-center justify-center group flex-col gap-2
        ${statusColors[node.status]} ${isExpanded ? 'ring-4 ring-black ring-offset-4' : ''}
      `}
        >
            {icons[node.status]}
            <span className="font-mono text-lg font-black opacity-90 tracking-widest uppercase">{taskCount} TASKS</span>
            <div className="absolute -bottom-28 w-64 text-center bg-white border-4 border-black p-3 font-black font-mono text-lg text-black shadow-[8px_8px_0px_0px_#000] z-30 transform hover:-translate-y-1 transition-transform">
                {node.title || "Unknown Concept"}
            </div>
            {/* You Are Here Pulse - only on active node */}
            {node.status === 'active' && (
                <>
                    <div className="absolute inset-0 rounded-full border-4 border-brutal-yellow animate-ping opacity-30" />
                    <span className="absolute -top-12 bg-black text-[#0f0] px-4 py-1.5 border-2 border-white font-mono text-sm font-black uppercase tracking-widest whitespace-nowrap shadow-brutal">
                        [ CURRENT_MISSION ]
                    </span>
                </>
            )}
        </motion.div>
    )
}

function SubNode({ centerX, centerY, parentX, parentY, data, isExpanded, onClick }) {
    const bgClass = isExpanded ? 'bg-brutal-yellow' : 'bg-white';

    return (
        <motion.div
            initial={{ scale: 0, x: parentX, y: parentY }}
            animate={{ scale: 1, x: centerX, y: centerY }}
            exit={{ scale: 0, x: parentX, y: parentY, opacity: 0 }}
            className="absolute top-0 left-0 w-0 h-0 z-20"
        >
            <div
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                className={`absolute min-w-[160px] ${bgClass} border-3 border-black flex items-center justify-center cursor-pointer shadow-brutal hover:bg-brutal-yellow hover:scale-105 transition-all px-6 py-4 -translate-x-1/2 -translate-y-1/2 pointer-events-auto group`}
            >
                <div className="flex flex-col items-center">
                    <span className="font-bold text-lg uppercase leading-tight text-center whitespace-nowrap transition-transform group-hover:scale-110 origin-center">
                        {data.title}
                    </span>
                    {/* Expand Indicator */}
                    <div className="mt-1">
                        {isExpanded ? <Minus size={20} /> : <Plus size={20} />}
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

function TaskNode({ centerX, centerY, parentX, parentY, data, onClick }) {
    const title = typeof data === 'string' ? data : data.title;
    const isCompleted = typeof data === 'object' && data.completed;
    const isReviewLater = typeof data === 'object' && data.reviewLater;

    return (
        <motion.div
            initial={{ scale: 0, x: parentX, y: parentY }}
            animate={{ scale: 1, x: centerX, y: centerY }}
            exit={{ scale: 0, x: parentX, y: parentY, opacity: 0 }}
            className="absolute top-0 left-0 w-0 h-0 z-30"
        >
            <div
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                className={`absolute w-52 border-2 border-black flex items-center justify-center cursor-pointer shadow-[4px_4px_0px_0px_#000] hover:scale-110 transition-transform px-4 py-3 -translate-x-1/2 -translate-y-1/2 pointer-events-auto group
                    ${isCompleted ? 'bg-brutal-green text-black' :
                        isReviewLater ? 'bg-purple-500 text-white animate-pulse shadow-[0_0_15px_rgba(168,85,247,0.6)]' : 'bg-brutal-blue text-white'}
                `}
            >
                {isReviewLater && <span className="absolute -top-3 -right-3 text-xl filter drop-shadow-md">⭐</span>}
                {isCompleted && <Check size={16} className="mr-1 flex-shrink-0" strokeWidth={3} />}
                <span className="font-bold font-mono text-sm uppercase leading-tight text-center line-clamp-3 transition-transform group-hover:scale-110">
                    {title}
                </span>
            </div>
        </motion.div>
    )
}
