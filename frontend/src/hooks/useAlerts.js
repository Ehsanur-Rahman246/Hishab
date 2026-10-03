import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAlerts,
  getAlert,
  markAlertRead,
  markAllAlertsRead,
  resolveAlert,
  deleteAlert,
  refreshAlerts,
} from "../api/alertApi";

export const useAlerts = () =>
  useQuery({ queryKey: ["alerts"], queryFn: getAlerts });

export const useRefreshAlerts = () => useAlertMutation(refreshAlerts);

export const useAlert = (id) =>
  useQuery({
    queryKey: ["alerts", id],
    queryFn: () => getAlert(id),
    enabled: !!id,
  });

const useAlertMutation = (fn) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
};

export const useMarkAlertRead = () => useAlertMutation(markAlertRead);
export const useMarkAllAlertsRead = () => useAlertMutation(markAllAlertsRead);
export const useResolveAlert = () => useAlertMutation(resolveAlert);
export const useDeleteAlert = () => useAlertMutation(deleteAlert);
