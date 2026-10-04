import { api } from "./api";

export const getGoals = () => api.get("/api/goals").then((r) => r.data);

export const getGoal = (id) => api.get(`/api/goals/${id}`).then((r) => r.data);

// { title, description?, targetAmount, targetDate, automation?:
//   { enabled, frequency: weekly|monthly, percentage, priority } }
export const createGoal = (data) =>
  api.post("/api/goals", data).then((r) => r.data);

export const updateGoal = (id, data) =>
  api.patch(`/api/goals/${id}`, data).then((r) => r.data);

export const deleteGoal = (id, idempotencyKey) =>
  api.delete(`/api/goals/${id}`, { data: idempotencyKey ? { idempotencyKey } : {} }).then((r) => r.data);

export const selectPlan = (id, planId) =>
  api.patch(`/api/goals/${id}/select-plan`, { planId }).then((r) => r.data);

// { monthlyAmount?, weeklyAmount?, projectedCompletionDate? }
export const updatePlan = (id, data) =>
  api.patch(`/api/goals/${id}/update-plan`, data).then((r) => r.data);

export const addSavings = (id, amount, idempotencyKey) =>
  api
    .post(`/api/goals/${id}/add-savings`, {
      amount,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    })
    .then((r) => r.data);

// status: active | paused | cancelled | completed ("released" is system-only)
export const updateGoalStatus = (id, status) =>
  api.patch(`/api/goals/${id}/status`, { status }).then((r) => r.data);

// { enabled?, frequency?, percentage?, priority?, paused? }
export const updateGoalAutomation = (id, data) =>
  api.patch(`/api/goals/${id}/automation`, data).then((r) => r.data);

export const getGoalTransfers = (id) =>
  api.get(`/api/goals/${id}/transfers`).then((r) => r.data);

// Demo/test: runs releases + the currently-due cycle for the logged-in user.
export const runAutomationNow = () =>
  api.post("/api/goals/automation/run-now", {}).then((r) => r.data);
