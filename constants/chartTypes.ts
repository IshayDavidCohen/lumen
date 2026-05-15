import type { ChartType } from "@/constants/apiTypes";

export const CHART_TYPE_OPTIONS: Array<{
  value: ChartType;
  label: string;
  description: string;
  icon: string;
}> = [
  { value: "bar", label: "Bar", description: "Compare categories", icon: "BarChart3" },
  { value: "line", label: "Line", description: "Trends over time", icon: "TrendingUp" },
  { value: "scatter", label: "Scatter", description: "Correlations", icon: "ScatterChart" },
  { value: "histogram", label: "Histogram", description: "Distributions", icon: "BarChart" },
];
