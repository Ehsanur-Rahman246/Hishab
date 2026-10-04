import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/api";

// Only { message, language, idempotencyKey? } leaves the browser.
// The backend saves both messages, so we just refresh the chat list
// afterwards. The idempotency key lets safe retries reuse one transfer
// instead of moving money twice.
export function useAskCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ message, language, idempotencyKey }) =>
      (await api.post("/api/ai/coach", { message, language, idempotencyKey })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat"] }),
  });
}
