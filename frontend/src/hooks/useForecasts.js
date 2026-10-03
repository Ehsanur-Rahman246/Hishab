import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getForecasts,
  getForecast,
  getLatestForecast,
  createForecast,
  deleteForecast,
} from "../api/forecastApi";

export const useForecasts = () =>
  useQuery({ queryKey: ["forecasts"], queryFn: getForecasts });

export const useLatestForecast = () =>
  useQuery({
    queryKey: ["forecasts", "latest"],
    queryFn: getLatestForecast,
    retry: false, // 404 just means "no forecast yet"
  });

export const useForecast = (id) =>
  useQuery({
    queryKey: ["forecasts", id],
    queryFn: () => getForecast(id),
    enabled: !!id,
  });

const useForecastMutation = (fn) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecasts"] }),
  });
};

export const useCreateForecast = () => useForecastMutation(createForecast);
export const useDeleteForecast = () => useForecastMutation(deleteForecast);
