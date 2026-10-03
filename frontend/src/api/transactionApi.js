import { api } from "../api/api";

// params: { type, category, from, to, page, limit }
export const getTransactions = (params) =>
  api.get("/api/transactions", { params }).then((r) => r.data);

export const getTransaction = (id) =>
  api.get(`/api/transactions/${id}`).then((r) => r.data);

// { type, category, subcategory?, amount, date?, description? }
export const createTransaction = (data) =>
  api.post("/api/transactions", data).then((r) => r.data);

export const deleteTransaction = (id) =>
  api.delete(`/api/transactions/${id}`).then((r) => r.data);
