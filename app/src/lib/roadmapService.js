// Use relative paths; these are handled by Vite proxy in dev and Vercel rewrites in prod
const API_BASE = '/roadmap-api/v1-official-roadmap';
const CONTENT_BASE = '/roadmap-content';

/**
 * Available official roadmaps.
 */
export function getAvailableRoadmaps() {
    return [
        { slug: 'frontend', title: 'Frontend Developer', icon: '🎨' },
        { slug: 'backend', title: 'Backend Developer', icon: '⚙️' },
        { slug: 'devops', title: 'DevOps Engineer', icon: '🔧' },
        { slug: 'full-stack', title: 'Full Stack Developer', icon: '🧑‍💻' },
        { slug: 'react', title: 'React Developer', icon: '⚛️' },
        { slug: 'nodejs', title: 'Node.js Developer', icon: '🟢' },
        { slug: 'python', title: 'Python Developer', icon: '🐍' },
        { slug: 'ai-data-scientist', title: 'AI & Data Scientist', icon: '🤖' },
        { slug: 'android', title: 'Android Developer', icon: '📱' },
        { slug: 'javascript', title: 'JavaScript', icon: '📜' },
        { slug: 'typescript', title: 'TypeScript', icon: '🔷' },
        { slug: 'java', title: 'Java Developer', icon: '☕' },
        { slug: 'cyber-security', title: 'Cyber Security', icon: '🔒' },
        { slug: 'docker', title: 'Docker', icon: '🐳' },
        { slug: 'kubernetes', title: 'Kubernetes', icon: '☸️' },
    ];
}

/**
 * Fetch the raw roadmap structure.
 */
export async function fetchOfficialRoadmap(slug) {
    const res = await fetch(`${API_BASE}/${slug}`);
    if (!res.ok) throw new Error(`Failed to fetch roadmap: ${res.status}`);
    return res.json();
}

/**
 * Fetch per-node content (description + resources) from the content API.
 * URL pattern: /{roadmapSlug}/{label-slug}@{nodeId}.json
 */
