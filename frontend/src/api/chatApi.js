import { api } from "./api";

export const getMessages = () => api.get("/api/chat").then((r) => r.data);

export const getMessage = (id) =>
  api.get(`/api/chat/${id}`).then((r) => r.data);

// { role: 'user' | 'assistant', text }
export const createMessage = (data) =>
  api.post("/api/chat", data).then((r) => r.data);

export const deleteMessage = (id) =>
  api.delete(`/api/chat/${id}`).then((r) => r.data);

export const deleteAllMessages = () =>
  api.delete("/api/chat").then((r) => r.data);
