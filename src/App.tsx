import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AppShell } from "@/components/AppShell";

import IngestPage from "@/app/(app)/ingest/page";
import DataPage from "@/app/(app)/data/page";
import QueryPage from "@/app/(app)/query/page";
import DatasetsPage from "@/app/(app)/datasets/page";

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/ingest" replace /> },
      { path: "ingest", element: <IngestPage /> },
      { path: "data", element: <DataPage /> },
      { path: "data/:type", element: <DataPage /> },
      { path: "data/:type/:table", element: <DataPage /> },
      { path: "query", element: <QueryPage /> },
      { path: "datasets", element: <DatasetsPage /> },
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