async function fetchNodeContent(roadmapSlug, nodeId, label) {
    try {
        const labelSlug = label.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
        const url = `${CONTENT_BASE}/${roadmapSlug}/${labelSlug}@${nodeId}.json`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return {
            description: (data.description || '').replace(/^#[^\n]*\n+/, '').trim(),
            resources: (data.resources || []).map(r => ({
                type: r.type === 'article' ? 'doc' : r.type,
                title: r.title || '',
                url: r.url || ''
            }))
        };
    } catch {
        return null;
    }
}

/**
 * Clean label text.
 */
function cleanLabel(raw) {
    if (!raw) return 'Topic';
    let l = raw.trim().replace(/\?+$/, '');
    l = l.replace(/^(what\s+(is|are)\s+|learn\s+(about\s+)?)/i, '');
    return l.charAt(0).toUpperCase() + l.slice(1);
}

/**
 * Transform roadmap.sh API data → app's metro-map format with real resources.
 *
 * Output matches AI-generated format exactly:
 *   - 6-8 main nodes with { id, title, status, x, y, subNodes }
 *   - Exactly 2 subNodes per node
 *   - Each task has real resources fetched from content API
 */
export async function transformToAppFormat(apiData, roadmapSlug = 'frontend') {
    const { nodes: rawNodes = [], edges = [] } = apiData;

    const nodeMap = new Map();
    rawNodes.forEach(n => nodeMap.set(n.id, n));

    // Topics sorted by Y = learning progression
    const topicNodes = rawNodes
        .filter(n => n.type === 'topic')
        .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

    // Edge map
    const edgeMap = new Map();
    edges.forEach(e => {
        if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
        edgeMap.get(e.source).push(e.target);
    });

    // Map topics → subtopics
    const topicSubs = new Map();
    topicNodes.forEach(t => {
        const children = (edgeMap.get(t.id) || [])
            .map(id => nodeMap.get(id))
            .filter(n => n && n.type === 'subtopic');
        topicSubs.set(t.id, children);
    });

    // === GROUP into 7 milestones ===
    const MILESTONE_COUNT = 7;
    const chunkSize = Math.max(2, Math.ceil(topicNodes.length / MILESTONE_COUNT));
    const chunks = [];
    for (let i = 0; i < topicNodes.length; i += chunkSize) {
        chunks.push(topicNodes.slice(i, i + chunkSize));
    }
    while (chunks.length > MILESTONE_COUNT + 1) {
        const last = chunks.pop();
        chunks[chunks.length - 1].push(...last);
    }

    // === LAYOUT ===
    const xStep = chunks.length > 1 ? 1250 / (chunks.length - 1) : 0;

    // === BUILD nodes with real content ===
    // First, collect all nodes we need content for
    const contentFetchPromises = [];
    const milestonePlan = chunks.map((topicGroup, mIdx) => {
        const topicLabels = topicGroup.map(t => cleanLabel(t.data?.label));
        const milestoneTitle = topicLabels.length <= 2
            ? topicLabels.join(' & ')
            : topicLabels[0];

        // Collect candidate sub-entries
        const allSubs = [];
        topicGroup.forEach(topic => {
            const subs = topicSubs.get(topic.id) || [];
            if (subs.length > 0) {
                subs.forEach(s => allSubs.push({ node: s, parentLabel: cleanLabel(topic.data?.label) }));
            } else {
                allSubs.push({ node: topic, parentLabel: milestoneTitle });
            }
        });

        // Pick exactly 2 subNodes
        const picked = [];
        if (allSubs.length <= 2) {
            picked.push(...allSubs);
        } else {
            picked.push(allSubs[0]);
            picked.push(allSubs[Math.floor(allSubs.length / 2)]);
        }

        // Queue content fetches for picked nodes
        picked.forEach(item => {
            const label = item.node.data?.label || '';
            const promise = fetchNodeContent(roadmapSlug, item.node.id, label);
            contentFetchPromises.push({ mIdx, item, promise });
        });

        return { milestoneTitle, picked, mIdx };
    });

    // Fetch all content in parallel
    const contentResults = new Map();
    await Promise.all(contentFetchPromises.map(async ({ mIdx, item, promise }) => {
        const content = await promise;
        const key = `${mIdx}-${item.node.id}`;
        contentResults.set(key, content);
    }));

    // === ASSEMBLE final nodes ===
    const transformedNodes = milestonePlan.map(({ milestoneTitle, picked, mIdx }) => {
        const subNodes = picked.map((item, sIdx) => {
            const subLabel = cleanLabel(item.node.data?.label);
            const key = `${mIdx}-${item.node.id}`;
            const content = contentResults.get(key);

            // Use real resources if available, otherwise generate fallbacks
            const resources = content?.resources?.length > 0
                ? content.resources.slice(0, 4) // Cap at 4 resources
                : [
                    {
                        type: 'doc',
                        title: `${subLabel} — Documentation`,
                        url: `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(subLabel)}`
                    },
                    {
                        type: 'video',
                        title: `${subLabel} — Video Tutorial`,
                        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(subLabel + ' tutorial')}`
                    }
                ];

            const breakdown = content?.description
                || `${subLabel} is a key concept within ${item.parentLabel}. Focus on understanding the fundamentals, then apply them in real projects.`;

            return {
                id: `${mIdx + 1}-${sIdx + 1}`,
                title: subLabel,
                tasks: [
                    {
                        title: `Master ${subLabel}`,
                        detail: `Study the core concepts and best practices of ${subLabel}.`,
                        resources,
                        breakdown,
                        practice: {
                            question: `Explain ${subLabel} and how you'd use it in a real project.`,
                            hint: `Think about the core concepts, common patterns, and how ${subLabel} connects to ${item.parentLabel}.`
                        },
                        completed: false
                    }
                ]
            };
        });

        return {
            id: String(mIdx + 1),
            title: milestoneTitle,
            status: mIdx === 0 ? 'active' : 'locked',
            x: Math.round(150 + mIdx * xStep),
            y: mIdx % 2 === 0 ? 200 : 450,
            subNodes
        };
    });

    return { nodes: transformedNodes };
}
