import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  X,
  Loader2,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  RotateCcw,
  Copy,
  Check,
  FolderArchive,
} from 'lucide-react';
import type { Ref } from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';

import { Button } from '@/common/ui/button';
import { Chip } from '@/common/ui/chip';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { Separator } from '@/common/ui/separator';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useMessagesWithRawData } from '@/hooks/use-messages-with-raw-data';
import { api } from '@/lib/api';
import type { DebugMessageWithRawData } from '@/lib/api';
import { useDebugMessagesPaneWidth } from '@/stores/navigation';
import { useTaskMessagesStore } from '@/stores/task-messages';

import { TASK_PANEL_HEADER_HEIGHT_CLS } from './constants';

// --- Copy to Clipboard ---

function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((value: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    setCopied(true);
  }, []);

  useEffect(() => {
    if (copied) {
      const handle = setTimeout(() => {
        setCopied(false);
      }, 1500);
      return () => {
        clearTimeout(handle);
      };
    }
  }, [copied]);

  return { copied, copy };
}

function CopyJsonButton({
  value,
  label,
  className,
}: {
  value: unknown | (() => unknown);
  label?: string;
  className?: string;
}) {
  const { copy, copied } = useCopyToClipboard();

  return (
    <Button
      onClick={(e) => {
        e.stopPropagation();
        copy(typeof value === 'function' ? value() : value);
      }}
      className={clsx(
        'inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
        copied
          ? 'text-status-done bg-status-done/30'
          : 'bg-glass-medium/50 text-ink-2 hover:text-ink-1 hover:bg-glass-medium',
        className,
      )}
      title={label ?? 'Copy JSON'}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {label && <span>{label}</span>}
    </Button>
  );
}

// --- Collapsible JSON Tree ---

function JsonValue({
  value,
  defaultExpanded,
}: {
  value: unknown;
  defaultExpanded?: boolean;
}) {
  if (value === null) {
    return <span className="text-ink-3">null</span>;
  }
  if (value === undefined) {
    return <span className="text-ink-3">undefined</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-status-run">{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-acc-ink">{String(value)}</span>;
  }
  if (typeof value === 'string') {
    const display = value.length > 120 ? value.slice(0, 120) + '...' : value;
    return (
      <span
        className="text-status-done"
        title={value.length > 120 ? value : undefined}
      >
        &quot;{display}&quot;
      </span>
    );
  }
  if (Array.isArray(value)) {
    return <JsonArray items={value} defaultExpanded={defaultExpanded} />;
  }
  if (typeof value === 'object') {
    return (
      <JsonObject
        obj={value as Record<string, unknown>}
        defaultExpanded={defaultExpanded}
      />
    );
  }
  return <span className="text-ink-2">{String(value)}</span>;
}

