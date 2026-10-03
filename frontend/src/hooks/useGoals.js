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
} from "../api/goalApi";

export const useGoals = () =>
  useQuery({ queryKey: ["goals"], queryFn: getGoals });

export const useGoal = (id) =>
  useQuery({
    queryKey: ["goals", id],
    queryFn: () => getGoal(id),
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
export const useDeleteGoal = () => useGoalMutation(deleteGoal);
export const useSelectPlan = () =>
  useGoalMutation(({ id, planId }) => selectPlan(id, planId));
export const useUpdatePlan = () =>
  useGoalMutation(({ id, ...data }) => updatePlan(id, data));
export const useAddSavings = () =>
  useGoalMutation(({ id, amount }) => addSavings(id, amount));
export const useUpdateGoalStatus = () =>
  useGoalMutation(({ id, status }) => updateGoalStatus(id, status));
