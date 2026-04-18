import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState, useMemo } from 'react';

import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import {
  useDeleteOldCompletedTasks,
  useDebugDatabaseSize,
  useDebugTableNames,
  useDebugTableQuery,
  useOldCompletedTasksCount,
} from '@/hooks/use-debug';

const PAGE_SIZE = 20;

export function DebugDatabase() {
  const { data: tableNames = [] } = useDebugTableNames();
  const { data: databaseSize } = useDebugDatabaseSize();
  const { data: oldCompletedTasksCount } = useOldCompletedTasksCount();
  const deleteOldCompletedTasks = useDeleteOldCompletedTasks();
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

  const staleCompletedTasksCount = oldCompletedTasksCount?.count ?? 0;

  const handleDeleteOldCompletedTasks = () => {
    if (staleCompletedTasksCount === 0 || deleteOldCompletedTasks.isPending) {
      return;
    }

    const shouldDelete = window.confirm(
      `Delete ${staleCompletedTasksCount} completed task(s) older than 7 days? This cannot be undone.`,
    );

    if (!shouldDelete) {
      return;
    }

    deleteOldCompletedTasks.mutate();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-ink-1 text-lg font-semibold">Database Browser</h2>
        <p className="text-ink-3 mt-1 text-sm">
          Browse database tables and rows for debugging
        </p>
        {databaseSize && (
          <p className="text-ink-2 mt-2 text-sm">
            Current DB size: {formatBytes(databaseSize.bytes)}
          </p>
        )}
      </div>

      <div className="border-glass-border bg-bg-0 rounded-lg border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-ink-1 text-sm font-medium">
              Cleanup old completed tasks
            </h3>
            <p className="text-ink-2 mt-1 text-sm">
              Completed tasks older than 7 days: {staleCompletedTasksCount}
            </p>
          </div>
          <Button
            onClick={handleDeleteOldCompletedTasks}
            disabled={
              staleCompletedTasksCount === 0 ||
              deleteOldCompletedTasks.isPending
            }
            loading={deleteOldCompletedTasks.isPending}
            variant="danger"
            size="sm"
          >
            {deleteOldCompletedTasks.isPending
              ? 'Deleting...'
              : 'Delete old completed tasks'}
          </Button>
        </div>
      </div>

      {/* Table selector */}
      <div className="flex flex-wrap gap-2">
        {tableNames.map((table) => (
          <Button
            key={table}
            onClick={() => handleTableChange(table)}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTable === table
                ? 'border-acc bg-acc/20 text-acc-ink'
                : 'border-glass-border bg-bg-1 text-ink-1 hover:border-glass-border-strong hover:bg-glass-medium'
            }`}
          >
            {table}
          </Button>
        ))}
      </div>

      {/* Search */}
      <Input
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search across all columns..."
        icon={<Search />}
      />

      {/* Table */}
      <div className="border-glass-border overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-glass-border bg-bg-1 border-b">
                {data?.columns.map((col) => (
                  <th
                    key={col}
                    className="text-ink-2 px-4 py-2 text-left font-medium"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={1} className="text-ink-3 px-4 py-8 text-center">
                    Loading...
                  </td>
                </tr>
              ) : data?.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={data?.columns.length || 1}
                    className="text-ink-3 px-4 py-8 text-center"
                  >
                    No rows found
                  </td>
                </tr>
              ) : (
                data?.rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-line-soft hover:bg-glass-light/50 border-b"
                  >
                    {data.columns.map((col) => (
                      <td
                        key={col}
                        className="text-ink-1 max-w-[200px] truncate px-4 py-2"
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
        <div className="text-ink-2 flex items-center justify-between text-sm">
          <span>
            Showing {showingFrom}-{showingTo} of {data.total} rows
          </span>
          <div className="flex gap-2">
            <Button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              size="sm"
              icon={<ChevronLeft />}
            >
              Prev
            </Button>
            <Button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              size="sm"
              icon={<ChevronRight />}
            >
              Next
            </Button>
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}
