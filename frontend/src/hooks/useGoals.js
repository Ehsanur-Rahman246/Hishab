import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getGoals,
  getGoal,
  createGoal,
  updateGoal,
  deleteGoal,
  selectPlan,
  updatePlan,
  addSavings,
  updateGoalStatus,
  updateGoalAutomation,
  getGoalTransfers,
  runAutomationNow,
} from "../api/goalApi";

export const useGoals = () =>
  useQuery({ queryKey: ["goals"], queryFn: getGoals });

export const useGoal = (id) =>
  useQuery({
    queryKey: ["goals", id],
    queryFn: () => getGoal(id),
    enabled: !!id,
  });

export const useGoalTransfers = (id) =>
  useQuery({
    queryKey: ["goals", id, "transfers"],
    queryFn: () => getGoalTransfers(id),
    enabled: !!id,
  });

// every goal mutation just refreshes the goals cache
const useGoalMutation = (fn) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
};

export const useCreateGoal = () => useGoalMutation(createGoal);
export const useUpdateGoal = () =>
  useGoalMutation(({ id, ...data }) => updateGoal(id, data));
export const useDeleteGoal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars) => {
      const id = typeof vars === "string" ? vars : vars?.id;
      const key = typeof vars === "string" ? undefined : vars?.idempotencyKey;
      return deleteGoal(id, key);
    },
    onSuccess: () => {
      // Deletion refunds Wallet + writes ledger/transaction/alert rows, so
      // every affected cache refreshes at once.
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["summaries"] });
      qc.invalidateQueries({ queryKey: ["chat"] });
    },
  });
};
export const useSelectPlan = () =>
  useGoalMutation(({ id, planId }) => selectPlan(id, planId));
export const useUpdatePlan = () =>
  useGoalMutation(({ id, ...data }) => updatePlan(id, data));
export const useAddSavings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, idempotencyKey }) =>
      addSavings(id, amount, idempotencyKey),
    onSuccess: () => {
      // A manual transfer moves Wallet -> Goal and writes ledger +
      // transaction rows, so every affected cache refreshes at once.
      // A goal-completing transfer also releases funds (wallet credit +
      // release alert), so alerts refresh too.
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["summaries"] });
    },
  });
};
export const useUpdateGoalStatus = () =>
  useGoalMutation(({ id, status }) => updateGoalStatus(id, status));
export const useUpdateGoalAutomation = () =>
  useGoalMutation(({ id, ...data }) => updateGoalAutomation(id, data));
export const useRunAutomationNow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runAutomationNow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["summaries"] });
    },
  });
};
