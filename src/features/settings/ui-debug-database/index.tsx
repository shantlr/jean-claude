import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState, useMemo } from 'react';

import { useDebugTableNames, useDebugTableQuery } from '@/hooks/use-debug';

const PAGE_SIZE = 20;

export function DebugDatabase() {
  const { data: tableNames = [] } = useDebugTableNames();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  // Auto-select first table when loaded
  const activeTable = selectedTable ?? tableNames[0] ?? null;

  const queryParams = useMemo(() => {
    if (!activeTable) return null;
    return {
      table: activeTable,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
  }, [activeTable, search, page]);

  const { data, isLoading } = useDebugTableQuery(queryParams);

  const handleTableChange = (table: string) => {
    setSelectedTable(table);
    setPage(0);
    setSearch('');
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const showingFrom = data && data.total > 0 ? page * PAGE_SIZE + 1 : 0;
  const showingTo = data ? Math.min((page + 1) * PAGE_SIZE, data.total) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-200">
          Database Browser
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Browse database tables and rows for debugging
        </p>
      </div>

      {/* Table selector */}
      <div className="flex flex-wrap gap-2">
        {tableNames.map((table) => (
          <button
            key={table}
            onClick={() => handleTableChange(table)}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTable === table
                ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-700'
            }`}
          >
            {table}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search across all columns..."
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2 pr-4 pl-10 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-neutral-700">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700 bg-neutral-800">
                {data?.columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-2 text-left font-medium text-neutral-400"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={data?.columns.length || 1}
                    className="px-4 py-8 text-center text-neutral-500"
                  >
                    Loading...
                  </td>
                </tr>
              ) : data?.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={data?.columns.length || 1}
                    className="px-4 py-8 text-center text-neutral-500"
                  >
                    No rows found
                  </td>
                </tr>
              ) : (
                data?.rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-neutral-800 hover:bg-neutral-800/50"
                  >
                    {data.columns.map((col) => (
                      <td
                        key={col}
                        className="max-w-[200px] truncate px-4 py-2 text-neutral-300"
                        title={String(row[col] ?? '')}
                      >
                        {formatCellValue(row[col])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-neutral-400">
          <span>
            Showing {showingFrom}-{showingTo} of {data.total} rows
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-neutral-300 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-neutral-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-neutral-300 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-neutral-800"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
