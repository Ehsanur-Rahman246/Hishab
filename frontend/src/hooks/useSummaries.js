import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSummaries,
  getSummary,
  generateSummary,
  deleteSummary,
} from "../api/summaryApi";

export const useSummaries = (period) =>
  useQuery({
    queryKey: ["summaries", { period }],
    queryFn: () => getSummaries(period),
  });

export const useSummary = (id) =>
  useQuery({
    queryKey: ["summaries", id],
    queryFn: () => getSummary(id),
    enabled: !!id,
  });

const useSummaryMutation = (fn) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["summaries"] }),
  });
};

export const useGenerateSummary = () => useSummaryMutation(generateSummary);
export const useDeleteSummary = () => useSummaryMutation(deleteSummary);
