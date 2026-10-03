import { useMutation } from "@tanstack/react-query";
import { api } from "@/api/api";

// Ask the bilingual AI coach. Only { message, language } ever leaves the
// browser — the backend builds all financial context from the JWT user.
export function useAskCoach() {
  return useMutation({
    mutationFn: async ({ message, language }) =>
      (await api.post("/api/ai/coach", { message, language })).data,
  });
}
