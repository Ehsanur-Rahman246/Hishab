import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getShortfallOutcome,
  getShortfallPlan,
  postShortfallEvent,
  postShortfallFeedback,
  getFeedbackReport,
  getAggregateImpact,
} from "../api/shortfallApi";

export const useShortfallOutcome = () =>
  useQuery({ queryKey: ["shortfall-outcome"], queryFn: getShortfallOutcome });

export const useShortfallPlan = (language = "auto") =>
  useQuery({
    queryKey: ["shortfall-plan", language],
    queryFn: () => getShortfallPlan(language),
  });

export const useShortfallEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postShortfallEvent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shortfall-outcome"] });
      qc.invalidateQueries({ queryKey: ["shortfall-plan"] });
    },
  });
};

export const useShortfallFeedback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postShortfallFeedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shortfall-outcome"] });
      qc.invalidateQueries({ queryKey: ["shortfall-feedback"] });
    },
  });
};

export const useFeedbackReport = () =>
  useQuery({ queryKey: ["shortfall-feedback"], queryFn: getFeedbackReport });

export const useAggregateImpact = () =>
  useQuery({ queryKey: ["shortfall-aggregate"], queryFn: getAggregateImpact });
