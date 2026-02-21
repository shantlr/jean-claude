import { useQuery } from '@tanstack/react-query';

import { api, QueryTableParams, QueryTableResult } from '@/lib/api';

export function useDebugTableNames() {
  return useQuery({
    queryKey: ['debug', 'tableNames'],
    queryFn: () => api.debug.getTableNames(),
  });
}

export function useDebugDatabaseSize() {
  return useQuery({
    queryKey: ['debug', 'databaseSize'],
    queryFn: () => api.debug.getDatabaseSize(),
  });
}

export function useDebugTableQuery(params: QueryTableParams | null) {
  return useQuery<QueryTableResult>({
    queryKey: ['debug', 'table', params?.table, params?.search, params?.offset],
    queryFn: () => api.debug.queryTable(params!),
    enabled: params !== null,
  });
}
