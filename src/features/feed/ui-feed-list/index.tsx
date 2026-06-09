import { useNavigate, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  GitPullRequest,
  GripVertical,
  ListTodo,
  Loader2,
  MessageSquare,
  Plus,
  Settings2,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useCommands } from '@/common/hooks/use-commands';
import { Dropdown, DropdownDivider, DropdownItem } from '@/common/ui/dropdown';
import { Modal } from '@/common/ui/modal';
import { ProjectLogo } from '@/features/project/ui-project-logo';
import { useFeed } from '@/hooks/use-feed';
import { useProjects } from '@/hooks/use-projects';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useFeedStore } from '@/stores/feed';
import { useNavigationStore } from '@/stores/navigation';
import { useOverlaysStore } from '@/stores/overlays';
import { useUIStore } from '@/stores/ui';
import type { FeedItem } from '@shared/feed-types';

import { FeedItemCard } from './feed-item-card';
import { FeedNoteCard } from './feed-note-card';

type PrReviewContextMenuState = {
  item: FeedItem;
  x: number;
  y: number;
} | null;

type PrProjectOrderOption = {
  id: string;
  name: string;
  color: string;
  logoPath?: string | null | undefined;
  prCount: number;
};

function MiniProjectLabel({ item }: { item: FeedItem }) {
  if (item.projectLogoPath) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <ProjectLogo
          project={{
            name: item.projectName,
            color: item.projectColor,
            logoPath: item.projectLogoPath,
          }}
          size="xs"
        />
        <span className="text-ink-2 truncate text-[10.5px]">
          {item.projectName}
        </span>
      </span>
    );
  }

  return (
    <span className="text-ink-2 truncate text-[10.5px]">
      {item.projectName}
    </span>
  );
}

function useClampedContextMenuPosition(x: number, y: number) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  return { menuRef, pos };
}

function PrReviewContextMenu({
  state,
  onClose,
  onMarkLowPriority,
}: {
  state: NonNullable<PrReviewContextMenuState>;
  onClose: () => void;
  onMarkLowPriority: (item: FeedItem) => void;
}) {
  const { menuRef, pos } = useClampedContextMenuPosition(state.x, state.y);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [menuRef, onClose]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [menuRef]);

  return createPortal(
    <div
      ref={menuRef}
      className="border-glass-border bg-bg-1 fixed z-50 min-w-48 rounded-md border py-1 shadow-lg"
      style={{ top: pos.y, left: pos.x }}
      role="menu"
      aria-label="Pull request actions"
    >
      <button
        role="menuitem"
        tabIndex={-1}
        onClick={() => {
          onMarkLowPriority(state.item);
          onClose();
        }}
        className="text-ink-1 hover:bg-glass-medium focus:bg-glass-medium flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors focus:outline-none"
      >
        <ChevronsDown className="h-3.5 w-3.5 shrink-0" />
        Mark as very low priority
      </button>
    </div>,
    document.body,
  );
}

function FeedCard({
  item,
  ...props
}: {
  item: FeedItem;
  isSelected?: boolean;
  isDraggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  if (item.source === 'note') {
    return <FeedNoteCard item={item} {...props} />;
  }
  return <FeedItemCard item={item} {...props} />;
}

function StackableZone({
  items,
  isItemSelected,
  onDragStart,
  onDragEnd,
  sticky,
  collapsedOverlap = 28,
}: {
  items: FeedItem[];
  isItemSelected: (item: FeedItem) => boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  sticky?: boolean;
  /** Pixel amount stacked cards overlap when collapsed (default 28 ≈ Tailwind mt-7). */
  collapsedOverlap?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleEnter = useCallback(() => {
    clearTimeout(collapseTimer.current);
    setExpanded(true);
  }, []);

  const handleLeave = useCallback(() => {
    collapseTimer.current = setTimeout(() => setExpanded(false), 300);
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(collapseTimer.current);
    };
  }, []);

  return (
    <div
      className={clsx(
        'flex flex-col py-0.5',
        sticky && 'bg-bg-0/95 sticky top-0 z-30 backdrop-blur-sm',
      )}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          className="bg-bg-0 relative transition-[margin] duration-200 ease-out"
          style={{
            zIndex: index + 1,
            marginTop:
              index > 0 ? (expanded ? 6 : -collapsedOverlap) : undefined,
          }}
        >
          <FeedCard
            item={item}
            isSelected={isItemSelected(item)}
            isDraggable
            onDragStart={() => onDragStart(item.id)}
            onDragEnd={onDragEnd}
          />
        </div>
      ))}
    </div>
  );
}

