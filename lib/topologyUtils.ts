import type { TopologyData, TopologyConfig } from "@/constants/apiTypes";

export function aggregateTopology(
  rows: Record<string, unknown>[],
  config: TopologyConfig,
): TopologyData {
  const edgeMap = new Map<string, { source: string; target: string; weight: number }>();

  for (const row of rows) {
    const src = row[config.sourceColumn];
    const tgt = row[config.targetColumn];
    if (src == null || tgt == null) continue;

    const srcStr = String(src);
    const tgtStr = String(tgt);
    const key = `${srcStr}→${tgtStr}`;
    const metric = config.metricColumn
      ? (typeof row[config.metricColumn] === "number" ? (row[config.metricColumn] as number) : 1)
      : 1;

    const existing = edgeMap.get(key);
    if (existing) {
      existing.weight += metric;
    } else {
      edgeMap.set(key, { source: srcStr, target: tgtStr, weight: metric });
    }
  }

  const nodeMap = new Map<string, { connections: Set<string>; totalMetric: number }>();

  for (const edge of edgeMap.values()) {
    if (!nodeMap.has(edge.source)) {
      nodeMap.set(edge.source, { connections: new Set(), totalMetric: 0 });
    }
    if (!nodeMap.has(edge.target)) {
      nodeMap.set(edge.target, { connections: new Set(), totalMetric: 0 });
    }
    nodeMap.get(edge.source)!.connections.add(edge.target);
    nodeMap.get(edge.target)!.connections.add(edge.source);
    nodeMap.get(edge.source)!.totalMetric += edge.weight;
    nodeMap.get(edge.target)!.totalMetric += edge.weight;
  }

  const limit = config.limit ?? 50;

  let keepNodes: Set<string>;
  if (nodeMap.size > limit) {
    const sorted = Array.from(nodeMap.entries())
      .sort((a, b) => b[1].totalMetric - a[1].totalMetric)
      .slice(0, limit);
    keepNodes = new Set(sorted.map(([id]) => id));
  } else {
    keepNodes = new Set(nodeMap.keys());
  }

  const nodes = Array.from(keepNodes).map((id) => {
    const info = nodeMap.get(id)!;
    return {
      id,
      label: id,
      connections: info.connections.size,
      totalMetric: info.totalMetric,
    };
  });

  const edges = Array.from(edgeMap.values()).filter(
    (e) => keepNodes.has(e.source) && keepNodes.has(e.target),
  );

  return { nodes, edges };
}
