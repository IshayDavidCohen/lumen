import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSavedQueries,
  getSavedQuery,
  createSavedQuery,
  updateSavedQuery,
  deleteSavedQuery,
  type SavedQuery,
} from "@/services/queries";

const QUERY_KEY = ["savedQueries"] as const;

export function useSavedQueries() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) => listSavedQueries(signal),
  });
}

export function useSavedQuery(id: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: ({ signal }) => getSavedQuery(id, signal),
    enabled: !!id,
  });
}

export function useSaveQuery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (query: Omit<SavedQuery, "id" | "createdAt" | "updatedAt">) =>
      createSavedQuery(query),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useUpdateQuery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SavedQuery> }) =>
      updateSavedQuery(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteQuery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedQuery(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
