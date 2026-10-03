import { api } from "./api";

export const getWallet = () => api.get("/api/wallet").then((r) => r.data);

export const addMoney = (data) =>
  api.post("/api/wallet/add-money", data).then((r) => r.data); // { amount, description? }

export const withdrawMoney = (data) =>
  api.post("/api/wallet/withdraw", data).then((r) => r.data); // { amount, description? }
