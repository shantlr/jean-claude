import { Sparkles, Wrench, X, Zap } from 'lucide-react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { changelog, type ChangelogEntry, changelogHash } from '@/lib/changelog';
import { Modal } from '@/common/ui/modal';
import { useChangelogStore } from '@/stores/changelog';


const DAYS_PER_PAGE = 10;

type ChangelogFilter = 'all' | ChangelogEntry['type'];

const filterLabels: Record<ChangelogFilter, string> = {
  all: 'All',
  feature: 'New',
  improvement: 'Improvements',
  fix: 'Fixes',
};

const typeMeta = {
  feature: {
    label: 'New',
    Icon: Sparkles,
    dot: 'bg-blue-300',
    chip: 'bg-blue-400/10 text-blue-200',
  },
  improvement: {
    label: 'Improvement',
    Icon: Zap,
    dot: 'bg-emerald-300',
    chip: 'bg-emerald-400/10 text-emerald-200',
  },
  fix: {
    label: 'Fix',
    Icon: Wrench,
    dot: 'bg-amber-300',
    chip: 'bg-amber-400/10 text-amber-200',
  },
} as const;

function formatScope(scope: string) {
  return scope
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function formatShortDate(label: string) {
  return label.replace(/, \d{4}$/, '');
}

function filterDay(day: (typeof changelog)[number], filter: ChangelogFilter) {
  if (filter === 'all') return day;
  const entries = day.entries.filter((entry) => entry.type === filter);
  return entries.length > 0 ? { ...day, entries } : null;
}

function FilterRow({
  value,
  counts,
  onChange,
}: {
  value: ChangelogFilter;
  counts: Record<ChangelogFilter, number>;
  onChange: (value: ChangelogFilter) => void;
}) {
  const filters: ChangelogFilter[] = ['all', 'feature', 'improvement', 'fix'];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {filters.map((filter) => {
        const active = value === filter;
        const meta = filter === 'all' ? null : typeMeta[filter];
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(filter)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              active
                ? 'text-ink-0 border-white/10 bg-white/[0.055]'
                : 'text-ink-2 hover:text-ink-1 border-transparent hover:bg-white/[0.035]'
            }`}
          >
            {meta && (
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            )}
            <span>{filterLabels[filter]}</span>
            <span className="text-ink-4 tabular-nums">{counts[filter]}</span>
          </button>
        );
      })}
    </div>
  );
}

function TypeChip({ type }: { type: ChangelogEntry['type'] }) {
  const meta = typeMeta[type];
  const Icon = meta.Icon;
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] ${meta.chip}`}
      aria-label={meta.label}
    >
      <Icon className="h-3 w-3" aria-hidden />
    </span>
  );
}

function EmptyState({ filter }: { filter: ChangelogFilter }) {
  const label =
    filter === 'all' ? 'changes' : filterLabels[filter].toLowerCase();

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <div className="border-glass-border text-ink-3 flex h-9 w-9 items-center justify-center rounded-full border border-dashed">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      </div>
      <div className="text-ink-1 text-sm font-medium">You're caught up</div>
      <div className="text-ink-3 max-w-72 text-xs leading-5">
        No {label} to show. Try a different filter, or check back after the next
        release.
      </div>
    </div>
  );
}

