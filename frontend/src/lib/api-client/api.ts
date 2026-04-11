import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MutationFunction,
  QueryFunction,
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";

import type {
  DashboardSummary,
  HealthStatus,
  KillSwitchResult,
  ListLogsParams,
  ListTradesParams,
  LogEntry,
  Position,
  Strategy,
  StrategyPerformance,
  Trade,
  UpdateStrategyBody,
} from "./api.schemas";

import { customFetch } from "./custom-fetch";
import type { ErrorType, BodyType } from "./custom-fetch";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

export const getHealthCheckQueryKey = () => [`/api/healthz`] as const;

export const healthCheck = async (options?: RequestInit): Promise<HealthStatus> =>
  customFetch<HealthStatus>(`/api/healthz`, { ...options, method: "GET" });

export function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryKey = options?.query?.queryKey ?? getHealthCheckQueryKey();
  const query = useQuery({ queryKey, queryFn: ({ signal }) => healthCheck({ signal }), ...options?.query }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

// Dashboard
export const getGetDashboardSummaryQueryKey = () => [`/api/dashboard/summary`] as const;

export const getDashboardSummary = async (options?: RequestInit): Promise<DashboardSummary> =>
  customFetch<DashboardSummary>(`/api/dashboard/summary`, { ...options, method: "GET" });

export function useGetDashboardSummary<TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryKey = options?.query?.queryKey ?? getGetDashboardSummaryQueryKey();
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getDashboardSummary({ signal }), ...options?.query }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

// Positions
export const getListPositionsQueryKey = () => [`/api/positions`] as const;

export const listPositions = async (options?: RequestInit): Promise<Position[]> =>
  customFetch<Position[]>(`/api/positions`, { ...options, method: "GET" });

export function useListPositions<TData = Awaited<ReturnType<typeof listPositions>>, TError = ErrorType<unknown>>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof listPositions>>, TError, TData>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryKey = options?.query?.queryKey ?? getListPositionsQueryKey();
  const query = useQuery({ queryKey, queryFn: ({ signal }) => listPositions({ signal }), ...options?.query }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

// Close all positions (kill switch)
export const closeAllPositions = async (options?: RequestInit): Promise<KillSwitchResult> =>
  customFetch<KillSwitchResult>(`/api/positions`, { ...options, method: "DELETE" });

export const useCloseAllPositions = <TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof closeAllPositions>>, TError, void, TContext>;
}): UseMutationResult<Awaited<ReturnType<typeof closeAllPositions>>, TError, void, TContext> => {
  const mutationFn: MutationFunction<Awaited<ReturnType<typeof closeAllPositions>>, void> = () => closeAllPositions();
  return useMutation({ mutationFn, ...options?.mutation });
};

// Close single position
export const closePosition = async (id: string, options?: RequestInit): Promise<Position> =>
  customFetch<Position>(`/api/positions/${id}`, { ...options, method: "DELETE" });

export const useClosePosition = <TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof closePosition>>, TError, { id: string }, TContext>;
}): UseMutationResult<Awaited<ReturnType<typeof closePosition>>, TError, { id: string }, TContext> => {
  const mutationFn: MutationFunction<Awaited<ReturnType<typeof closePosition>>, { id: string }> = ({ id }) => closePosition(id);
  return useMutation({ mutationFn, ...options?.mutation });
};

// Trades
export const getListTradesQueryKey = (params?: ListTradesParams) =>
  [`/api/trades`, ...(params ? [params] : [])] as const;

export const listTrades = async (params?: ListTradesParams, options?: RequestInit): Promise<Trade[]> => {
  const query = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && query.append(k, String(v)));
  const qs = query.toString();
  return customFetch<Trade[]>(qs ? `/api/trades?${qs}` : `/api/trades`, { ...options, method: "GET" });
};

export function useListTrades<TData = Awaited<ReturnType<typeof listTrades>>, TError = ErrorType<unknown>>(
  params?: ListTradesParams,
  options?: { query?: UseQueryOptions<Awaited<ReturnType<typeof listTrades>>, TError, TData> },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryKey = options?.query?.queryKey ?? getListTradesQueryKey(params);
  const query = useQuery({ queryKey, queryFn: ({ signal }) => listTrades(params, { signal }), ...options?.query }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

// Strategy
export const getGetStrategyQueryKey = () => [`/api/strategy`] as const;

export const getStrategy = async (options?: RequestInit): Promise<Strategy> =>
  customFetch<Strategy>(`/api/strategy`, { ...options, method: "GET" });

export function useGetStrategy<TData = Awaited<ReturnType<typeof getStrategy>>, TError = ErrorType<unknown>>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof getStrategy>>, TError, TData>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryKey = options?.query?.queryKey ?? getGetStrategyQueryKey();
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getStrategy({ signal }), ...options?.query }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

export const updateStrategy = async (body: UpdateStrategyBody, options?: RequestInit): Promise<Strategy> =>
  customFetch<Strategy>(`/api/strategy`, {
    ...options,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  });

export const useUpdateStrategy = <TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateStrategy>>, TError, { data: BodyType<UpdateStrategyBody> }, TContext>;
}): UseMutationResult<Awaited<ReturnType<typeof updateStrategy>>, TError, { data: BodyType<UpdateStrategyBody> }, TContext> => {
  const mutationFn: MutationFunction<Awaited<ReturnType<typeof updateStrategy>>, { data: BodyType<UpdateStrategyBody> }> = ({ data }) => updateStrategy(data);
  return useMutation({ mutationFn, ...options?.mutation });
};

// Strategy Performance
export const getGetStrategyPerformanceQueryKey = () => [`/api/strategy/performance`] as const;

export const getStrategyPerformance = async (options?: RequestInit): Promise<StrategyPerformance> =>
  customFetch<StrategyPerformance>(`/api/strategy/performance`, { ...options, method: "GET" });

export function useGetStrategyPerformance<TData = Awaited<ReturnType<typeof getStrategyPerformance>>, TError = ErrorType<unknown>>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof getStrategyPerformance>>, TError, TData>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryKey = options?.query?.queryKey ?? getGetStrategyPerformanceQueryKey();
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getStrategyPerformance({ signal }), ...options?.query }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

// Logs
export const getListLogsQueryKey = (params?: ListLogsParams) =>
  [`/api/logs`, ...(params ? [params] : [])] as const;

export const listLogs = async (params?: ListLogsParams, options?: RequestInit): Promise<LogEntry[]> => {
  const query = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && query.append(k, String(v)));
  const qs = query.toString();
  return customFetch<LogEntry[]>(qs ? `/api/logs?${qs}` : `/api/logs`, { ...options, method: "GET" });
};

export function useListLogs<TData = Awaited<ReturnType<typeof listLogs>>, TError = ErrorType<unknown>>(
  params?: ListLogsParams,
  options?: { query?: UseQueryOptions<Awaited<ReturnType<typeof listLogs>>, TError, TData> },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryKey = options?.query?.queryKey ?? getListLogsQueryKey(params);
  const query = useQuery({ queryKey, queryFn: ({ signal }) => listLogs(params, { signal }), refetchInterval: 5000, ...options?.query }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}
