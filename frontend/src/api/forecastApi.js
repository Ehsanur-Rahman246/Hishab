import { api } from "./api";

export const getForecasts = () => api.get("/api/forecasts").then((r) => r.data);

export const getForecast = (id) =>
  api.get(`/api/forecasts/${id}`).then((r) => r.data);

export const deleteForecast = (id) =>
  api.delete(`/api/forecasts/${id}`).then((r) => r.data);
