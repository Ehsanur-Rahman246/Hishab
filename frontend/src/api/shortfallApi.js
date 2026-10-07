import { api } from "./api";

export const getShortfallOutcome = () =>
  api.get("/api/shortfall/outcome").then((r) => r.data);

export const getShortfallPlan = (language = "auto") =>
  api.get("/api/shortfall/plan", { params: { language } }).then((r) => r.data);

export const postShortfallEvent = (payload) =>
  api.post("/api/shortfall/events", payload).then((r) => r.data);

export const postShortfallFeedback = (payload) =>
  api.post("/api/shortfall/feedback", payload).then((r) => r.data);

export const getFeedbackReport = () =>
  api.get("/api/shortfall/feedback-report").then((r) => r.data);

export const getAggregateImpact = () =>
  api.get("/api/shortfall/aggregate-impact").then((r) => r.data);
