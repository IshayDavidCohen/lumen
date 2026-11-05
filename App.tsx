import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AppShell } from "@/components/AppShell";

import DashboardPage from "@/app/(app)/dashboard/page";
import IngestPage from "@/app/(app)/ingest/page";
import DataPage from "@/app/(app)/data/page";
import DatasetsPage from "@/app/(app)/datasets/page";
import BatchesPage from "@/app/(app)/batches/page";
import TopologyPage from "@/app/(app)/topology/page";
import SettingsPage from "@/app/(app)/settings/page";

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "ingest", element: <IngestPage /> },
      { path: "data", element: <DataPage /> },
      { path: "data/:type", element: <DataPage /> },
      { path: "data/:type/:table", element: <DataPage /> },
      { path: "query", element: <Navigate to="/data" replace /> },
      { path: "topology", element: <TopologyPage /> },
      { path: "datasets", element: <DatasetsPage /> },
      { path: "batches", element: <BatchesPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
