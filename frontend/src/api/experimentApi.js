import { api } from "./api";

export const getExperimentArms = () =>
  api.get("/api/experiments/arms").then((r) => r.data);

export const getSyntheticResults = () =>
  api.get("/api/experiments/synthetic-results").then((r) => r.data);

export const postExperimentEvent = (payload) =>
  api.post("/api/experiments/events", payload).then((r) => r.data);

export const getExperimentOutcomes = () =>
  api.get("/api/experiments/outcomes").then((r) => r.data);
