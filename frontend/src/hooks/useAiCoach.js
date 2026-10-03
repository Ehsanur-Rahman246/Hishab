import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/api";

// Only { message, language } leaves the browser. The backend saves both
// messages, so we just refresh the chat list afterwards.
export function useAskCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ message, language }) =>
      (await api.post("/api/ai/coach", { message, language })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat"] }),
  });
}
