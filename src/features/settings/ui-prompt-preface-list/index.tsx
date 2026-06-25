import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { startTransition, useEffect, useState } from 'react';
import clsx from 'clsx';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import type {
  PromptPrefaceEntry,
  PromptPrefaceFrequency,
  PromptPrefacePlacement,
} from '@shared/types';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Input } from '@/common/ui/input';
import { Modal } from '@/common/ui/modal';
import { Select } from '@/common/ui/select';
import { Textarea } from '@/common/ui/textarea';

const PROMPT_PREFACE_PLACEMENT_OPTIONS = [
  { value: 'before', label: 'Before user prompt' },
  { value: 'after', label: 'After user prompt' },
];

const PROMPT_PREFACE_FREQUENCY_OPTIONS = [
  { value: 'initial', label: 'Initial prompt only' },
  { value: 'each', label: 'Each prompt' },
];

function createEntry(index: number): PromptPrefaceEntry {
  return {
    id: crypto.randomUUID(),
    name: `Preface ${index}`,
    enabled: true,
    text: '',
    placement: 'before',
    frequency: 'initial',
  };
}

function SortablePrefaceEntry({
  entry,
  index,
  entriesLength,
  disabled,
  onUpdate,
  onMove,
  onDelete,
  onCommit,
}: {
  entry: PromptPrefaceEntry;
  index: number;
  entriesLength: number;
  disabled: boolean;
  onUpdate: (
    id: string,
    update: Partial<PromptPrefaceEntry>,
    commit?: boolean,
  ) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (entry: PromptPrefaceEntry) => void;
  onCommit: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'border-glass-border bg-bg-1 rounded-lg border p-3',
        isDragging && 'border-acc/60 shadow-lg',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          disabled={disabled}
          className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 cursor-grab rounded p-1 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Reorder prompt preface"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Checkbox
          checked={entry.enabled}
          disabled={disabled}
          onChange={(enabled) => onUpdate(entry.id, { enabled })}
        />
        <Input
          value={entry.name}
          disabled={disabled}
          onChange={(event) =>
            onUpdate(entry.id, { name: event.target.value }, false)
          }
          onBlur={onCommit}
          className="min-w-40 flex-1"
          placeholder={`Preface ${index + 1}`}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || index === 0}
          onClick={() => onMove(index, -1)}
        >
          Up
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || index === entriesLength - 1}
          onClick={() => onMove(index, 1)}
        >
          Down
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={disabled}
          onClick={() => onDelete(entry)}
        >
          Delete
        </Button>
      </div>

      <Textarea
        size="md"
        value={entry.text}
        disabled={disabled}
        onChange={(event) =>
          onUpdate(entry.id, { text: event.target.value }, false)
        }
        onBlur={onCommit}
        placeholder="Example: Keep responses concise and prioritize minimal code changes."
        rows={5}
        className="mt-3"
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-ink-1 mb-1 block text-sm font-medium">
            Placement
          </label>
          <Select
            value={entry.placement}
            options={PROMPT_PREFACE_PLACEMENT_OPTIONS}
            disabled={disabled}
            onChange={(placement) =>
              onUpdate(entry.id, {
                placement: placement as PromptPrefacePlacement,
              })
            }
            className="w-full justify-between"
          />
        </div>
        <div>
          <label className="text-ink-1 mb-1 block text-sm font-medium">
            Frequency
          </label>
          <Select
            value={entry.frequency}
            options={PROMPT_PREFACE_FREQUENCY_OPTIONS}
            disabled={disabled}
            onChange={(frequency) =>
              onUpdate(entry.id, {
                frequency: frequency as PromptPrefaceFrequency,
              })
            }
            className="w-full justify-between"
          />
        </div>
      </div>
    </div>
  );
}

export function PromptPrefaceList({
  entries,
  disabled = false,
  onChange,
}: {
  entries: PromptPrefaceEntry[];
  disabled?: boolean;
  onChange: (entries: PromptPrefaceEntry[]) => void;
}) {
  const [draftEntries, setDraftEntries] = useState(entries);
  const [pendingDelete, setPendingDelete] =
    useState<PromptPrefaceEntry | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    startTransition(() => setDraftEntries(entries));
  }, [entries]);

  const updateEntry = (
    id: string,
    update: Partial<PromptPrefaceEntry>,
    commit = true,
  ) => {
    setDraftEntries((current) => {
      const next = current.map((entry) =>
        entry.id === id ? { ...entry, ...update } : entry,
      );
      if (commit) onChange(next);
      return next;
    });
  };

  const replaceEntries = (next: PromptPrefaceEntry[]) => {
    setDraftEntries(next);
    onChange(next);
  };

  const moveEntry = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draftEntries.length) return;
    const next = [...draftEntries];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    replaceEntries(next);
  };

  const deleteEntry = (entry: PromptPrefaceEntry) => {
    if (entry.text.trim()) {
      setPendingDelete(entry);
      return;
    }

    replaceEntries(draftEntries.filter((current) => current.id !== entry.id));
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    replaceEntries(
      draftEntries.filter((current) => current.id !== pendingDelete.id),
    );
    setPendingDelete(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = draftEntries.findIndex((entry) => entry.id === active.id);
    const newIndex = draftEntries.findIndex((entry) => entry.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    replaceEntries(arrayMove(draftEntries, oldIndex, newIndex));
  };

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={draftEntries.map((entry) => entry.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {draftEntries.map((entry, index) => (
              <SortablePrefaceEntry
                key={entry.id}
                entry={entry}
                index={index}
                entriesLength={draftEntries.length}
                disabled={disabled}
                onUpdate={updateEntry}
                onMove={moveEntry}
                onDelete={deleteEntry}
                onCommit={() => onChange(draftEntries)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {draftEntries.length === 0 && (
        <div className="border-line-soft bg-bg-0 rounded-lg border px-4 py-3">
          <p className="text-ink-3 text-sm">No prompt prefaces configured.</p>
        </div>
      )}

      <Button
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() =>
          replaceEntries([...draftEntries, createEntry(draftEntries.length + 1)])
        }
      >
        Add preface
      </Button>

      <Modal
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete preface?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-ink-2 text-sm">
            This preface has content. Deleting it cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
