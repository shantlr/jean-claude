import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { Button } from '@/common/ui/button';
import { Switch } from '@/common/ui/switch';
import {
  BackendPresetSelector,
  findMatchingBackendModelPresetId,
} from '@/features/agent/ui-backend-preset-selector';
import {
  useBackendModelOptions,
  type BackendModelOption,
} from '@/features/agent/ui-backend-selector';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import { ThinkingSelector } from '@/features/agent/ui-thinking-selector';
import { useBackendModels } from '@/hooks/use-backend-models';
import {
  useBackendsSetting,
  useBackendModelPresetsSetting,
  useRateLimitSwapSetting,
  useUpdateRateLimitSwapSetting,
} from '@/hooks/use-settings';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type {
  BackendModelPreset,
  ModelPreference,
  RateLimitSwapEntry,
  ThinkingEffort,
} from '@shared/types';

const GRID_CLASS =
  'grid grid-cols-[44px_minmax(150px,1.45fr)_minmax(120px,1.05fr)_minmax(110px,1.05fr)_minmax(140px,1.35fr)_36px] items-center gap-3';

function ChainNode({
  children,
  fallback,
}: {
  children: string;
  fallback?: boolean;
}) {
  return (
    <div className="relative z-10 flex items-center justify-center">
      <div
        className={clsx(
          'bg-bg-0 flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] font-mono text-xs font-semibold shadow-[0_0_0_4px_var(--color-bg-0),0_0_14px_-2px_rgba(167,139,250,0.55)]',
          fallback
            ? 'border-dashed border-[rgba(167,139,250,0.55)] text-[15px] text-[#c2b0ff]'
            : 'border-[#a78bfa] text-[#c2b0ff]',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function ThresholdEditor({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.max(1, Math.min(100, Math.round(value * 100)));
  const updatePercent = (next: number) => {
    if (Number.isNaN(next)) return;
    onChange(Math.max(1, Math.min(100, Math.round(next))) / 100);
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="text-ink-1 flex items-center gap-1 font-mono text-[13px] font-semibold tabular-nums">
        <span className="text-ink-4 font-medium">≤</span>
        <input
          type="number"
          min={1}
          max={100}
          value={percent}
          onChange={(event) => updatePercent(Number(event.target.value))}
          className="text-ink-1 w-11 [appearance:textfield] rounded bg-transparent px-1 text-right font-mono text-[13px] font-semibold transition-colors outline-none hover:bg-white/[0.06] focus:bg-[rgba(167,139,250,0.16)] focus:ring-1 focus:ring-[rgba(167,139,250,0.4)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span>%</span>
      </div>
      <div className="group relative flex h-3.5 items-center">
        <input
          type="range"
          min={1}
          max={100}
          value={percent}
          onChange={(event) => updatePercent(Number(event.target.value))}
          className="absolute inset-0 z-10 cursor-pointer opacity-0"
          aria-label="Usage threshold"
        />
        <div className="relative h-[5px] w-full rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#8e6bea] to-[#c2b0ff]"
            style={{ width: `${percent}%` }}
          />
          <div
            className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#a78bfa] bg-white opacity-0 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)] transition-opacity group-hover:opacity-100"
            style={{ left: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function EntryModelSelector({
  backend,
  value,
  onChange,
}: {
  backend: AgentBackendType;
  value: ModelPreference;
  onChange: (model: ModelPreference) => void;
}) {
  const { data: dynamicModels } = useBackendModels(backend);
  const modelOptions: BackendModelOption[] = useBackendModelOptions(
    backend,
    dynamicModels,
  );
  return (
    <ModelSelector
      value={value}
      onChange={onChange}
      models={modelOptions}
      size="sm"
    />
  );
}

function EntryAgentSelector({
  entry,
  selectedPresetId,
  enabledBackends,
  onChange,
}: {
  entry: RateLimitSwapEntry;
  selectedPresetId: string | null;
  enabledBackends: AgentBackendType[];
  onChange: (patch: Partial<RateLimitSwapEntry>) => void;
}) {
  return (
    <BackendPresetSelector
      backend={entry.backend}
      selectedPresetId={selectedPresetId}
      enabledBackends={enabledBackends}
      onChange={(selection) => {
        onChange({
          backend: selection.backend,
          model: selection.modelPreference ?? 'default',
          thinkingEffort: selection.thinkingEffort ?? 'default',
          presetId: selection.presetId,
        });
      }}
      size="sm"
    />
  );
}

function PresetModelCell({ preset }: { preset: BackendModelPreset }) {
  return (
    <div className="bg-glass-light text-ink-2 flex h-8 min-w-0 items-center rounded-md px-3 text-xs">
      <span className="truncate">{preset.model}</span>
    </div>
  );
}

function SortableEntry({
  entry,
  entryId,
  index,
  chainIndex,
  enabledBackends,
  selectedPreset,
  onUpdate,
  onRemove,
}: {
  entry: RateLimitSwapEntry;
  entryId: string;
  index: number;
  chainIndex: number;
  enabledBackends: AgentBackendType[];
  selectedPreset: BackendModelPreset | null;
  onUpdate: (index: number, patch: Partial<RateLimitSwapEntry>) => void;
  onRemove: (index: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entryId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        GRID_CLASS,
        'group border-line-soft bg-bg-0/45 hover:bg-bg-2/45 relative rounded-[11px] border px-3.5 py-3 transition-colors hover:border-white/15',
      )}
    >
      <div className="relative flex items-center justify-center">
        <button
          ref={setActivatorNodeRef}
          className="text-ink-3 absolute -left-1 cursor-grab opacity-0 transition-opacity group-hover:opacity-60 active:cursor-grabbing"
          aria-label="Reorder swap entry"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={13} />
        </button>
        <ChainNode>{String(index + 1)}</ChainNode>
      </div>

      <EntryAgentSelector
        entry={entry}
        selectedPresetId={selectedPreset?.id ?? null}
        enabledBackends={enabledBackends}
        onChange={(patch) => onUpdate(chainIndex, patch)}
      />

      {selectedPreset ? (
        <PresetModelCell preset={selectedPreset} />
      ) : (
        <EntryModelSelector
          backend={entry.backend}
          value={entry.model ?? 'default'}
          onChange={(model: ModelPreference) =>
            onUpdate(chainIndex, { model, presetId: null })
          }
        />
      )}

      <ThinkingSelector
        value={entry.thinkingEffort ?? 'default'}
        onChange={(effort: ThinkingEffort) =>
          onUpdate(chainIndex, { thinkingEffort: effort, presetId: null })
        }
        size="sm"
      />

      <ThresholdEditor
        value={entry.threshold ?? 0.8}
        onChange={(threshold) => onUpdate(chainIndex, { threshold })}
      />

      <Button
        size="xs"
        variant="ghost"
        icon={<Trash2 />}
        onClick={() => onRemove(chainIndex)}
        className="text-ink-4 justify-self-center opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-200"
        aria-label="Remove swap entry"
      />
    </div>
  );
}

function FallbackEntry({
  entry,
  fallbackIndex,
  enabledBackends,
  selectedPreset,
  onUpdate,
}: {
  entry: RateLimitSwapEntry;
  fallbackIndex: number;
  enabledBackends: AgentBackendType[];
  selectedPreset: BackendModelPreset | null;
  onUpdate: (index: number, patch: Partial<RateLimitSwapEntry>) => void;
}) {
  return (
    <div
      className={clsx(
        GRID_CLASS,
        'relative rounded-[11px] border border-dashed border-[rgba(167,139,250,0.28)] bg-[linear-gradient(180deg,rgba(167,139,250,0.06),rgba(167,139,250,0.02))] px-3.5 py-3',
      )}
    >
      <ChainNode fallback>∞</ChainNode>

      <EntryAgentSelector
        entry={entry}
        selectedPresetId={selectedPreset?.id ?? null}
        enabledBackends={enabledBackends}
        onChange={(patch) =>
          onUpdate(fallbackIndex, { ...patch, threshold: undefined })
        }
      />

      {selectedPreset ? (
        <PresetModelCell preset={selectedPreset} />
      ) : (
        <EntryModelSelector
          backend={entry.backend}
          value={entry.model ?? 'default'}
          onChange={(model: ModelPreference) =>
            onUpdate(fallbackIndex, { model, presetId: null })
          }
        />
      )}

      <ThinkingSelector
        value={entry.thinkingEffort ?? 'default'}
        onChange={(effort: ThinkingEffort) =>
          onUpdate(fallbackIndex, { thinkingEffort: effort, presetId: null })
        }
        size="sm"
      />

      <div className="text-ink-3 flex items-center gap-2 font-mono text-xs whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-[#a78bfa] shadow-[0_0_8px_1px_rgba(167,139,250,0.7)]" />
        Always fallback
      </div>

      <span className="justify-self-center rounded-md border border-[rgba(167,139,250,0.28)] bg-[rgba(167,139,250,0.16)] px-1.5 py-1 font-mono text-[9px] font-semibold tracking-[0.1em] text-[#c2b0ff]">
        FB
      </span>
    </div>
  );
}

export function RateLimitSwapSettings() {
  const { data: setting } = useRateLimitSwapSetting();
  const { data: backendsSetting } = useBackendsSetting();
  const { data: backendModelPresets = [] } = useBackendModelPresetsSetting();
  const updateSetting = useUpdateRateLimitSwapSetting();

  const enabledBackends = useMemo(
    () =>
      backendsSetting?.enabledBackends ??
      (['claude-code'] as AgentBackendType[]),
    [backendsSetting],
  );

  const enabled = setting?.enabled ?? false;
  const chain = useMemo(() => setting?.chain ?? [], [setting]);
  const fallbackIndex = useMemo(
    () => chain.findIndex((entry) => entry.threshold == null),
    [chain],
  );
  const sortableEntries = useMemo(
    () =>
      chain
        .map((entry, chainIndex) => ({ entry, chainIndex }))
        .filter(({ entry }) => entry.threshold != null),
    [chain],
  );
  const fallbackEntry = fallbackIndex === -1 ? null : chain[fallbackIndex];

  // Stable IDs for sortable — use index-based since entries have no natural ID
  const entryIds = useMemo(
    () => sortableEntries.map((_, i) => `entry-${i}`),
    [sortableEntries],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const updateChain = useCallback(
    (nextChain: RateLimitSwapEntry[]) => {
      updateSetting.mutate({ enabled, chain: nextChain });
    },
    [enabled, updateSetting],
  );

  const toggleEnabled = useCallback(
    (checked: boolean) => {
      updateSetting.mutate({ enabled: checked, chain });
    },
    [chain, updateSetting],
  );

  const addEntry = useCallback(() => {
    const backend = enabledBackends[0] ?? 'claude-code';
    const newEntry: RateLimitSwapEntry = {
      backend,
      model: 'default',
      thinkingEffort: 'default',
      threshold: 0.8,
    };
    if (fallbackEntry) {
      updateChain([
        ...sortableEntries.map(({ entry }) => entry),
        newEntry,
        fallbackEntry,
      ]);
      return;
    }
    const fallback: RateLimitSwapEntry = {
      backend,
      model: 'default',
      thinkingEffort: 'default',
    };
    updateChain([...chain, newEntry, fallback]);
  }, [chain, enabledBackends, fallbackEntry, sortableEntries, updateChain]);

  const removeEntry = useCallback(
    (index: number) => {
      updateChain(chain.filter((_, i) => i !== index));
    },
    [chain, updateChain],
  );

  const updateEntry = useCallback(
    (index: number, patch: Partial<RateLimitSwapEntry>) => {
      updateChain(
        chain.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
      );
    },
    [chain, updateChain],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = entryIds.indexOf(active.id as string);
      const newIndex = entryIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(
        sortableEntries.map(({ entry }) => entry),
        oldIndex,
        newIndex,
      );
      updateChain(fallbackEntry ? [...reordered, fallbackEntry] : reordered);
    },
    [entryIds, fallbackEntry, sortableEntries, updateChain],
  );

  const getSelectedPreset = useCallback(
    (entry: RateLimitSwapEntry) => {
      const presetId =
        entry.presetId === undefined
          ? findMatchingBackendModelPresetId({
              presets: backendModelPresets,
              backend: entry.backend,
              model: entry.model ?? 'default',
              thinkingEffort: entry.thinkingEffort ?? 'default',
            })
          : entry.presetId;

      return presetId
        ? (backendModelPresets.find((preset) => preset.id === presetId) ?? null)
        : null;
    },
    [backendModelPresets],
  );

  return (
    <div className="mt-6">
      <div className="border-line-soft border-t pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-ink-1 text-sm font-semibold">
              Auto-swap on rate limit
            </h3>
            <p className="text-ink-3 mt-0.5 text-xs">
              Walks top-to-bottom and picks first entry whose usage threshold
              has not been crossed. Dashed fallback catches last.
            </p>
          </div>
          <Switch checked={enabled} onChange={toggleEnabled} />
        </div>

        <div
          className={clsx(
            'mt-5 transition-opacity',
            !enabled && 'pointer-events-none opacity-40 saturate-50',
          )}
        >
          <div className={clsx(GRID_CLASS, 'mb-2 pr-1 pl-0')}>
            <span />
            <span className="text-ink-4 font-mono text-[10px] tracking-[0.14em] uppercase">
              Agent
            </span>
            <span className="text-ink-4 font-mono text-[10px] tracking-[0.14em] uppercase">
              Model
            </span>
            <span className="text-ink-4 font-mono text-[10px] tracking-[0.14em] uppercase">
              Thinking
            </span>
            <span className="text-ink-4 font-mono text-[10px] tracking-[0.14em] uppercase">
              Use until
            </span>
            <span />
          </div>

          <div className="relative space-y-2.5">
            {(sortableEntries.length > 0 || fallbackEntry) && (
              <div className="absolute top-6 bottom-7 left-[36px] w-0.5 rounded-full bg-gradient-to-b from-[rgba(167,139,250,0.55)] to-[rgba(167,139,250,0.12)]" />
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={entryIds}
                strategy={verticalListSortingStrategy}
              >
                {sortableEntries.map(({ entry, chainIndex }, index) => (
                  <SortableEntry
                    key={entryIds[index]}
                    entry={entry}
                    entryId={entryIds[index]}
                    index={index}
                    chainIndex={chainIndex}
                    enabledBackends={enabledBackends}
                    selectedPreset={getSelectedPreset(entry)}
                    onUpdate={updateEntry}
                    onRemove={removeEntry}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {fallbackEntry && (
              <FallbackEntry
                entry={fallbackEntry}
                fallbackIndex={fallbackIndex}
                enabledBackends={enabledBackends}
                selectedPreset={getSelectedPreset(fallbackEntry)}
                onUpdate={updateEntry}
              />
            )}
          </div>

          <Button
            size="sm"
            variant="ghost"
            icon={<Plus />}
            onClick={addEntry}
            className="text-ink-3 hover:text-ink-1 mt-4 ml-[57px] border border-dashed border-white/15 px-3.5 hover:border-[rgba(167,139,250,0.4)] hover:bg-[rgba(167,139,250,0.16)]"
          >
            Add entry
          </Button>
        </div>
      </div>
    </div>
  );
}