function JsonArray({
  items,
  defaultExpanded = false,
}: {
  items: unknown[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (items.length === 0) {
    return <span className="text-ink-3">[]</span>;
  }

  if (!expanded) {
    return (
      <span
        className="text-ink-2 hover:text-ink-1 cursor-pointer"
        onClick={() => setExpanded(true)}
      >
        <ChevronRight className="mr-0.5 inline h-3 w-3" />
        <span className="text-ink-3">
          [{items.length} item{items.length !== 1 ? 's' : ''}]
        </span>
      </span>
    );
  }

  return (
    <span>
      <span
        className="text-ink-2 hover:text-ink-1 cursor-pointer"
        onClick={() => setExpanded(false)}
      >
        <ChevronDown className="mr-0.5 inline h-3 w-3" />[
      </span>
      <div className="relative ml-4 pl-3">
        <div className="absolute top-1 bottom-1 left-0.5 w-px rounded-full bg-white/[0.06]" />
        {items.map((item, index) => (
          <div key={index} className="py-0.5">
            <span className="text-ink-4 mr-1">{index}:</span>
            <JsonValue value={item} defaultExpanded={defaultExpanded} />
            {index < items.length - 1 && <span className="text-ink-4">,</span>}
          </div>
        ))}
      </div>
      <span className="text-ink-2">]</span>
    </span>
  );
}

function JsonObject({
  obj,
  defaultExpanded = false,
}: {
  obj: Record<string, unknown>;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    return <span className="text-ink-3">{'{}'}</span>;
  }

  if (!expanded) {
    return (
      <span
        className="text-ink-2 hover:text-ink-1 cursor-pointer"
        onClick={() => setExpanded(true)}
      >
        <ChevronRight className="mr-0.5 inline h-3 w-3" />
        <span className="text-ink-3">
          {'{'}
          {keys.length} key{keys.length !== 1 ? 's' : ''}
          {'}'}
        </span>
      </span>
    );
  }

  return (
    <span>
      <span
        className="text-ink-2 hover:text-ink-1 cursor-pointer"
        onClick={() => setExpanded(false)}
      >
        <ChevronDown className="mr-0.5 inline h-3 w-3" />
        {'{'}
      </span>
      <div className="relative ml-4 pl-3">
        <div className="absolute top-1 bottom-1 left-0.5 w-px rounded-full bg-white/[0.06]" />
        {keys.map((key, index) => (
          <div key={key} className="py-0.5">
            <span className="text-acc-ink">&quot;{key}&quot;</span>
            <span className="text-ink-3">: </span>
            <JsonValue value={obj[key]} defaultExpanded={defaultExpanded} />
            {index < keys.length - 1 && <span className="text-ink-4">,</span>}
          </div>
        ))}
      </div>
      <span className="text-ink-2">{'}'}</span>
    </span>
  );
}

// --- Debug Message Card ---

function DebugMessageCard({
  message,
  isHighlighted,
  defaultExpanded = false,
  cardRef,
}: {
  message: DebugMessageWithRawData;
  isHighlighted?: boolean;
  defaultExpanded?: boolean;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const hasRaw = message.rawData !== null;
  const hasNormalized = message.normalizedData !== null;

  return (
    <div
      ref={cardRef}
      className={clsx(
        'bg-bg-1/30 flex w-full flex-col overflow-hidden rounded-md border',
        isHighlighted
          ? 'border-acc/50 ring-acc/30 ring-1'
          : 'border-white/[0.06]',
      )}
    >
      {/* Card header */}
      <Button
        onClick={() => setExpanded(!expanded)}
        className="hover:bg-glass-light flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors"
      >
        {expanded ? (
          <ChevronDown className="text-ink-3 h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-ink-3 h-3.5 w-3.5 shrink-0" />
        )}
        <span className="text-ink-1 font-mono text-xs font-medium">
          #{message.messageIndex}
        </span>
        {message.rawFormat && (
          <Chip size="xs" color="neutral">
            {message.rawFormat}
          </Chip>
        )}
        {/* Presence indicators */}
        <Chip
          size="xs"
          color={hasRaw ? 'blue' : 'neutral'}
          className={!hasRaw ? 'text-ink-4' : ''}
        >
          raw
        </Chip>
        <Chip
          size="xs"
          color={hasNormalized ? 'green' : 'neutral'}
          className={!hasNormalized ? 'text-ink-4' : ''}
        >
          normalized
        </Chip>
        {message.backendSessionId && (
          <span
            className="text-ink-4 truncate font-mono text-[10px]"
            title={message.backendSessionId}
          >
            {message.backendSessionId.slice(0, 8)}...
          </span>
        )}
        <span className="text-ink-4 ml-auto shrink-0 text-[10px]">
          {message.createdAt
            ? new Date(message.createdAt).toLocaleTimeString()
            : '\u00A0'}
        </span>
      </Button>

      {/* Card body — Side-by-side JSON */}
      {expanded && (
        <>
          <Separator />
          <div className="flex min-h-0 w-full">
            {/* Raw side */}
            <div className="flex w-full flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-acc-ink text-[10px] font-semibold tracking-wider uppercase">
                  Raw
                </span>
                {hasRaw && <CopyJsonButton value={message.rawData} />}
              </div>
              <div className="max-h-[500px] overflow-auto p-3 font-mono text-xs leading-relaxed">
                {hasRaw ? (
                  <JsonValue value={message.rawData} defaultExpanded />
                ) : (
                  <span className="text-ink-4 italic">
                    No raw message (synthetic)
                  </span>
                )}
              </div>
            </div>
            <Separator orientation="vertical" />
            {/* Normalized side */}
            <div className="flex w-full flex-col overflow-hidden">
              <div className="flex w-full items-center justify-between px-3 py-1.5">
                <span className="text-status-done text-[10px] font-semibold tracking-wider uppercase">
                  Normalized
                </span>
                {hasNormalized && (
                  <CopyJsonButton value={message.normalizedData} />
                )}
              </div>
              <div className="max-h-[500px] overflow-auto p-3 font-mono text-xs leading-relaxed">
                {hasNormalized ? (
                  <JsonValue value={message.normalizedData} defaultExpanded />
                ) : (
                  <span className="text-ink-4 italic">
                    No normalized message (filtered)
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- Main Component ---

export function DebugMessagesPane({
  taskId,
  stepId,
  scrollToEntryId,
  onClose,
}: {
  taskId: string;
  stepId: string | null;
  scrollToEntryId?: string;
  onClose: () => void;
}) {
  const {
    data: debugMessages,
    isLoading,
    error,
    refetch,
  } = useMessagesWithRawData({ taskId, stepId });

  const [searchFilter, setSearchFilter] = useState('');
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(
    scrollToEntryId ?? null,
  );
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  const prevScrollToEntryIdRef = useRef(scrollToEntryId);

  // Reset highlight when scrollToEntryId changes (e.g., right-clicking a different message)
  if (prevScrollToEntryIdRef.current !== scrollToEntryId) {
    prevScrollToEntryIdRef.current = scrollToEntryId;
    setHighlightedEntryId(scrollToEntryId ?? null);
  }

  // Scroll to target entry when data loads or scrollToEntryId changes
  useEffect(() => {
    if (!scrollToEntryId || !debugMessages) {
      return;
    }

    // Find the matching message (check both id and toolId)
    const targetIndex = debugMessages.findIndex((msg) => {
      const normalized = msg.normalizedData as Record<string, unknown> | null;
      return (
        normalized?.id === scrollToEntryId ||
        normalized?.toolId === scrollToEntryId
      );
    });

    if (targetIndex === -1) return;

    // Wait for render, then scroll
    const frame = requestAnimationFrame(() => {
      scrollTargetRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    // Clear highlight after a few seconds
    const timer = setTimeout(() => {
      setHighlightedEntryId(null);
    }, 3000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [scrollToEntryId, debugMessages]);
  const unloadStep = useTaskMessagesStore((s) => s.unloadStep);

  const reprocessMutation = useMutation({
    mutationFn: () => api.agent.reprocessNormalization(taskId),
    onSuccess: () => {
      // Invalidate the main message stream (Zustand store) so it re-fetches
      // TODO(multi-step): Reprocessing is task-level but unload is step-level.
      // When multi-step workflows are supported, all steps for the task should be unloaded.
      if (stepId) {
        unloadStep(stepId);
      }
      // Refresh the debug pane's own data
      refetch();
    },
  });

  const compactMutation = useMutation({
    mutationFn: () => api.agent.compactRawMessages(taskId),
    onSuccess: () => {
      refetch();
    },
  });

  const { width, setWidth, minWidth, maxWidth } = useDebugMessagesPaneWidth();

  const { isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: width,
    minWidth,
    maxWidth,
    maxWidthFraction: 0.7,
    direction: 'left',
    onWidthChange: setWidth,
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredMessages = debugMessages?.filter((msg) => {
    if (!searchFilter) return true;
    const lower = searchFilter.toLowerCase();
    const rawStr = msg.rawData ? JSON.stringify(msg.rawData).toLowerCase() : '';
    const normStr = msg.normalizedData
      ? JSON.stringify(msg.normalizedData).toLowerCase()
      : '';
    return rawStr.includes(lower) || normStr.includes(lower);
  });

  return (
    <div
      style={{ width }}
      className="panel-edge-shadow bg-bg-0 relative flex h-full flex-col"
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'hover:bg-acc/50 absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize transition-colors',
          isDragging && 'bg-acc/50',
        )}
      />
      {/* Header */}
      <div
        className={clsx(
          'flex shrink-0 items-center justify-between px-4 py-2',
          TASK_PANEL_HEADER_HEIGHT_CLS,
        )}
      >
        <h3 className="text-ink-1 text-sm font-medium">
          Raw vs Normalized
          {debugMessages && (
            <span className="text-ink-3 ml-1.5">({debugMessages.length})</span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          <IconButton
            onClick={() => compactMutation.mutate()}
            disabled={compactMutation.isPending}
            size="sm"
            icon={
              <FolderArchive
                className={clsx(compactMutation.isPending && 'animate-pulse')}
              />
            }
            tooltip="Compact raw messages"
            className={clsx(compactMutation.isPending && 'text-acc-ink')}
          />
          <IconButton
            onClick={() => reprocessMutation.mutate()}
            disabled={reprocessMutation.isPending}
            size="sm"
            icon={
              <RotateCcw
                className={clsx(reprocessMutation.isPending && 'animate-spin')}
              />
            }
            tooltip="Reprocess normalization from raw data"
            className={clsx(reprocessMutation.isPending && 'text-status-run')}
          />
          <IconButton
            onClick={handleRefresh}
            size="sm"
            icon={<RefreshCw />}
            tooltip="Refresh"
          />
          <IconButton
            onClick={onClose}
            size="sm"
            icon={<X />}
            tooltip="Close"
          />
        </div>
      </div>
      <Separator />

      {/* Search filter */}
      <div className="shrink-0 px-4 py-2">
        <Input
          size="sm"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter across raw & normalized..."
        />
      </div>

      <Separator />

      {/* Legend + Copy All buttons */}
      <div className="flex shrink-0 items-center gap-3 px-4 py-1.5">
        <span className="text-ink-3 flex items-center gap-1.5 text-[10px]">
          <span className="bg-acc inline-block h-2 w-2 rounded-full" />
          Raw (SDK)
        </span>
        <span className="text-ink-3 flex items-center gap-1.5 text-[10px]">
          <span className="bg-status-done inline-block h-2 w-2 rounded-full" />
          Normalized
        </span>
        {reprocessMutation.isSuccess && (
          <span className="text-status-done text-[10px]">
            ✓ Reprocessed {reprocessMutation.data} messages
          </span>
        )}
        {compactMutation.isSuccess && (
          <span className="text-acc-ink text-[10px]">
            ✓ Raw messages compacted
          </span>
        )}
        {reprocessMutation.isError && (
          <span className="text-status-fail text-[10px]">
            Reprocess failed: {(reprocessMutation.error as Error).message}
          </span>
        )}
        {compactMutation.isError && (
          <span className="text-status-fail text-[10px]">
            Compaction failed: {(compactMutation.error as Error).message}
          </span>
        )}
        {debugMessages && debugMessages.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <CopyJsonButton
              value={() => debugMessages.map((m) => m.rawData).filter(Boolean)}
              label="Copy All Raw"
            />
            <CopyJsonButton
              value={() =>
                debugMessages.map((m) => m.normalizedData).filter(Boolean)
              }
              label="Copy All Normalized"
            />
          </div>
        )}
      </div>
      <Separator />

      {/* Content */}
      <div className="flex-1 space-y-2 overflow-auto p-3">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-ink-3 h-5 w-5 animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-status-fail bg-status-fail/20 rounded-md p-3 text-xs">
            Failed to load messages: {error.message}
          </div>
        )}

        {!isLoading && filteredMessages && filteredMessages.length === 0 && (
          <p className="text-ink-4 py-4 text-center text-xs">
            {searchFilter
              ? 'No messages match the filter.'
              : 'No messages found.'}
          </p>
        )}

        {filteredMessages?.map((msg, index) => {
          const normalized = msg.normalizedData as Record<
            string,
            unknown
          > | null;
          const isTarget =
            !!highlightedEntryId &&
            (normalized?.id === highlightedEntryId ||
              normalized?.toolId === highlightedEntryId);
          return (
            <DebugMessageCard
              key={`${msg.messageIndex}-${index}`}
              message={msg}
              isHighlighted={isTarget}
              defaultExpanded={isTarget}
              cardRef={isTarget ? scrollTargetRef : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
