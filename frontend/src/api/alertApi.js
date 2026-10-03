import { api } from "./api";

export const getAlerts = () => api.get("/api/alerts").then((r) => r.data);

export const refreshAlerts = () =>
  api.post("/api/alerts/refresh").then((r) => r.data);

export const getAlert = (id) =>
  api.get(`/api/alerts/${id}`).then((r) => r.data);

export const markAlertRead = (id) =>
  api.patch(`/api/alerts/${id}/read`).then((r) => r.data);

export const markAllAlertsRead = () =>
  api.patch("/api/alerts/read-all").then((r) => r.data);

export const resolveAlert = (id) =>
  api.patch(`/api/alerts/${id}/resolve`).then((r) => r.data);

export const deleteAlert = (id) =>
  api.delete(`/api/alerts/${id}`).then((r) => r.data);
