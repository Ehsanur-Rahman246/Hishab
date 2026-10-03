import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  getTransactions,
  getTransaction,
  createTransaction,
  deleteTransaction,
} from "../api/transactionApi";

export const useTransactions = (params = {}) =>
  useQuery({
    queryKey: ["transactions", params],
    queryFn: () => getTransactions(params),
    placeholderData: keepPreviousData, // smooth pagination
  });

export const useTransaction = (id) =>
  useQuery({
    queryKey: ["transactions", "detail", id],
    queryFn: () => getTransaction(id),
    enabled: !!id,
  });

const useTransactionMutation = (fn) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["summaries"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });
};

export const useCreateTransaction = () =>
  useTransactionMutation(createTransaction);
export const useDeleteTransaction = () =>
  useTransactionMutation(deleteTransaction);
