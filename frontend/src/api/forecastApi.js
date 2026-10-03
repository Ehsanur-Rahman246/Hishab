import { api } from "./api";

export const getForecasts = () => api.get("/api/forecasts").then((r) => r.data);

export const getLatestForecast = () =>
  api.get("/api/forecasts/latest").then((r) => r.data);

export const getForecast = (id) =>
  api.get(`/api/forecasts/${id}`).then((r) => r.data);

// { modelUsed, horizonWeeks, weeks: [...] }
export const createForecast = (data) =>
  api.post("/api/forecasts", data).then((r) => r.data);

export const deleteForecast = (id) =>
  api.delete(`/api/forecasts/${id}`).then((r) => r.data);
