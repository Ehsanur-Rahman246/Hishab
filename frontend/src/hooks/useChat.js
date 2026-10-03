import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMessages,
  deleteMessage,
  deleteAllMessages,
} from "../api/chatApi";

export const useMessages = () =>
  useQuery({ queryKey: ["chat"], queryFn: getMessages });

const useChatMutation = (fn) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat"] }),
  });
};

export const useDeleteMessage = () => useChatMutation(deleteMessage);
export const useDeleteAllMessages = () => useChatMutation(deleteAllMessages);
