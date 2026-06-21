import { memo, startTransition, useEffect, useMemo, useState } from 'react';

import { ensureUtc } from '@/lib/time';

function formatElapsedTime(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getStartMs(date: string | undefined): number | null {
  if (!date) return null;

  const startMs = Date.parse(ensureUtc(date));
  return Number.isNaN(startMs) ? null : startMs;
}

export const RunningTimer = memo(function RunningTimer({
  startDate,
  className,
}: {
  startDate: string | undefined;
  className?: string;
}) {
  const startMs = useMemo(() => getStartMs(startDate), [startDate]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (startMs === null) return;

    startTransition(() => setNowMs(Date.now()));

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [startMs]);

  if (startMs === null) return null;

  return (
    <span className={className}>{formatElapsedTime(nowMs - startMs)}</span>
  );
});
