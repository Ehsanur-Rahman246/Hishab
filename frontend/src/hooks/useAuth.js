import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  registerUser,
  loginUser,
  logoutUser,
  deleteAccount,
  getMe,
} from "../api/authApi";

export const useRegister = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: registerUser,
    onSuccess: (data) => qc.setQueryData(["user"], data.user),
  });
};

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: loginUser,
    onSuccess: (data) => {
      qc.clear(); // drop any stale data from a previous session
      qc.setQueryData(["user"], data.user);
    },
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logoutUser,
    onSettled: () => qc.clear(),
  });
};

export const useDeleteAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => qc.clear(),
  });
};

export const useCurrentUser = () =>
  useQuery({
    queryKey: ["user"], // same key login/register write to
    queryFn: () => getMe().then((d) => d.user),
    retry: false, // a 401 means "logged out", don't retry
    staleTime: Infinity,
  });
