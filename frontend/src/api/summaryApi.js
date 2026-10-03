import { api } from "./api";

// period: 'weekly' | 'monthly' (optional)
export const getSummaries = (period) =>
  api
    .get("/api/summaries", { params: period ? { period } : {} })
    .then((r) => r.data);

export const getSummary = (id) =>
  api.get(`/api/summaries/${id}`).then((r) => r.data);

// { period, date? }
export const generateSummary = (data) =>
  api.post("/api/summaries/generate", data).then((r) => r.data);

export const deleteSummary = (id) =>
  api.delete(`/api/summaries/${id}`).then((r) => r.data);
