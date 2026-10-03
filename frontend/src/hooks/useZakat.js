import { useMutation } from "@tanstack/react-query";
import { calculateZakat } from "@/api/zakatApi";

// One-shot mutation: no caching of results, no history, no persistence.
export function useCalculateZakat() {
  return useMutation({ mutationFn: calculateZakat });
}
