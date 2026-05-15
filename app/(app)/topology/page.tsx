import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Table2 } from "lucide-react";
import { getDatasetTypes, getTables, getTableData } from "@/services/datasets";
import { NetworkGraph } from "@/components/NetworkGraph";
import { TopologyConfigPanel } from "@/components/TopologyConfigPanel";
import { aggregateTopology } from "@/lib/topologyUtils";
import type { TopologyConfig, TableInfo } from "@/constants/apiTypes";

export default function TopologyPage() {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [config, setConfig] = useState<TopologyConfig>({
    sourceColumn: "",
    targetColumn: "",
    limit: 50,
  });

  const { data: typesData } = useQuery({
    queryKey: ["datasetTypes"],
    queryFn: ({ signal }) => getDatasetTypes(signal),
  });
  const types = typesData?.types ?? [];

  useEffect(() => {
    if (types.length > 0 && !selectedType) {
      setSelectedType(types[0]!);
    }
  }, [types, selectedType]);

  const { data: tablesData } = useQuery({
    queryKey: ["tables", selectedType],
    queryFn: ({ signal }) => getTables(selectedType!, signal),
    enabled: !!selectedType,
  });
  const tables = tablesData?.tables ?? [];

  useEffect(() => {
    if (tables.length > 0 && !selectedTable) {
      setSelectedTable(tables[0]!.name);
    }
  }, [tables, selectedTable]);

  const tableInfo = tables.find((t: TableInfo) => t.name === selectedTable);

  // Auto-set source/target columns when table changes
  useEffect(() => {
    if (!tableInfo) return;
    const strCols = tableInfo.columns.filter((c) => c.type === "string");
    const srcCandidate = strCols.find((c) => c.name.includes("src")) ?? strCols[0];
    const dstCandidate = strCols.find((c) => c.name.includes("dst")) ?? strCols[1] ?? strCols[0];
    const numCols = tableInfo.columns.filter((c) => c.type === "number");
    const metricCandidate = numCols.find(
      (c) => c.name === "bytes" || c.name === "length" || c.name === "count",
    );

    setConfig((prev) => ({
      ...prev,
      sourceColumn: srcCandidate?.name ?? "",
      targetColumn: dstCandidate?.name ?? "",
      metricColumn: metricCandidate?.name,
    }));
  }, [tableInfo]);

  const { data: tableData, isLoading } = useQuery({
    queryKey: ["tableData", selectedType, selectedTable, "topology", 5000],
    queryFn: ({ signal }) =>
      getTableData({
        type: selectedType!,
        name: selectedTable!,
        page: 1,
        pageSize: 5000,
        signal,
      }),
    enabled: !!selectedType && !!selectedTable,
  });

  const topologyData = useMemo(() => {
    if (!tableData || !config.sourceColumn || !config.targetColumn) {
      return { nodes: [], edges: [] };
    }
    return aggregateTopology(tableData.rows, config);
  }, [tableData, config]);

  const handleTypeChange = useCallback((val: string) => {
    setSelectedType(val);
    setSelectedTable(null);
  }, []);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      {/* Top bar */}
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-zinc-400" />
            <select
              value={selectedType ?? ""}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="h-7 rounded-md border px-2 text-xs font-medium
                         border-zinc-300 bg-white text-zinc-700
                         dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Table2 size={14} className="text-zinc-400" />
            <select
              value={selectedTable ?? ""}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="h-7 rounded-md border px-2 text-xs font-medium
                         border-zinc-300 bg-white text-zinc-700
                         dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {tables.map((t: TableInfo) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            {tableInfo && (
              <TopologyConfigPanel
                columns={tableInfo.columns}
                config={config}
                onChange={setConfig}
              />
            )}
          </div>
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-400 dark:text-zinc-500">Loading data…</p>
          </div>
        ) : (
          <NetworkGraph
            data={topologyData}
            config={config}
            height={undefined}
            className="h-full w-full"
          />
        )}
      </div>

      {/* Bottom stats bar */}
      <div className="border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {topologyData.nodes.length} nodes, {topologyData.edges.length} edges
          {config.limit ? `, showing top ${config.limit}` : ""}
        </span>
      </div>
    </div>
  );
}
