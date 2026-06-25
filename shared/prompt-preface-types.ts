import type { PromptPart } from './agent-backend-types';

export type PromptPrefacePlacement = 'before' | 'after';
export type PromptPrefaceFrequency = 'initial' | 'each';

export interface PromptPrefaceEntry {
  id: string;
  name: string;
  enabled: boolean;
  text: string;
  placement: PromptPrefacePlacement;
  frequency: PromptPrefaceFrequency;
}

export type PromptPrefaceSetting = PromptPrefaceEntry[];

export interface ProjectPromptPrefaceSetting {
  mode: 'inherit' | 'override';
  entries: PromptPrefaceEntry[];
}

export const DEFAULT_PROMPT_PREFACE_SETTING: PromptPrefaceSetting = [];

export const DEFAULT_PROJECT_PROMPT_PREFACE_SETTING: ProjectPromptPrefaceSetting =
  {
    mode: 'inherit',
    entries: [],
  };

type LegacyPromptPrefaceSetting = {
  text: string;
  placement: PromptPrefacePlacement;
  frequency: PromptPrefaceFrequency;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isPromptPrefacePlacement(
  value: unknown,
): value is PromptPrefacePlacement {
  return value === 'before' || value === 'after';
}

function isPromptPrefaceFrequency(
  value: unknown,
): value is PromptPrefaceFrequency {
  return value === 'initial' || value === 'each';
}

function isPromptPrefaceEntry(value: unknown): value is PromptPrefaceEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.enabled === 'boolean' &&
    typeof value.text === 'string' &&
    isPromptPrefacePlacement(value.placement) &&
    isPromptPrefaceFrequency(value.frequency)
  );
}

function isLegacyPromptPrefaceSetting(
  value: unknown,
): value is LegacyPromptPrefaceSetting {
  if (!isRecord(value)) return false;
  return (
    typeof value.text === 'string' &&
    isPromptPrefacePlacement(value.placement) &&
    isPromptPrefaceFrequency(value.frequency)
  );
}

function legacyEntry(
  value: LegacyPromptPrefaceSetting,
  index: number,
): PromptPrefaceEntry | null {
  const text = value.text.trim();
  if (!text) return null;

  return {
    id: `legacy-${index}`,
    name: `Preface ${index}`,
    enabled: true,
    text,
    placement: value.placement,
    frequency: value.frequency,
  };
}

export function isPromptPrefaceSetting(
  value: unknown,
): value is PromptPrefaceSetting {
  return Array.isArray(value) && value.every(isPromptPrefaceEntry);
}

export function isProjectPromptPrefaceSetting(
  value: unknown,
): value is ProjectPromptPrefaceSetting {
  if (!isRecord(value)) return false;
  return (
    (value.mode === 'inherit' || value.mode === 'override') &&
    isPromptPrefaceSetting(value.entries)
  );
}

export function normalizePromptPrefaceSetting(
  value: unknown,
): PromptPrefaceSetting | null {
  if (isPromptPrefaceSetting(value)) return value;
  if (!isLegacyPromptPrefaceSetting(value)) return null;
  const entry = legacyEntry(value, 1);
  return entry ? [entry] : [];
}

export function normalizeProjectPromptPrefaceSetting({
  value,
  globalEntries = [],
}: {
  value: unknown;
  globalEntries?: PromptPrefaceEntry[];
}): ProjectPromptPrefaceSetting | null {
  if (isProjectPromptPrefaceSetting(value)) return value;
  if (!isLegacyPromptPrefaceSetting(value) || !isRecord(value)) return null;

  const mode = (value as Record<string, unknown>).mode;
  if (mode !== 'inherit' && mode !== 'extend' && mode !== 'override') {
    return null;
  }

  if (mode === 'inherit') return DEFAULT_PROJECT_PROMPT_PREFACE_SETTING;

  const entry = legacyEntry(value, mode === 'extend' ? 2 : 1);
  if (mode === 'extend' && !entry) {
    return DEFAULT_PROJECT_PROMPT_PREFACE_SETTING;
  }

  return {
    mode: 'override',
    entries: [
      ...(mode === 'extend'
        ? globalEntries.map((globalEntry) => ({
            ...globalEntry,
            placement: value.placement,
            frequency: value.frequency,
          }))
        : []),
      ...(entry ? [entry] : []),
    ],
  };
}

export function applyPromptPrefaceToParts({
  parts,
  entries,
  isInitialPrompt,
}: {
  parts: PromptPart[];
  entries: PromptPrefaceEntry[];
  isInitialPrompt: boolean;
}): PromptPart[] {
  const enabledEntries = entries.filter(
    (entry) =>
      entry.enabled && (isInitialPrompt || entry.frequency !== 'initial'),
  );
  const beforeText = enabledEntries
    .filter((entry) => entry.placement === 'before')
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .join('\n\n');
  const afterText = enabledEntries
    .filter((entry) => entry.placement === 'after')
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .join('\n\n');
  if (!beforeText && !afterText) return parts;

  const textIndex = parts.findIndex((part) => part.type === 'text');
  if (textIndex === -1) {
    return [
      ...(beforeText ? [{ type: 'text' as const, text: beforeText }] : []),
      ...parts,
      ...(afterText ? [{ type: 'text' as const, text: afterText }] : []),
    ];
  }

  return parts.map((part, index) => {
    if (index !== textIndex || part.type !== 'text') return part;
    return {
      ...part,
      text: [beforeText, part.text, afterText].filter(Boolean).join('\n\n'),
    };
  });
}
