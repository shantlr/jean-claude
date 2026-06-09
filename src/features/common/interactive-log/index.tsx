import clsx from 'clsx';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
} from 'react';

import { api } from '@/lib/api';

import { AnsiLine } from './ansi-line';
import { keyEventToTerminalInput } from './key-event-to-terminal-input';

const TERMINAL_FONT_FAMILY =
  'var(--font-mono), "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols", "Noto Sans Symbols 2", sans-serif';

/**
 * Interactive terminal log viewer with ANSI color rendering, auto-scroll,
 * and optional keyboard input forwarding.
 *
 * Used by both the task panel's command logs pane and the running commands overlay.
 */
export function InteractiveLog({
  lines,
  taskId,
  runCommandId,
  isRunning,
  ignoredKeys,
  stopKeyPropagation = false,
  emptyText = 'Waiting for output...',
  className,
}: {
  lines: readonly {
    line: string;
    stream: 'stdout' | 'stderr';
    timestamp: number;
  }[];
  taskId: string;
  runCommandId: string;
  isRunning: boolean;
  /** Keys to skip forwarding to PTY (let parent handle). */
  ignoredKeys?: ReadonlySet<string>;
  /** Whether to call stopPropagation on forwarded key events. */
  stopKeyPropagation?: boolean;
  emptyText?: string;
  /** Additional className for the outer container. */
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "at bottom" if within 32px of the bottom
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  }, []);

  // Auto-scroll to bottom when new log lines arrive (if user was at bottom)
  const lineCount = lines.length;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lineCount, runCommandId]);

  // Forward raw keystrokes to the process when the log area is focused.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isRunning) return;
      if (ignoredKeys?.has(e.key)) return;

      const input = keyEventToTerminalInput(e);
      if (input === null) return;

      if (stopKeyPropagation) e.stopPropagation();
      e.preventDefault();

      api.runCommands.sendInput({ taskId, runCommandId, input });
    },
    [taskId, runCommandId, isRunning, ignoredKeys, stopKeyPropagation],
  );

  const focusLog = useCallback(() => {
    scrollRef.current?.focus();
  }, []);

  // Auto-focus the log area when a running command becomes active
  useEffect(() => {
    if (isRunning && scrollRef.current) {
      scrollRef.current.focus();
    }
  }, [runCommandId, isRunning]);

  return (
    <div className={clsx('flex min-h-0 flex-1 flex-col', className)}>
      <div
        ref={scrollRef}
        tabIndex={0}
        onScroll={handleScroll}
        onClick={focusLog}
        onKeyDown={handleKeyDown}
        style={{ fontFamily: TERMINAL_FONT_FAMILY }}
        className={clsx(
          'flex-1 overflow-auto px-3 py-2 text-xs leading-relaxed focus:outline-none',
          isRunning && 'cursor-text',
        )}
      >
        {lines.length === 0 ? (
          <p className="text-ink-4">{emptyText}</p>
        ) : (
          lines.map((entry, index) => (
            <div
              key={`${entry.timestamp}-${index}`}
              className={clsx(
                '-mx-1 border-l-2 px-2 break-words whitespace-pre-wrap transition-colors hover:bg-white/[0.03]',
                entry.stream === 'stderr'
                  ? 'border-status-fail/70 text-status-fail hover:bg-status-fail/5'
                  : 'text-ink-1 border-ink-4/25 hover:border-ink-3/60',
              )}
            >
              <AnsiLine line={entry.line} />
            </div>
          ))
        )}
      </div>

      {isRunning && (
        <div className="border-glass-border text-ink-3 border-t px-3 py-1 text-center text-xs">
          Terminal input active — keystrokes are forwarded to the process
        </div>
      )}
    </div>
  );
}
