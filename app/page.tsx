'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Focus, Layers, Search, Sparkles, X } from 'lucide-react';
import GraphVisualizer from '@/components/GraphVisualizer';
import Inspector from '@/components/Inspector';
import CorpusPanel from '@/components/CorpusPanel';
import ChatPanel from '@/components/ChatPanel';
import { CountUp, OrbitLoader, SplitText, Ticker } from '@/components/kinetic';
import { GraphDataLoader, type Community } from '../lib/graphData';
import { ForceSimulation3D, GraphLayout, Node3D, defaultForceConfig } from '../lib/forceSimulation';

export default function Home() {
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [status, setStatus] = useState<string>('Initializing...');
  // Selection state
  const [selectedNode, setSelectedNode] = useState<Node3D | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node3D | null>(null);
  
  // Filter states
  const [inspectorMode, setInspectorMode] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [projectNameRequired, setProjectNameRequired] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState('');
  const [buildRunning, setBuildRunning] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [ragHighlightedNodeIds, setRagHighlightedNodeIds] = useState<Set<string>>(new Set());

  // Ref for search input to enable focus
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Check corpus state and load data intelligently
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // First check if we have any corpus data
        setStatus('Checking for indexed data...');
        const corpusRes = await fetch('/api/corpus/state', { cache: 'no-store' });
        if (corpusRes.ok) {
          const corpus = await corpusRes.json();
          const requiresName = !corpus.kgName || !String(corpus.kgName).trim();
          setCurrentProjectName(corpus.kgName ? String(corpus.kgName) : '');
          setProjectNameRequired(requiresName);
          if (requiresName) setProjectPanelOpen(true);
          
          // Imported GraphRAG output may not include source documents. The
          // generated graph artifacts, not the upload registry, decide
          // whether the constellation can load.
          const hasIndex = corpus.outputStats && ((corpus.outputStats.entities ?? 0) + (corpus.outputStats.relationships ?? 0) + (corpus.outputStats.communities ?? 0) + (corpus.outputStats.text_units ?? 0) > 0);
          
          if (!hasIndex) {
            setProjectPanelOpen(true);
            setLoading(false);
            return;
          }
        }

        setStatus('Loading JSON data files...');

        const loader = new GraphDataLoader('/api/data');
        const graphData = await loader.loadGraphData();

        setStatus('Processing graph structure...');
        
        const newSimulation = new ForceSimulation3D(defaultForceConfig);
        const layout = await newSimulation.generateLayout(graphData);
        
        setStatus('Rendering visualization...');
        
        setLayout(layout);
        setLoading(false);

      } catch (error) {
        console.error('Error loading graph data:', error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Hot-reload graph data when the corpus pipeline finishes
  const reloadGraphData = useCallback(async () => {
    try {
      setStatus('Reloading graph data...');
      const loader = new GraphDataLoader('/api/data');
      const newGraph = await loader.loadGraphData();
      const sim = new ForceSimulation3D(defaultForceConfig);
      const newLayout = await sim.generateLayout(newGraph);
      setLayout(newLayout);
      setStatus('Graph reloaded');
    } catch (err) {
      console.warn('Hot reload failed:', err);
    }
  }, []);

  // Track the server-owned index job so the UI reflects a build even when
  // the Builder sheet is closed: the Projects button shows activity, and the
  // constellation populates progressively as each artifact lands (the job
  // bumps dataVersion whenever fresh JSON is written to output/).
  useEffect(() => {
    let cancelled = false;
    let lastDataVersion: number | null = null;
    const poll = async () => {
      try {
        const res = await fetch('/api/corpus/index/status', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const job = await res.json() as { running?: boolean; dataVersion?: number };
        setBuildRunning(job.running === true);
        const version = job.dataVersion ?? 0;
        if (lastDataVersion !== null && version !== lastDataVersion) {
          reloadGraphData();
        }
        lastDataVersion = version;
      } catch {}
    };
    poll();
    const timer = window.setInterval(poll, 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [reloadGraphData]);

  useEffect(() => {
    const handler = () => reloadGraphData();
    window.addEventListener('graph-data-updated', handler);
    const clearHandler = () => {
      setLayout(null);
      setStatus('No graph loaded');
      setSelectedNode(null);
    };
    window.addEventListener('graph-data-cleared', clearHandler);
    return () => {
      window.removeEventListener('graph-data-updated', handler);
      window.removeEventListener('graph-data-cleared', clearHandler);
    };
  }, [reloadGraphData]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ESC to unselect node
      if (event.key === 'Escape') {
        setSelectedNode(null);
      }
      
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux) to focus search
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      
      // Cmd+Backspace (Mac) or Ctrl+Backspace (Windows/Linux) to clear search
      if ((event.metaKey || event.ctrlKey) && event.key === 'Backspace') {
        event.preventDefault();
        setSearchTerm('');
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const connectedLinks = useMemo(() => {
    if (!selectedNode || !layout) return [];
    return layout.links.filter(link => 
      link.source.id === selectedNode.id || link.target.id === selectedNode.id
    );
  }, [selectedNode, layout]);

  // Helper function to get complete subtree under the L0 parent of selected community
  const getCompleteHierarchyTree = useCallback((selectedCommunity: Community, allCommunities: Community[]) => {
    if (!selectedCommunity || !allCommunities || allCommunities.length === 0) {
      return [];
    }

    // Create efficient lookup maps
    const communityByHumanIdMap = new Map<string, Community>(allCommunities.map(c => [String(c.human_readable_id), c]));
    
    // Build parent-child map
    const childrenByParentId = new Map<string, Community[]>();
    allCommunities.forEach(community => {
      if (community.parent !== undefined) {
        const parentId = String(community.parent);
        if (!childrenByParentId.has(parentId)) {
          childrenByParentId.set(parentId, []);
        }
        childrenByParentId.get(parentId)!.push(community);
      }
    });

    try {
      // Step 1: Find the L0 root by walking up the tree
      let currentCommunity: Community | undefined = selectedCommunity;
      const pathToRoot = [currentCommunity];
      
      while (currentCommunity && currentCommunity.parent !== undefined) {
        const parentId = String(currentCommunity.parent);
        const parentCommunity = communityByHumanIdMap.get(parentId);
        
        if (!parentCommunity) break;
        
        pathToRoot.unshift(parentCommunity);
        currentCommunity = parentCommunity;
        
        // Safety check to prevent infinite loops
        if (pathToRoot.length > 10) break;
      }
      
      // The first item should be the L0 root
      const rootCommunity = pathToRoot[0];      
      // Step 2: Collect entire subtree under this L0 root
      const subtreeCommunities = new Set<string>();
      const queue: Community[] = [rootCommunity];
      const visited = new Set<string>();
      
      while (queue.length > 0) {
        const community = queue.shift()!;
        
        if (!community || visited.has(community.id)) continue;
        
        visited.add(community.id);
        subtreeCommunities.add(community.id);
        
        // Add all children to queue
        const children = childrenByParentId.get(String(community.human_readable_id)) || [];
        
        // Also check the children array if available
        community.children.forEach((childHumanId: string) => {
          const childCommunity = communityByHumanIdMap.get(String(childHumanId));
          if (childCommunity && !children.some(c => c.id === childCommunity.id)) {
            children.push(childCommunity);
          }
        });
        
        children.forEach(childCommunity => {
          if (!visited.has(childCommunity.id)) {
            queue.push(childCommunity);
          }
        });
      }

      const result = allCommunities
        .filter(c => subtreeCommunities.has(c.id))
        .sort((a, b) => (a.level || 0) - (b.level || 0));
            
      return result;
      
    } catch (error) {
      console.warn('Error building community subtree:', error);
      // Fallback to just the selected community
      return [selectedCommunity];
    }
  }, []);

  // Calculate which communities to show based on selected node and inspector mode
  const visibleCommunities = useMemo(() => {
    if (!layout?.communities) return [];
    
    // Inspector mode shows hierarchy tree when node selected
    if (inspectorMode && selectedNode) {
      // If node has community, show hierarchy tree
      if (selectedNode.community) {
        return getCompleteHierarchyTree(selectedNode.community, layout.communities);
      }
      // If node has no community, show no communities
      return [];
    }
    
    // Default: show all communities
    return layout.communities;
  }, [layout?.communities, selectedNode, inspectorMode, getCompleteHierarchyTree]);

  // Determine effective community mode for components
  const effectiveCommunityMode = inspectorMode && selectedNode ? 'auto' : 'all';

  const workspaceOpen = projectPanelOpen || projectNameRequired;
  const openWorkspace = () => { setLeaving(false); setProjectPanelOpen(true); };
  const closeWorkspace = useCallback(() => { if (!projectNameRequired) setLeaving(true); }, [projectNameRequired]);

  useEffect(() => {
    if (!workspaceOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeWorkspace(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspaceOpen, closeWorkspace]);

  const topEntities = useMemo(
    () => (layout ? [...layout.nodes].sort((a, b) => b.degree - a.degree).slice(0, 24).map(n => ({ id: n.id, label: n.title })) : []),
    [layout]
  );
  const pickEntity = (id: string) => {
    const node = layout?.nodes.find(n => n.id === id);
    if (node) setSelectedNode(node);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background" data-hmi-root>
      <div className="absolute inset-0 z-0">
        <GraphVisualizer
          layout={layout}
          loading={loading}
          status={status}
          visibleCommunities={visibleCommunities}
          communityMode={effectiveCommunityMode}
          onNodeSelect={setSelectedNode}
          selectedNode={selectedNode}
          ragHighlightedNodeIds={ragHighlightedNodeIds}
          searchTerm={searchTerm}
          onNodeHover={setHoveredNode}
          hoveredNode={hoveredNode}
          viewportOffset={selectedNode ? 420 : 0}
        />
      </div>

      {/* Title */}
      {!selectedNode && currentProjectName && (
        <header className="pointer-events-none absolute left-6 top-5 z-20 max-w-[min(560px,70vw)]">
          <h1 className="truncate text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            <SplitText text={currentProjectName} />
          </h1>
          {layout && (
            <p className="rise mt-1 text-sm text-muted-foreground" style={{ animationDelay: '500ms' }}>
              <CountUp value={layout.nodes.length} /> entities, <CountUp value={layout.links.length} /> connections, <CountUp value={layout.communities.length} /> communities
            </p>
          )}
        </header>
      )}

      {/* Empty state */}
      {!loading && !layout && !workspaceOpen && (
        <div className="rise absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 text-center">
          <OrbitLoader size={120} />
          <h2 className="text-3xl font-semibold">Nothing to explore yet</h2>
          <p className="max-w-sm text-muted-foreground">Add documents to a project and build it. Your graph appears here.</p>
          <button onClick={openWorkspace} className="mt-2 h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:-translate-y-0.5">Open projects</button>
        </div>
      )}

      {selectedNode && (
        <div className="panel-left absolute bottom-4 left-4 top-4 z-30 w-[380px] max-w-[calc(100vw-2rem)]">
          <Inspector
            selectedNode={selectedNode}
            connectedLinks={connectedLinks}
            visibleCommunities={visibleCommunities}
            communityMode={effectiveCommunityMode}
            onClose={() => setSelectedNode(null)}
            onNodeSelect={setSelectedNode}
            projectName={currentProjectName}
          />
        </div>
      )}

      <Ticker items={topEntities} onPick={pickEntity} />

      {/* Dock */}
      <div className="dock glass" role="toolbar" aria-label="Graph tools">
        <label className="dock-search">
          <Search className="h-4 w-4 shrink-0" />
          <input
            ref={searchInputRef}
            placeholder="Find an entity"
            aria-label="Find an entity"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm ? (
            <button type="button" aria-label="Clear search" className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/10" onClick={() => { setSearchTerm(''); searchInputRef.current?.focus(); }}>
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hint">⌘K</kbd>
          )}
        </label>
        <span className="dock-sep" aria-hidden />
        <button className="dock-btn" aria-pressed={inspectorMode} onClick={() => setInspectorMode(a => !a)} title="Show only the selected entity's community hierarchy">
          <Focus className="h-4 w-4" /><span className="label">Isolate</span>
        </button>
        <button className="dock-btn" aria-pressed={chatOpen} onClick={() => setChatOpen(o => !o)}>
          <Sparkles className="h-4 w-4" /><span className="label">Ask</span>
        </button>
        <button className="dock-btn" onClick={openWorkspace} aria-label={buildRunning ? 'Projects, build in progress' : 'Projects'}>
          <Layers className="h-4 w-4" /><span className="label">Projects</span>
          {buildRunning && <span className="dock-dot" aria-hidden />}
        </button>
      </div>

      {/* Ask */}
      <div
        className="panel-right glass absolute bottom-4 right-4 top-4 z-30 w-[min(420px,calc(100vw-2rem))] overflow-hidden"
        data-open={chatOpen}
        inert={!chatOpen}
      >
        <ChatPanel onHighlight={ids => setRagHighlightedNodeIds(new Set(ids))} onClose={() => setChatOpen(false)} />
      </div>

      {/* Projects workspace */}
      {workspaceOpen && (
        <div
          className={`workspace ${leaving ? 'is-leaving' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="Projects"
          onAnimationEnd={e => {
            if (e.target === e.currentTarget && leaving) { setProjectPanelOpen(false); setLeaving(false); }
          }}
        >
          {!projectNameRequired && (
            <button onClick={closeWorkspace} className="absolute right-5 top-5 z-10 flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 pl-4 pr-5 text-sm font-semibold hover:bg-white/10">
              <X className="h-4 w-4" /> Back to graph
            </button>
          )}
          <CorpusPanel
            onProjectNamed={(name) => { setCurrentProjectName(name); setProjectNameRequired(false); }}
            onProjectDeleted={() => { setCurrentProjectName(''); setProjectNameRequired(true); openWorkspace(); }}
          />
        </div>
      )}
    </div>
  );
}
