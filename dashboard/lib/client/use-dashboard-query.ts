import { useQuery } from '@tanstack/react-query';

export const DASHBOARD_REFETCH_INTERVAL_MS = 5_000;

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function useDashboardQuery<T>(queryKey: readonly unknown[], url: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey,
    queryFn: () => fetchJson<T>(url),
    enabled: options.enabled ?? true,
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: 1,
  });
}
