import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/api";

// Pull a clean { status, message } out of any axios error.
// The backend never sends stack traces, so error.response.data.message
// is always safe to show.
export function toApiError(error, fallback) {
  const status = error?.response?.status ?? null;
  const message = error?.response?.data?.message;
  return {
    status,
    message: typeof message === "string" && message ? message : fallback,
  };
}

// Latest saved forecast for the logged-in user.
// 404 simply means "never generated" (handled as an empty state, not an error),
// so we don't retry those.
export function useLatestInsights() {
  return useQuery({
    queryKey: ["ai", "latest-insights"],
    queryFn: async () => {
      try {
        return (await api.get("/api/ai/latest-insights")).data;
      } catch (error) {
        if (error?.response?.status === 404) return null; // never generated
        throw error;
      }
    },
    retry: (count, error) => (error?.response?.status ?? 0) >= 500 && count < 1,
  });
}

// Generate fresh insights. The body stays empty on purpose: the backend
// identifies the user from the JWT cookie and loads transactions from MongoDB.
export function useGenerateInsights() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post("/api/ai/analyze", {})).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai", "latest-insights"] });
      queryClient.invalidateQueries({ queryKey: ["summaries"] }); // dashboard forecast card
    },
  });
}
