import { useEffect, useRef, useState, useCallback } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { TopologyData, TopologyConfig } from "@/constants/apiTypes";

interface NetworkGraphProps {
  data: TopologyData;
  config: TopologyConfig;
  width?: number;
  height?: number;
  className?: string;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  connections: number;
  totalMetric: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  weight: number;
}

function clampRadius(value: number, min: number, max: number, domainMin: number, domainMax: number): number {
  if (domainMax === domainMin) return (min + max) / 2;
  const t = (value - domainMin) / (domainMax - domainMin);
  return min + t * (max - min);
}

function colorByDegree(connections: number, maxConn: number): string {
  const t = maxConn > 0 ? Math.min(connections / maxConn, 1) : 0;
  const r = Math.round(59 + t * (244 - 59));
  const g = Math.round(130 + t * (63 - 130));
  const b = Math.round(246 + t * (94 - 246));
  return `rgb(${r},${g},${b})`;
}

export function NetworkGraph({
  data,
  config: _config,
  width: propWidth,
  height = 600,
  className,
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [links, setLinks] = useState<SimLink[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(
    propWidth != null ? { w: propWidth, h: height } : null,
  );

  const dragRef = useRef<{ nodeId: string; startX: number; startY: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const transformRef = useRef(transform);
  nodesRef.current = nodes;
  transformRef.current = transform;

  useEffect(() => {
    if (!containerRef.current || propWidth != null) return;
    const el = containerRef.current;
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [propWidth]);

  const w = propWidth ?? (containerSize?.w || 0);
  const h = containerSize?.h ?? height;

  useEffect(() => {
    if (data.nodes.length === 0 || w === 0 || h === 0) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const simNodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      x: w / 2 + (Math.random() - 0.5) * 200,
      y: h / 2 + (Math.random() - 0.5) * 200,
    }));

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = data.edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!,
        weight: e.weight,
      }));

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(80),
      )
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(w / 2, h / 2))
      .force("collide", forceCollide<SimNode>().radius(20));

    simulationRef.current = sim;

    sim.on("tick", () => {
      setNodes([...simNodes]);
      setLinks([...simLinks]);
    });

    return () => {
      sim.stop();
    };
  }, [data, w, h]);

  const maxMetric = Math.max(...data.nodes.map((n) => n.totalMetric), 1);
  const minMetric = Math.min(...data.nodes.map((n) => n.totalMetric), 0);
  const maxConn = Math.max(...data.nodes.map((n) => n.connections), 1);
  const maxWeight = Math.max(...data.edges.map((e) => e.weight), 1);

  const connectedToHover = new Set<string>();
  if (hoveredNode) {
    for (const link of links) {
      const srcId = typeof link.source === "object" ? link.source.id : String(link.source);
      const tgtId = typeof link.target === "object" ? link.target.id : String(link.target);
      if (srcId === hoveredNode) connectedToHover.add(tgtId);
      if (tgtId === hoveredNode) connectedToHover.add(srcId);
    }
    connectedToHover.add(hoveredNode);
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      k: Math.max(0.1, Math.min(5, prev.k * factor)),
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === "rect") {
      const t = transformRef.current;
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: t.x,
        startTy: t.y,
      };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current && simulationRef.current) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
      if (node) {
        const k = transformRef.current.k;
        node.fx = (e.clientX - dragRef.current.startX) / k + (node.x ?? 0);
        node.fy = (e.clientY - dragRef.current.startY) / k + (node.y ?? 0);
        dragRef.current.startX = e.clientX;
        dragRef.current.startY = e.clientY;
        // Use minimal alpha so only the pinned node moves; don't reheat the whole simulation
        const sim = simulationRef.current;
        if (sim.alpha() < 0.01) {
          sim.alphaTarget(0).alpha(0.01).restart();
        }
      }
      return;
    }

    const pan = panRef.current;
    if (pan) {
      setTransform((prev) => ({
        ...prev,
        x: pan.startTx + (e.clientX - pan.startX),
        y: pan.startTy + (e.clientY - pan.startY),
      }));
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current && simulationRef.current) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      simulationRef.current.alphaTarget(0).alpha(0.05).restart();
    }
    dragRef.current = null;
    panRef.current = null;
  }, []);

  if (data.nodes.length === 0) {
    return (
      <div
        ref={containerRef}
        className={`flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 ${className ?? ""}`}
        style={{ height }}
      >
        <p className="text-sm text-zinc-400 dark:text-zinc-600">
          No network data to visualize
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        className="absolute inset-0 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <rect width={w} height={h} fill="transparent" />
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Edges */}
          {links.map((link, i) => {
            const src = link.source as SimNode;
            const tgt = link.target as SimNode;
            if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) return null;

            const edgeKey = `${src.id}→${tgt.id}`;
            const isHovered = hoveredEdge === edgeKey;
            const isDimmed = hoveredNode && !connectedToHover.has(src.id) && !connectedToHover.has(tgt.id);
            const strokeWidth = 1 + (link.weight / maxWeight) * 4;
            const opacity = isHovered ? 0.9 : isDimmed ? 0.08 : 0.3 + (link.weight / maxWeight) * 0.4;

            return (
              <line
                key={i}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={isHovered ? "#3b82f6" : "#94a3b8"}
                strokeWidth={strokeWidth}
                opacity={opacity}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  setHoveredEdge(edgeKey);
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    content: `${src.id} → ${tgt.id}\nWeight: ${link.weight.toLocaleString()}`,
                  });
                }}
                onMouseLeave={() => {
                  setHoveredEdge(null);
                  setTooltip(null);
                }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const r = clampRadius(node.totalMetric, 8, 40, minMetric, maxMetric);
            const isDimmed = hoveredNode && !connectedToHover.has(node.id);
            const isHighlighted = hoveredNode === node.id;
            const color = colorByDegree(node.connections, maxConn);

            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                opacity={isDimmed ? 0.15 : 1}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  setHoveredNode(node.id);
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    content: `${node.id}\nConnections: ${node.connections}\nMetric: ${node.totalMetric.toLocaleString()}`,
                  });
                }}
                onMouseLeave={() => {
                  setHoveredNode(null);
                  setTooltip(null);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  dragRef.current = { nodeId: node.id, startX: e.clientX, startY: e.clientY };
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {isHighlighted && (
                  <circle r={r + 4} fill="none" stroke="#3b82f6" strokeWidth={2} opacity={0.5} />
                )}
                <circle
                  r={r}
                  fill={color}
                  stroke={node.fx != null ? "#f59e0b" : "white"}
                  strokeWidth={node.fx != null ? 2 : 1.5}
                  opacity={0.9}
                />
                <text
                  dy={r + 14}
                  textAnchor="middle"
                  className="pointer-events-none select-none fill-zinc-600 text-[10px] dark:fill-zinc-400"
                >
                  {node.label.length > 15 ? `${node.label.slice(0, 15)}…` : node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-md border px-3 py-2 text-xs shadow-lg
                     border-zinc-200 bg-white text-zinc-800
                     dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          {tooltip.content.split("\n").map((line, i) => (
            <p key={i} className={i > 0 ? "text-zinc-500 dark:text-zinc-400" : "font-medium"}>
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 rounded-md border px-3 py-2 text-[10px]
                       border-zinc-200 bg-white/90 backdrop-blur
                       dark:border-zinc-700 dark:bg-zinc-900/90">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">Legend</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorByDegree(0, maxConn) }} />
          <span className="text-zinc-500">Few connections</span>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorByDegree(maxConn, maxConn) }} />
          <span className="text-zinc-500">Many connections</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-2 w-6 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          <span className="text-zinc-500">Edge = traffic volume</span>
        </div>
      </div>
    </div>
  );
}
