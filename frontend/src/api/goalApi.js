import { api } from "./api";

export const getGoals = () => api.get("/api/goals").then((r) => r.data);

export const getGoal = (id) => api.get(`/api/goals/${id}`).then((r) => r.data);

// { title, description?, targetAmount, targetDate }
export const createGoal = (data) =>
  api.post("/api/goals", data).then((r) => r.data);

export const updateGoal = (id, data) =>
  api.patch(`/api/goals/${id}`, data).then((r) => r.data);

export const deleteGoal = (id) =>
  api.delete(`/api/goals/${id}`).then((r) => r.data);

export const selectPlan = (id, planId) =>
  api.patch(`/api/goals/${id}/select-plan`, { planId }).then((r) => r.data);

// { monthlyAmount?, weeklyAmount?, projectedCompletionDate? }
export const updatePlan = (id, data) =>
  api.patch(`/api/goals/${id}/update-plan`, data).then((r) => r.data);

export const addSavings = (id, amount) =>
  api.post(`/api/goals/${id}/add-savings`, { amount }).then((r) => r.data);

// status: active | paused | cancelled | completed
export const updateGoalStatus = (id, status) =>
  api.patch(`/api/goals/${id}/status`, { status }).then((r) => r.data);
