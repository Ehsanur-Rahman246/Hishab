import { api } from "./api";

// Privacy: Zakat inputs live only in React state and in this single
// request/response cycle. Nothing is written to localStorage, and the
// backend persists nothing.
export const calculateZakat = (payload) =>
  api.post("/api/zakat/calculate", payload).then((r) => r.data);
