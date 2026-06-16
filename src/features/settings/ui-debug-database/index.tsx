import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState, useMemo } from 'react';

import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { Switch } from '@/common/ui/switch';
import {
  useDeleteOldCompletedTasks,
  useDebugDatabaseSize,
  useDebugTableNames,
  useDebugTableQuery,
  useOldCompletedTasksCount,
} from '@/hooks/use-debug';
import { useUISetting, useUIStore } from '@/stores/ui';

const PAGE_SIZE = 20;

export function DebugDatabase() {
  const reactScanEnabled = useUISetting('reactScanEnabled');
  const setUISetting = useUIStore((state) => state.setSetting);
  const { data: tableNames = [] } = useDebugTableNames();
  const { data: databaseSize } = useDebugDatabaseSize();
  const { data: oldCompletedTasksCount } = useOldCompletedTasksCount();
  const deleteOldCompletedTasks = useDeleteOldCompletedTasks();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showTableSizes, setShowTableSizes] = useState(false);

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
  const tableSizeByName = useMemo(() => {
    return new Map(
      (databaseSize?.tables ?? []).map((table) => [table.name, table.bytes]),
    );
  }, [databaseSize?.tables]);

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
        {databaseSize && (
          <div className="text-ink-2 relative space-y-1 text-sm">
            <button
              type="button"
              className="hover:text-ink-1 cursor-pointer underline decoration-dotted underline-offset-4"
              onClick={() => setShowTableSizes((show) => !show)}
              title={formatTableSizeTooltip(databaseSize.tables)}
            >
              Current DB size: {formatBytes(databaseSize.bytes)}
            </button>
            {showTableSizes && (
              <div className="border-glass-border text-ink-2 absolute isolate z-[10020] mt-2 max-h-72 w-72 overflow-y-auto rounded-lg border bg-[rgb(20,18,30)] p-3 shadow-lg">
                <div className="text-ink-1 mb-2 text-xs font-semibold tracking-wide uppercase">
                  Table sizes
                </div>
                <div className="space-y-1">
                  {databaseSize.tables.map((table) => (
                    <div
                      key={table.name}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="truncate font-mono">{table.name}</span>
                      <span className="text-ink-3 shrink-0">
                        {formatBytes(table.bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p>
              Vacuum reclaimable: {formatBytes(databaseSize.reclaimableBytes)}
            </p>
          </div>
        )}
      </div>

      <div className="border-glass-border bg-bg-0 rounded-lg border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-ink-1 text-sm font-medium">React Scan</h3>
            <p className="text-ink-2 mt-1 max-w-xl text-sm">
              Highlight components as they re-render. This adds runtime
              overhead, so leave it off unless you are debugging render
              performance.
            </p>
          </div>
          <Switch
            checked={reactScanEnabled}
            onChange={(enabled) => setUISetting('reactScanEnabled', enabled)}
            label={reactScanEnabled ? 'Enabled' : 'Disabled'}
            className="shrink-0"
          />
        </div>
      </div>

      <div>
        <h2 className="text-ink-1 text-lg font-semibold">Database Browser</h2>
        <p className="text-ink-3 mt-1 text-sm">
          Browse database tables and rows for debugging
        </p>
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
            title={formatTableTitle(table, tableSizeByName.get(table))}
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

function formatTableTitle(table: string, bytes: number | undefined): string {
  if (bytes === undefined) {
    return table;
  }

  return `${table}: ${formatBytes(bytes)}`;
}

function formatTableSizeTooltip(
  tables: { name: string; bytes: number }[],
): string {
  if (tables.length === 0) {
    return 'No table size data';
  }

  return tables
    .map((table) => `${table.name}: ${formatBytes(table.bytes)}`)
    .join('\n');
}
