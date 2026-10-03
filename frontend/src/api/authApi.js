import { api } from "./api";

export const registerUser = (data) =>
  api.post("/api/auth/register", data).then((r) => r.data); // { name, phone, pin }

export const loginUser = (data) =>
  api.post("/api/auth/login", data).then((r) => r.data); // { phone, pin }

export const logoutUser = () =>
  api.post("/api/auth/logout").then((r) => r.data);

// axios needs `data` for DELETE bodies
export const deleteAccount = (pin) =>
  api.delete("/api/auth/delete-account", { data: { pin } }).then((r) => r.data);

export const getMe = () => api.get("/api/auth/me").then((r) => r.data);
