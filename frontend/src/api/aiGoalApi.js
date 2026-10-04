import { api } from "./api";

// Deterministic chat goal actions (JWT-scoped, confirmation-gated).
// request proposes and never deletes; confirm executes via the shared
// server-side deletion/refund service.
export const requestGoalDelete = (message, language) =>
  api.post("/api/ai/goals/delete-request", { message, language }).then((r) => r.data);

export const confirmGoalDelete = (goalId, language) =>
  api.post("/api/ai/goals/delete-confirm", { goalId, language }).then((r) => r.data);

// Explicit goal choice for an ambiguous add-money chat command.
// All checks + money movement run server-side via executeManualContribution.
export const confirmGoalAddMoney = ({ goalId, amount, conditionThreshold, idempotencyKey, language }) =>
  api
    .post("/api/ai/goals/add-money-confirm", { goalId, amount, conditionThreshold, idempotencyKey, language })
    .then((r) => r.data);
