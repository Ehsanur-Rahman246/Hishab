import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWallet, addMoney, withdrawMoney } from "../api/walletApi";

export const useWallet = () =>
  useQuery({ queryKey: ["wallet"], queryFn: getWallet });

const useWalletMutation = (fn) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      // both create a Transaction on the backend too
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["summaries"] });
    },
  });
};

export const useAddMoney = () => useWalletMutation(addMoney);
export const useWithdrawMoney = () => useWalletMutation(withdrawMoney);