function PrProjectOrderModal({
  projects,
  onClose,
  onMoveProject,
}: {
  projects: PrProjectOrderOption[];
  onClose: () => void;
  onMoveProject: (
    fromProjectId: string,
    toProjectId: string,
    placement: 'before' | 'after',
  ) => void;
}) {
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(
    null,
  );

  const handleDrop = useCallback(
    (event: React.DragEvent, targetProjectId: string) => {
      event.preventDefault();
      if (draggedProjectId && draggedProjectId !== targetProjectId) {
        const rect = event.currentTarget.getBoundingClientRect();
        const placement =
          event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        onMoveProject(draggedProjectId, targetProjectId, placement);
      }
      setDraggedProjectId(null);
      setDragOverProjectId(null);
    },
    [draggedProjectId, onMoveProject],
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="PR project priority"
      showHeader={false}
      contentClassName="p-0"
      panelClassName="border border-line-soft overflow-hidden rounded-2xl bg-bg-0 shadow-2xl shadow-black/35"
    >
      <div className="from-status-pr/14 border-line-soft border-b bg-gradient-to-br to-transparent px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="border-status-pr/25 bg-status-pr/10 text-status-pr flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border">
            <Settings2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="pr-project-order-title"
              className="text-ink-0 text-sm font-semibold"
            >
              PR project priority
            </h2>
            <p className="text-ink-2 mt-1 text-xs leading-relaxed">
              Drag projects into review priority. Top projects appear first in
              PR carousel.
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-[55vh] space-y-2 overflow-y-auto p-3">
        {projects.map((project, index) => (
          <div
            key={project.id}
            draggable
            onDragStart={() => setDraggedProjectId(project.id)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverProjectId(project.id);
            }}
            onDragLeave={() => setDragOverProjectId(null)}
            onDrop={(event) => handleDrop(event, project.id)}
            onDragEnd={() => {
              setDraggedProjectId(null);
              setDragOverProjectId(null);
            }}
            className={clsx(
              'border-line-soft bg-bg-1 flex cursor-grab items-center gap-3 rounded-xl border px-3 py-2.5 transition-[border-color,background-color,opacity,transform] active:cursor-grabbing',
              draggedProjectId === project.id && 'scale-[0.99] opacity-45',
              dragOverProjectId === project.id &&
                draggedProjectId !== project.id &&
                'border-status-pr bg-status-pr/10',
            )}
          >
            <GripVertical className="text-ink-3 h-4 w-4 shrink-0" />
            <span className="text-ink-3 w-5 text-right font-mono text-[10px]">
              {index + 1}
            </span>
            <ProjectLogo
              project={{
                name: project.name,
                color: project.color,
                logoPath: project.logoPath ?? null,
              }}
              size="sm"
            />
            <span className="text-ink-1 min-w-0 flex-1 truncate text-sm font-medium">
              {project.name}
            </span>
            <span className="text-ink-3 rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px]">
              {project.prCount} PR{project.prCount === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function HorizontalPrReviewStack({
  items,
  isItemSelected,
  onOpen,
  onMarkLowPriority,
}: {
  items: FeedItem[];
  isItemSelected: (item: FeedItem) => boolean;
  onOpen: (item: FeedItem) => void;
  onMarkLowPriority: (item: FeedItem) => void;
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [projectOrderModalOpen, setProjectOrderModalOpen] = useState(false);
  const [contextMenu, setContextMenu] =
    useState<PrReviewContextMenuState>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const prProjectOrder = useUIStore((s) => s.settings.prProjectOrder);
  const setSetting = useUIStore((s) => s.setSetting);
  const { data: allProjects = [] } = useProjects();
  const wheelGesture = useRef<{
    accumulated: number;
    consumed: boolean;
    direction: -1 | 0 | 1;
    lastEventAt: number;
    lastStepAt: number;
    peakAbsDelta: number;
    resetTimer?: ReturnType<typeof setTimeout>;
    sawPostStepDip: boolean;
    troughAbsDelta: number;
  }>({
    accumulated: 0,
    consumed: false,
    direction: 0,
    lastEventAt: 0,
    lastStepAt: 0,
    peakAbsDelta: 0,
    sawPostStepDip: false,
    troughAbsDelta: Number.POSITIVE_INFINITY,
  });

  const maxIndex = items.length - 1;
  const safeIndex = Math.min(focusedIndex, Math.max(0, maxIndex));
  const focusedItem = items[safeIndex];
  const projectOrderIndex = useMemo(
    () => new Map(prProjectOrder.map((projectId, index) => [projectId, index])),
    [prProjectOrder],
  );
  const projectOptions = useMemo(() => {
    const prCountByProjectId = new Map<string, number>();
    for (const item of items) {
      prCountByProjectId.set(
        item.projectId,
        (prCountByProjectId.get(item.projectId) ?? 0) + 1,
      );
    }

    return allProjects
      .filter(
        (project) =>
          project.repoProviderId &&
          project.repoProjectId &&
          project.repoId &&
          project.showPrsInFeed,
      )
      .map((project) => ({
        id: project.id,
        name: project.name,
        color: project.color,
        logoPath: project.logoPath,
        prCount: prCountByProjectId.get(project.id) ?? 0,
      }))
      .sort((a, b) => {
        const order =
          (projectOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (projectOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER);
        if (order !== 0) return order;
        return a.name.localeCompare(b.name);
      });
  }, [allProjects, items, projectOrderIndex]);
  const dotIndexes = useMemo(() => {
    const maxDots = 7;
    if (items.length <= maxDots) {
      return items.map((_, index) => index);
    }

    const halfWindow = Math.floor(maxDots / 2);
    const start = Math.min(
      Math.max(0, safeIndex - halfWindow),
      items.length - maxDots,
    );
    return Array.from({ length: maxDots }, (_, index) => start + index);
  }, [items, safeIndex]);

  const goPrevious = useCallback(() => {
    setFocusedIndex((index) => Math.max(0, index - 1));
  }, []);

  const goNext = useCallback(() => {
    setFocusedIndex((index) => Math.min(maxIndex, index + 1));
  }, [maxIndex]);

  const goFirst = useCallback(() => {
    setFocusedIndex(0);
  }, []);

  const goLast = useCallback(() => {
    setFocusedIndex(maxIndex);
  }, [maxIndex]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, item: FeedItem, index: number) => {
      event.preventDefault();
      event.stopPropagation();
      setFocusedIndex(index);
      setContextMenu({ item, x: event.clientX, y: event.clientY });
    },
    [],
  );

  const handleMoveProject = useCallback(
    (
      fromProjectId: string,
      toProjectId: string,
      placement: 'before' | 'after',
    ) => {
      const visibleProjectIds = projectOptions.map((project) => project.id);
      const fromIndex = visibleProjectIds.indexOf(fromProjectId);
      if (fromIndex === -1 || !visibleProjectIds.includes(toProjectId)) return;

      const nextVisibleProjectIds = [...visibleProjectIds];
      const [movedProjectId] = nextVisibleProjectIds.splice(fromIndex, 1);
      const targetIndex = nextVisibleProjectIds.indexOf(toProjectId);
      if (targetIndex === -1) return;
      nextVisibleProjectIds.splice(
        placement === 'before' ? targetIndex : targetIndex + 1,
        0,
        movedProjectId,
      );

      const visibleProjectIdSet = new Set(nextVisibleProjectIds);
      setSetting('prProjectOrder', [
        ...nextVisibleProjectIds,
        ...prProjectOrder.filter(
          (projectId) => !visibleProjectIdSet.has(projectId),
        ),
      ]);
    },
    [prProjectOrder, projectOptions, setSetting],
  );

  const handleContextMenuKeyDown = useCallback(
    (event: React.KeyboardEvent, item: FeedItem, index: number) => {
      if (
        event.key !== 'ContextMenu' &&
        !(event.shiftKey && event.key === 'F10')
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setFocusedIndex(index);

      const rect = event.currentTarget.getBoundingClientRect();
      setContextMenu({
        item,
        x: rect.left + Math.min(rect.width - 8, 28),
        y: rect.top + Math.min(rect.height - 8, 28),
      });
    },
    [],
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const absDeltaX = Math.abs(event.deltaX);
      if (absDeltaX < 16 || absDeltaX < Math.abs(event.deltaY) * 1.25) return;
      event.preventDefault();

      const direction = event.deltaX > 0 ? 1 : -1;
      const now = performance.now();
      const gesture = wheelGesture.current;
      const isNewGesture =
        gesture.direction !== direction || now - gesture.lastEventAt > 80;

      if (isNewGesture) {
        gesture.accumulated = 0;
        gesture.consumed = false;
        gesture.direction = direction;
        gesture.peakAbsDelta = 0;
        gesture.sawPostStepDip = false;
        gesture.troughAbsDelta = Number.POSITIVE_INFINITY;
      }

      clearTimeout(gesture.resetTimer);
      gesture.resetTimer = setTimeout(() => {
        gesture.accumulated = 0;
        gesture.consumed = false;
        gesture.direction = 0;
        gesture.peakAbsDelta = 0;
        gesture.sawPostStepDip = false;
        gesture.troughAbsDelta = Number.POSITIVE_INFINITY;
      }, 80);

      if (gesture.consumed) {
        gesture.troughAbsDelta = Math.min(gesture.troughAbsDelta, absDeltaX);

        if (absDeltaX <= 14 || absDeltaX <= gesture.peakAbsDelta * 0.7) {
          gesture.sawPostStepDip = true;
        }

        const isNewSwipeImpulse =
          gesture.sawPostStepDip &&
          now - gesture.lastStepAt > 60 &&
          absDeltaX >= 18 &&
          absDeltaX >=
            Math.max(gesture.troughAbsDelta + 8, 1.35 * gesture.troughAbsDelta);

        gesture.lastEventAt = now;

        if (!isNewSwipeImpulse) return;

        gesture.accumulated = 0;
        gesture.consumed = false;
        gesture.peakAbsDelta = 0;
        gesture.sawPostStepDip = false;
        gesture.troughAbsDelta = Number.POSITIVE_INFINITY;
      }

      gesture.accumulated += absDeltaX;
      gesture.peakAbsDelta = Math.max(gesture.peakAbsDelta, absDeltaX);
      gesture.lastEventAt = now;

      if (gesture.accumulated < 48) return;

      gesture.consumed = true;
      gesture.lastStepAt = now;
      gesture.sawPostStepDip = false;
      gesture.troughAbsDelta = Number.POSITIVE_INFINITY;

      if (event.deltaX > 0) {
        goNext();
      } else {
        goPrevious();
      }
    },
    [goNext, goPrevious],
  );

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    carousel.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      carousel.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  useEffect(() => {
    if (focusedIndex > maxIndex) {
      setFocusedIndex(Math.max(0, maxIndex));
    }
  }, [focusedIndex, maxIndex]);

  useEffect(() => {
    const gesture = wheelGesture.current;
    return () => {
      clearTimeout(gesture.resetTimer);
    };
  }, []);

  if (!focusedItem) return null;

  return (
    <section className="bg-bg-0/95 border-status-pr/15 border-b py-2 backdrop-blur-sm">
      <div ref={carouselRef} className="relative h-[128px] overflow-hidden">
        {items.map((item, index) => (
          <PrReviewCarouselCard
            key={item.id}
            item={item}
            position={index - safeIndex}
            isSelected={isItemSelected(item)}
            onFocus={() => setFocusedIndex(index)}
            onOpen={() => onOpen(item)}
            onContextMenu={(event) => handleContextMenu(event, item, index)}
            onKeyDown={(event) => handleContextMenuKeyDown(event, item, index)}
          />
        ))}
      </div>
      <div className="mt-0.5 flex items-center gap-2 px-3">
        <button
          type="button"
          onClick={goFirst}
          disabled={safeIndex === 0}
          className="border-line-soft text-ink-2 hover:bg-glass-light disabled:text-ink-4 flex h-5 w-5 items-center justify-center rounded border transition-colors disabled:opacity-40"
          aria-label="First PR to review"
        >
          <ChevronsLeft className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={goPrevious}
          disabled={safeIndex === 0}
          className="border-line-soft text-ink-2 hover:bg-glass-light disabled:text-ink-4 flex h-5 w-5 items-center justify-center rounded border transition-colors disabled:opacity-40"
          aria-label="Previous PR to review"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden">
          {dotIndexes.map((index) => {
            const item = items[index];
            const isFocused = index === safeIndex;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFocusedIndex(index)}
                className={clsx(
                  'h-1.5 rounded-full transition-[width,background-color,opacity]',
                  isFocused
                    ? 'bg-status-pr w-4 opacity-100'
                    : 'bg-ink-4 w-1.5 opacity-50',
                )}
                aria-label={`Focus PR ${index + 1}`}
              />
            );
          })}
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={safeIndex === maxIndex}
          className="border-line-soft text-ink-2 hover:bg-glass-light disabled:text-ink-4 flex h-5 w-5 items-center justify-center rounded border transition-colors disabled:opacity-40"
          aria-label="Next PR to review"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={goLast}
          disabled={safeIndex === maxIndex}
          className="border-line-soft text-ink-2 hover:bg-glass-light disabled:text-ink-4 flex h-5 w-5 items-center justify-center rounded border transition-colors disabled:opacity-40"
          aria-label="Last PR to review"
        >
          <ChevronsRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setProjectOrderModalOpen(true)}
          className="border-line-soft text-ink-2 hover:bg-glass-light hover:text-ink-1 ml-1 flex h-5 w-5 items-center justify-center rounded border transition-colors"
          aria-label="Configure PR project priority"
        >
          <Settings2 className="h-3 w-3" />
        </button>
      </div>
      <div className="text-ink-3 mt-1 flex items-center gap-1.5 px-3 font-mono text-[9.5px]">
        <span>
          {safeIndex + 1} / {items.length}
        </span>
        <span className="opacity-40">·</span>
        <MiniProjectLabel item={focusedItem} />
      </div>
      {contextMenu && (
        <PrReviewContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onMarkLowPriority={onMarkLowPriority}
        />
      )}
      {projectOrderModalOpen && (
        <PrProjectOrderModal
          projects={projectOptions}
          onClose={() => setProjectOrderModalOpen(false)}
          onMoveProject={handleMoveProject}
        />
      )}
    </section>
  );
}

function PrReviewCarouselCard({
  item,
  position,
  isSelected,
  onFocus,
  onOpen,
  onContextMenu,
  onKeyDown,
}: {
  item: FeedItem;
  position: number;
  isSelected: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const isCenter = position === 0;
  const isVisible = Math.abs(position) <= 2;
  const layout =
    position === 0
      ? { translateX: '0%', scale: 1, opacity: 1, zIndex: 6 }
      : position === 1
        ? { translateX: '54%', scale: 0.86, opacity: 0.58, zIndex: 4 }
        : position === -1
          ? { translateX: '-54%', scale: 0.86, opacity: 0.58, zIndex: 4 }
          : position === 2
            ? { translateX: '75%', scale: 0.74, opacity: 0.25, zIndex: 2 }
            : position === -2
              ? { translateX: '-75%', scale: 0.74, opacity: 0.25, zIndex: 2 }
              : { translateX: '0%', scale: 0.7, opacity: 0, zIndex: 1 };

  const stateLabel = item.hasNewActivity ? 'UPDATED' : 'REVIEW';
  const isHighPriority = item.projectPriority === 'high';
  const accent = isHighPriority
    ? 'var(--color-status-fail)'
    : 'var(--color-status-pr)';

  if (!isVisible) return null;

  return (
    <div
      className={clsx(
        'absolute top-0 left-1/2 w-[clamp(220px,85%,320px)] transition-[transform,opacity] duration-300 ease-out',
      )}
      style={{
        transform: `translate(-50%, 0) translateX(${layout.translateX}) scale(${layout.scale})`,
        transformOrigin: 'center top',
        opacity: layout.opacity,
        zIndex: layout.zIndex,
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (isCenter) {
            onOpen();
          } else {
            onFocus();
          }
        }}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        className={clsx(
          'bg-bg-1 border-line-soft block w-full cursor-pointer rounded-md border py-2.5 pr-2.5 pl-3 text-left shadow-lg transition-[box-shadow] duration-300 ease-out',
          isSelected && 'ring-acc/60 ring-1',
        )}
        style={{
          borderLeft: `2px solid ${accent}`,
          boxShadow: isCenter
            ? '0 12px 30px -14px oklch(0 0 0 / 0.75), inset 0 0 0 1px oklch(1 0 0 / 0.03)'
            : undefined,
        }}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="bg-status-pr/15 text-status-pr inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide">
            <span className="bg-status-pr h-1.5 w-1.5 rounded-full" />
            {stateLabel}
          </span>
          <span className="text-ink-3 ml-auto max-w-[76px] truncate font-mono text-[9.5px]">
            {item.subtitle ?? item.ownerName ?? ''}
          </span>
        </div>
        <div className="text-ink-0 mb-2 truncate text-[12.5px] leading-snug font-medium">
          {item.title}
        </div>
        <div className="mb-2 flex items-center gap-1.5">
          <MiniProjectLabel item={item} />
          <span className="text-status-pr bg-status-pr/10 border-status-pr/25 ml-auto inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0 font-mono text-[9.5px]">
            <GitPullRequest className="h-2.5 w-2.5" />#{item.pullRequestId}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-ink-3 min-w-0 flex-1 truncate text-[10.5px]">
            {item.hasNewActivity
              ? 'New activity since last view'
              : (item.unresolvedCommentCount ?? 0) > 0
                ? 'Threads need a look'
                : 'Waiting for your review'}
          </span>
          {(item.unresolvedCommentCount ?? 0) > 0 && (
            <span className="text-status-pr flex items-center gap-0.5 font-mono text-[9.5px]">
              <MessageSquare className="h-3 w-3" />
              {item.unresolvedCommentCount}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

export function FeedList() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentTaskId = params.taskId as string | undefined;
  const currentPrId = params.prId as string | undefined;
  const currentProjectId = params.projectId as string | undefined;
  const currentWorkItemId = params.workItemId as string | undefined;

  const {
    pinnedItems,
    actionNeededItems,
    prReviewItems,
    activeTaskItems,
    highPriorityItems,
    normalItems,
    lowPriorityItems,
    allVisibleItems,
    projectOptions,
    hiddenProjectIds,
    filteredOutCount,
    isLoading,
  } = useFeed();
  const reorderPinned = useFeedStore((s) => s.reorderPinned);
  const pinned = useFeedStore((s) => s.pinned);
  const openOverlay = useOverlaysStore((s) => s.open);
  const runningTaskCreationCount = useBackgroundJobsStore(
    (state) =>
      state.jobs.filter(
        (job) => job.type === 'task-creation' && job.status === 'running',
      ).length,
  );
  const runningVerificationNoteCount = useBackgroundJobsStore(
    (state) =>
      state.jobs.filter(
        (job) => job.type === 'verification-note' && job.status === 'running',
      ).length,
  );
  const pin = useFeedStore((s) => s.pin);
  const unpin = useFeedStore((s) => s.unpin);
  const dismiss = useFeedStore((s) => s.dismiss);
  const markLowPriority = useFeedStore((s) => s.markLowPriority);
  const toggleLowPriority = useFeedStore((s) => s.toggleLowPriority);
  const toggleProjectHidden = useFeedStore((s) => s.toggleProjectHidden);
  const clearHiddenProjects = useFeedStore((s) => s.clearHiddenProjects);
  const setLastLocation = useNavigationStore((s) => s.setLastLocation);
  const hiddenProjectIdSet = useMemo(
    () => new Set(hiddenProjectIds),
    [hiddenProjectIds],
  );
  const pinnedIdSet = useMemo(
    () => new Set(pinned.map((item) => item.id)),
    [pinned],
  );
  const hasUnpinnedItems =
    actionNeededItems.length > 0 ||
    prReviewItems.length > 0 ||
    activeTaskItems.length > 0 ||
    highPriorityItems.length > 0 ||
    normalItems.length > 0 ||
    lowPriorityItems.length > 0;

  const [lowPriorityExpanded, setLowPriorityExpanded] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [_dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPinZone, setDragOverPinZone] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLastLocation({ type: 'all', taskId: currentTaskId ?? null });
  }, [currentTaskId, setLastLocation]);

  // --- Drag handlers for pinned zone items ---
  const handlePinnedDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handlePinnedDragOver = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      setDragOverId(targetId);
    },
    [],
  );

  const handlePinnedDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (!draggedId || draggedId === targetId) {
        setDragOverId(null);
        setDraggedId(null);
        return;
      }

      const currentOrder = pinnedItems.map((item) => item.id);

      // If dragged item is not yet pinned, pin it first
      if (!currentOrder.includes(draggedId)) {
        pin(draggedId);
        const targetIdx = currentOrder.indexOf(targetId);
        currentOrder.splice(targetIdx, 0, draggedId);
        reorderPinned(currentOrder);
      } else {
        // Reorder within pinned zone
        const fromIdx = currentOrder.indexOf(draggedId);
        const toIdx = currentOrder.indexOf(targetId);
        currentOrder.splice(fromIdx, 1);
        currentOrder.splice(toIdx, 0, draggedId);
        reorderPinned(currentOrder);
      }

      setDragOverId(null);
      setDraggedId(null);
    },
    [draggedId, pinnedItems, pin, reorderPinned],
  );

  // --- Drag handlers for the pinned zone container ---
  const handlePinZoneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPinZone(true);
  }, []);

  const handlePinZoneDragLeave = useCallback(() => {
    setDragOverPinZone(false);
  }, []);

  const handlePinZoneDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedId) {
        pin(draggedId);
      }
      setDragOverPinZone(false);
      setDraggedId(null);
    },
    [draggedId, pin],
  );

  // --- Shared drag end handler ---
  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
    setDragOverPinZone(false);
  }, []);

  const currentNoteId = params.noteId as string | undefined;

  const isItemSelected = useCallback(
    (item: {
      taskId?: string;
      pullRequestId?: number;
      workItemId?: number;
      noteId?: string;
      projectId: string;
    }) => {
      if (item.noteId && currentNoteId) {
        return item.noteId === currentNoteId;
      }
      if (item.taskId) {
        return item.taskId === currentTaskId;
      }
      if (item.workItemId && currentWorkItemId) {
        return (
          String(item.workItemId) === currentWorkItemId &&
          item.projectId === (currentProjectId ?? item.projectId)
        );
      }
      if (!item.pullRequestId || !currentPrId) {
        return false;
      }
      const prMatches = String(item.pullRequestId) === currentPrId;
      if (!prMatches) {
        return false;
      }
      if (!currentProjectId) {
        return true;
      }
      return item.projectId === currentProjectId;
    },
    [
      currentNoteId,
      currentPrId,
      currentProjectId,
      currentTaskId,
      currentWorkItemId,
    ],
  );

  const navigateToItem = useCallback(
    (index: number) => {
      const item = allVisibleItems[index];
      if (!item) return;
      if (item.source === 'note' && item.noteId) {
        navigate({
          to: '/all/notes/$noteId',
          params: { noteId: item.noteId },
        });
      } else if (item.source === 'work-item' && item.workItemId) {
        navigate({
          to: '/all/work-items/$projectId/$workItemId',
          params: {
            projectId: item.projectId,
            workItemId: String(item.workItemId),
          },
        });
      } else if (item.source === 'pull-request' && item.pullRequestId) {
        navigate({
          to: '/all/prs/$projectId/$prId',
          params: {
            projectId: item.projectId,
            prId: String(item.pullRequestId),
          },
        });
      } else if (item.taskId) {
        navigate({
          to: '/all/$taskId',
          params: { taskId: item.taskId },
        });
      }
    },
    [allVisibleItems, navigate],
  );

  const navigateToFeedItem = useCallback(
    (item: FeedItem) => {
      if (item.source === 'note' && item.noteId) {
        navigate({
          to: '/all/notes/$noteId',
          params: { noteId: item.noteId },
        });
      } else if (item.source === 'work-item' && item.workItemId) {
        navigate({
          to: '/all/work-items/$projectId/$workItemId',
          params: {
            projectId: item.projectId,
            workItemId: String(item.workItemId),
          },
        });
      } else if (item.source === 'pull-request' && item.pullRequestId) {
        navigate({
          to: '/all/prs/$projectId/$prId',
          params: {
            projectId: item.projectId,
            prId: String(item.pullRequestId),
          },
        });
      } else if (item.taskId) {
        navigate({
          to: '/all/$taskId',
          params: { taskId: item.taskId },
        });
      }
    },
    [navigate],
  );

  const openInProject = useCallback(
    (item: {
      source: FeedItem['source'];
      projectId: string;
      taskId?: string;
      pullRequestId?: number;
      workItemId?: number;
    }) => {
      // Work items only exist in the cross-project (/all) context
      if (item.source === 'work-item') return;
      // Notes are global, not per-project
      if (item.source === 'note') return;
      if (item.source === 'pull-request' && item.pullRequestId) {
        navigate({
          to: '/projects/$projectId/prs/$prId',
          params: {
            projectId: item.projectId,
            prId: String(item.pullRequestId),
          },
        });
        return;
      }

      if (item.taskId) {
        navigate({
          to: '/projects/$projectId/tasks/$taskId',
          params: {
            projectId: item.projectId,
            taskId: item.taskId,
          },
        });
      }
    },
    [navigate],
  );

  const navigateRelative = useCallback(
    (direction: 'prev' | 'next') => {
      if (allVisibleItems.length === 0) return;
      const currentIndex = allVisibleItems.findIndex((item) =>
        isItemSelected(item),
      );
      let newIndex: number;
      if (currentIndex === -1) {
        newIndex = direction === 'next' ? 0 : allVisibleItems.length - 1;
      } else {
        newIndex =
          direction === 'next'
            ? (currentIndex + 1) % allVisibleItems.length
            : (currentIndex - 1 + allVisibleItems.length) %
              allVisibleItems.length;
      }
      navigateToItem(newIndex);
    },
    [allVisibleItems, isItemSelected, navigateToItem],
  );

  // Find the currently selected item for dismiss/low-priority shortcuts
  const currentItem = useMemo(
    () => allVisibleItems.find((item) => isItemSelected(item)),
    [allVisibleItems, isItemSelected],
  );

  useEffect(() => {
    if (!currentItem) {
      return;
    }

    listRef.current
      ?.querySelector<HTMLElement>('[data-feed-selected="true"]')
      ?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'auto',
      });
  }, [currentItem]);

  useCommands('feed-list-navigation', [
    {
      label: 'Go to Feed Item 1',
      shortcut: 'cmd+1',
      handler: () => navigateToItem(0),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 2',
      shortcut: 'cmd+2',
      handler: () => navigateToItem(1),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 3',
      shortcut: 'cmd+3',
      handler: () => navigateToItem(2),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 4',
      shortcut: 'cmd+4',
      handler: () => navigateToItem(3),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 5',
      shortcut: 'cmd+5',
      handler: () => navigateToItem(4),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 6',
      shortcut: 'cmd+6',
      handler: () => navigateToItem(5),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 7',
      shortcut: 'cmd+7',
      handler: () => navigateToItem(6),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 8',
      shortcut: 'cmd+8',
      handler: () => navigateToItem(7),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Feed Item 9',
      shortcut: 'cmd+9',
      handler: () => navigateToItem(8),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Previous Feed Item',
      shortcut: 'cmd+up',
      handler: () => navigateRelative('prev'),
      hideInCommandPalette: true,
    },
    {
      label: 'Go to Next Feed Item',
      shortcut: 'cmd+down',
      handler: () => navigateRelative('next'),
      hideInCommandPalette: true,
    },
    {
      label: 'Dismiss Selected Feed Item',
      shortcut: 'cmd+shift+d',
      handler: () => {
        if (currentItem) dismiss(currentItem.id);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Toggle Low Priority on Selected Feed Item',
      shortcut: 'cmd+shift+l',
      handler: () => {
        if (currentItem) toggleLowPriority(currentItem.id);
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Toggle Pin on Selected Feed Item',
      shortcut: 'cmd+shift+p',
      handler: () => {
        if (!currentItem) return;
        if (pinnedIdSet.has(currentItem.id)) {
          unpin(currentItem.id);
        } else {
          pin(currentItem.id);
        }
      },
      hideInCommandPalette: true,
    },
    {
      label: 'Open Selected Feed Item in Project',
      shortcut: 'cmd+shift+o',
      handler: () => {
        if (currentItem) {
          openInProject(currentItem);
        }
      },
      hideInCommandPalette: true,
    },
  ]);

  const totalCount =
    pinnedItems.length +
    prReviewItems.length +
    actionNeededItems.length +
    highPriorityItems.length +
    activeTaskItems.length +
    normalItems.length +
    lowPriorityItems.length;

  return (
    <div
      ref={listRef}
      className="flex h-full flex-col overflow-y-auto overscroll-contain"
      style={{
        maskImage:
          'linear-gradient(to bottom, transparent 0px, black 8px, black calc(100% - 8px), transparent 100%)',
      }}
    >
      {/* Section header with + button */}
      {(totalCount > 0 || projectOptions.length > 0) && (
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-ink-3 text-[10px] font-semibold tracking-wider uppercase">
            {pinnedItems.length > 0 ? 'Pinned' : 'Feed'}
          </span>
          <div className="flex items-center gap-1">
            {projectOptions.length > 0 && (
              <Dropdown
                align="left"
                className="max-w-72 min-w-64"
                trigger={
                  <button
                    type="button"
                    className={clsx(
                      'text-ink-3 hover:bg-glass-medium hover:text-ink-1 relative flex h-5 w-5 items-center justify-center rounded transition-colors',
                      hiddenProjectIds.length > 0 && 'text-acc-ink',
                    )}
                    title="Filter projects"
                  >
                    <Filter size={12} strokeWidth={2.5} />
                    {hiddenProjectIds.length > 0 && (
                      <span className="bg-acc text-acc-ink absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full" />
                    )}
                  </button>
                }
              >
                <div className="px-3 py-2">
                  <div className="text-ink-1 text-xs font-semibold">
                    Project filter
                  </div>
                  <div className="text-ink-3 mt-0.5 text-[11px]">
                    Uncheck projects to hide them from feed.
                  </div>
                </div>
                <DropdownDivider />
                {projectOptions.map((project) => (
                  <DropdownItem
                    key={project.id}
                    checked={!hiddenProjectIdSet.has(project.id)}
                    onClick={() => toggleProjectHidden(project.id)}
                    icon={
                      <span
                        className="block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                    }
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{project.name}</span>
                      <span className="text-ink-3 ml-auto text-xs">
                        {project.itemCount}
                      </span>
                    </span>
                  </DropdownItem>
                ))}
                {hiddenProjectIds.length > 0 && (
                  <>
                    <DropdownDivider />
                    <DropdownItem onClick={clearHiddenProjects}>
                      Show all projects
                    </DropdownItem>
                  </>
                )}
              </Dropdown>
            )}
            <button
              type="button"
              onClick={() => openOverlay('new-task')}
              className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 flex h-5 w-5 items-center justify-center rounded transition-colors"
              title="New task"
            >
              <Plus size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* Initial loading state */}
      {isLoading && totalCount === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <Loader2 className="text-ink-2 h-6 w-6 animate-spin" />
          <span className="text-ink-3 text-sm">Loading feed...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading &&
        totalCount === 0 &&
        runningTaskCreationCount === 0 &&
        runningVerificationNoteCount === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
            <ListTodo className="text-ink-3 h-6 w-6" />
            <span className="text-ink-2 text-sm">
              {filteredOutCount > 0
                ? 'No feed items match filters'
                : 'No active tasks or notes'}
            </span>
            {filteredOutCount > 0 && (
              <button
                type="button"
                onClick={clearHiddenProjects}
                className="text-acc-ink hover:text-acc-ink/80 text-xs font-medium transition-colors"
              >
                Clear project filters
              </button>
            )}
          </div>
        )}

      {/* Pinned zone - visible when items are pinned or when dragging */}
      {(pinnedItems.length > 0 || draggedId) && (
        <div
          onDragOver={handlePinZoneDragOver}
          onDragLeave={handlePinZoneDragLeave}
          onDrop={handlePinZoneDrop}
          className={clsx(
            'flex flex-col transition-colors',
            dragOverPinZone && 'bg-acc/10',
          )}
        >
          {pinnedItems.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              isSelected={isItemSelected(item)}
              isDraggable
              onDragStart={() => handlePinnedDragStart(item.id)}
              onDragOver={(e) => handlePinnedDragOver(e, item.id)}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => handlePinnedDrop(e, item.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {/* Slightly stronger divider between pinned and rest of feed */}
      {pinnedItems.length > 0 && hasUnpinnedItems && (
        <div className="border-acc/20 border-t-4" />
      )}

      {/* PR review zone - horizontal stack, priority sorted */}
      {prReviewItems.length > 0 && (
        <HorizontalPrReviewStack
          items={prReviewItems}
          isItemSelected={isItemSelected}
          onOpen={navigateToFeedItem}
          onMarkLowPriority={(item) => markLowPriority(item.id)}
        />
      )}

      {runningTaskCreationCount > 0 && (
        <div className="px-2 py-1.5">
          <button
            type="button"
            onClick={() => openOverlay('activity-center')}
            className="bg-acc/[0.08] border-acc/20 text-acc-ink hover:bg-acc/[0.12] flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors"
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className="min-w-0 flex-1 truncate font-medium">
              Creating {runningTaskCreationCount}{' '}
              {runningTaskCreationCount === 1 ? 'task' : 'tasks'} in the
              background
            </span>
          </button>
        </div>
      )}

      {runningVerificationNoteCount > 0 && (
        <div className="px-2 py-1.5">
          <button
            type="button"
            onClick={() => openOverlay('activity-center')}
            className="bg-acc/[0.08] border-acc/20 text-acc-ink hover:bg-acc/[0.12] flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors"
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className="min-w-0 flex-1 truncate font-medium">
              Creating {runningVerificationNoteCount}{' '}
              {runningVerificationNoteCount === 1
                ? 'verification note'
                : 'verification notes'}{' '}
              in the background
            </span>
          </button>
        </div>
      )}

      {/* Action needed zone - permissions, questions, errors (sticky + stacked) */}
      {actionNeededItems.length > 0 && (
        <StackableZone
          items={actionNeededItems}
          isItemSelected={isItemSelected}
          onDragStart={setDraggedId}
          onDragEnd={handleDragEnd}
          sticky
          collapsedOverlap={32}
        />
      )}

      {/* Active tasks zone - stacked, spreads on hover */}
      {activeTaskItems.length > 0 && (
        <StackableZone
          items={activeTaskItems}
          isItemSelected={isItemSelected}
          onDragStart={setDraggedId}
          onDragEnd={handleDragEnd}
        />
      )}

      {/* High priority zone */}
      {highPriorityItems.length > 0 && (
        <div className="flex flex-col">
          {highPriorityItems.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              isSelected={isItemSelected(item)}
              isDraggable
              onDragStart={() => setDraggedId(item.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {/* Divider between active tasks/high-priority and auto-sorted */}
      {(activeTaskItems.length > 0 || highPriorityItems.length > 0) &&
        normalItems.length > 0 && (
          <div className="border-line-soft my-1 border-t border-dashed" />
        )}

      {/* Auto-sorted zone */}
      <div className="flex flex-col">
        {normalItems.map((item) => (
          <FeedCard
            key={item.id}
            item={item}
            isSelected={isItemSelected(item)}
            isDraggable
            onDragStart={() => setDraggedId(item.id)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* Low priority collapsed section */}
      {lowPriorityItems.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setLowPriorityExpanded((prev) => !prev)}
            className="text-ink-3 hover:bg-glass-light/50 hover:text-ink-2 flex w-full items-center gap-1.5 px-3 py-1.5 text-xs transition-colors"
          >
            {lowPriorityExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            {lowPriorityItems.length} low priority
          </button>
          {lowPriorityExpanded && (
            <div className="flex flex-col pt-1 opacity-60">
              {lowPriorityItems.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  isSelected={isItemSelected(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