export function ChangelogModal() {
  const lastSeenHash = useChangelogStore((s) => s.lastSeenHash);
  const isOpen = useChangelogStore((s) => s.isOpen);
  const open = useChangelogStore((s) => s.open);
  const close = useChangelogStore((s) => s.close);
  const markSeen = useChangelogStore((s) => s.markSeen);
  const [daysShown, setDaysShown] = useState(DAYS_PER_PAGE);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [filter, setFilter] = useState<ChangelogFilter>('all');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const counts = useMemo(() => {
    const next: Record<ChangelogFilter, number> = {
      all: 0,
      feature: 0,
      improvement: 0,
      fix: 0,
    };

    for (const day of changelog) {
      for (const entry of day.entries) {
        next[entry.type] += entry.bullets.length;
        next.all += entry.bullets.length;
      }
    }

    return next;
  }, []);

  const filteredDays = useMemo(
    () =>
      changelog
        .map((day) => filterDay(day, filter))
        .filter((day) => day !== null),
    [filter],
  );
  const visibleDays = useMemo(
    () => filteredDays.slice(0, daysShown),
    [daysShown, filteredDays],
  );
  const hasMore = filteredDays.length > daysShown;

  // Auto-open on startup if hash changed
  useEffect(() => {
    const hasChanges = lastSeenHash !== changelogHash && changelog.length > 0;
    if (hasChanges) {
      open();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    startTransition(() => setDaysShown(DAYS_PER_PAGE));
    startTransition(() => setActiveDate(filteredDays[0]?.date ?? null));
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [filter, filteredDays, isOpen]);

  // Infinite scroll: load more when sentinel visible.
  useEffect(() => {
    if (!isOpen || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDaysShown((n) => Math.min(n + DAYS_PER_PAGE, filteredDays.length));
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredDays.length, hasMore, isOpen]);

  // Track closest day marker for sidebar highlight.
  useEffect(() => {
    if (!isOpen) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let bestDate = visibleDays[0]?.date ?? null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const day of visibleDays) {
        const el = dayRefs.current.get(day.date);
        if (!el) continue;
        const top = el.getBoundingClientRect().top - containerTop;
        const distance = Math.abs(top - 40);
        if (top <= 72 && distance < bestDistance) {
          bestDate = day.date;
          bestDistance = distance;
        }
      }

      setActiveDate(bestDate);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isOpen, visibleDays]);

  const handleClose = () => {
    close();
    markSeen(changelogHash);
    setDaysShown(DAYS_PER_PAGE);
    setActiveDate(null);
    setFilter('all');
  };

  const scrollToDate = useCallback((date: string) => {
    const el = dayRefs.current.get(date);
    const container = scrollContainerRef.current;
    if (!el || !container) return;
    container.scrollTo({
      top: Math.max(0, el.offsetTop - 8),
      behavior: 'smooth',
    });
  }, []);

  const setDayRef = useCallback(
    (date: string) => (el: HTMLDivElement | null) => {
      if (el) {
        dayRefs.current.set(date, el);
      } else {
        dayRefs.current.delete(date);
      }
    },
    [],
  );

  if (!isOpen || changelog.length === 0) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="xl"
      showHeader={false}
      panelClassName="!max-w-[920px] overflow-hidden border border-white/[0.07] bg-[#1b1a22] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
      contentClassName="min-h-0 overflow-hidden p-0"
    >
      <div className="flex h-[min(620px,78vh)] flex-col overflow-hidden">
        <header className="border-glass-border flex items-center justify-between gap-3 border-b px-[18px] py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h2 className="text-ink-0 text-[13.5px] font-semibold">
              Changelog
            </h2>
            <span className="text-ink-4 text-xs">·</span>
            <FilterRow value={filter} counts={counts} onChange={setFilter} />
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="text-ink-2 hover:text-ink-0 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/[0.06]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="border-glass-border hidden w-[168px] shrink-0 flex-col gap-px overflow-y-auto border-r px-3 py-3 sm:flex">
            <div className="text-ink-4 px-2 pt-1 pb-2 text-[10px] font-semibold tracking-[0.1em] uppercase">
              Releases
            </div>
            {filteredDays.map((day, index) => {
              const active = day.date === activeDate;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => {
                    if (index >= daysShown) {
                      setDaysShown(index + DAYS_PER_PAGE);
                      requestAnimationFrame(() => scrollToDate(day.date));
                    } else {
                      scrollToDate(day.date);
                    }
                  }}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                    active ? 'bg-white/[0.055]' : 'hover:bg-white/[0.035]'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      index === 0
                        ? 'bg-blue-300'
                        : active
                          ? 'bg-ink-1'
                          : 'bg-ink-4'
                    }`}
                  />
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-xs ${
                        active
                          ? 'text-ink-0 font-semibold'
                          : 'text-ink-1 font-medium'
                      }`}
                    >
                      {formatShortDate(day.label)}
                    </span>
                    <span className="text-ink-4 block font-mono text-[10px]">
                      {day.date}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div
            ref={scrollContainerRef}
            className="min-w-0 flex-1 overflow-y-auto px-[18px] pb-2"
          >
            {visibleDays.length === 0 && <EmptyState filter={filter} />}

            {visibleDays.map((day, dayIndex) => (
              <section
                key={day.date}
                ref={setDayRef(day.date)}
                className="relative pl-7"
                data-date={day.date}
              >
                <div
                  className="absolute top-[22px] bottom-0 left-[7px] w-px"
                  style={{
                    backgroundImage:
                      'linear-gradient(to bottom, rgb(255 255 255 / 0.1) 50%, transparent 0%)',
                    backgroundRepeat: 'repeat-y',
                    backgroundSize: '1px 6px',
                  }}
                />

                <div className="sticky -top-px z-10 -mr-[18px] -ml-[46px] flex items-center bg-gradient-to-b from-[#1b1a22] from-75% to-[#1b1a22]/0 pt-[15px] pb-2 pl-[18px]">
                  <div className="flex h-[15px] w-[15px] items-center justify-center rounded-full border border-white/15 bg-[#1b1a22]">
                    <div
                      className={`h-[5px] w-[5px] rounded-full ${
                        dayIndex === 0 ? 'bg-blue-300' : 'bg-ink-3'
                      }`}
                    />
                  </div>
                  <div className="ml-3.5 flex min-w-0 flex-wrap items-baseline gap-2.5">
                    <h3 className="text-ink-0 text-[13.5px] font-semibold">
                      {day.label}
                    </h3>
                    <span className="border-glass-border text-ink-3 rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10.5px]">
                      {day.date}
                    </span>
                    {dayIndex === 0 && (
                      <span className="text-[10px] font-medium tracking-[0.06em] text-blue-200 uppercase">
                        Latest
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col pb-3">
                  {day.entries.map((entry) => (
                    <div
                      key={`${entry.scope}-${entry.type}-${entry.bullets.join('|')}`}
                      className="grid grid-cols-[20px_minmax(76px,110px)_1fr] items-start gap-x-3 border-t border-white/[0.03] py-2 first:border-t-0"
                    >
                      <TypeChip type={entry.type} />
                      <div className="text-ink-3 pt-0.5 text-[11px] tracking-[0.06em] uppercase">
                        {formatScope(entry.scope)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-ink-1 space-y-1 text-[12.5px] leading-5 text-pretty">
                          {entry.bullets.map((bullet) => (
                            <div key={bullet}>{bullet}</div>
                          ))}
                        </div>
                        {entry.commits.length > 0 && (
                          <div className="text-ink-4 mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                            <span>Commits</span>
                            {entry.commits.map((commit) => (
                              <span
                                key={commit}
                                className="rounded border border-white/[0.06] bg-white/[0.035] px-1 py-px"
                              >
                                {commit}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {hasMore && <div ref={sentinelRef} className="h-4" aria-hidden />}
          </div>
        </div>
      </div>
    </Modal>
  );
}
