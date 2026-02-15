import type {
  NormalizedEntry,
  NormalizedToolUse,
} from '@shared/normalized-message-v2';

/**
 * Represents a message ready for display in the timeline.
 */
export type DisplayMessage =
  | { kind: 'entry'; entry: NormalizedEntry }
  | {
      kind: 'skill';
      skillToolUse: NormalizedToolUse;
      promptEntry?: NormalizedEntry;
      childEntries: NormalizedEntry[];
    }
  | {
      kind: 'compacting';
      startEntry: NormalizedEntry;
      endEntry?: NormalizedEntry;
    }
  | {
      kind: 'subagent';
      toolUse: NormalizedToolUse;
      childEntries: NormalizedEntry[];
    };

// --- Helpers ---

function isCompactingStartEntry(entry: NormalizedEntry): boolean {
  return entry.type === 'system-status' && entry.status === 'compacting';
}

function isCompactingEndEntry(entry: NormalizedEntry): boolean {
  return entry.type === 'system-status' && entry.status === null;
}

function isSkillToolUse(
  entry: NormalizedEntry,
): entry is NormalizedEntry & NormalizedToolUse & { name: 'skill' } {
  return entry.type === 'tool-use' && entry.name === 'skill' && !!entry.result;
}

function isSubAgentToolUse(
  entry: NormalizedEntry,
): entry is NormalizedEntry & NormalizedToolUse & { name: 'sub-agent' } {
  return entry.type === 'tool-use' && entry.name === 'sub-agent';
}

function isSyntheticUserPrompt(entry: NormalizedEntry): boolean {
  return entry.isSynthetic === true && entry.type === 'user-prompt';
}

/**
 * Merge flat entries into display entries:
 * - Skill: skill tool-use + next synthetic user-prompt entry (with matching parentToolId) + child entries
 * - Compacting: system-status 'compacting' + system-status null
 * - Sub-agent: sub-agent tool-use + child entries (linked via parentToolId)
 * - Regular: everything else
 */
export function mergeSkillMessages(
  entries: NormalizedEntry[],
): DisplayMessage[] {
  const result: DisplayMessage[] = [];
  const processedIndices = new Set<number>();

  // Pass 1: Collect all sub-agent tool-use entries and their toolIds
  const subAgentToolUses = new Map<
    string,
    { toolUse: NormalizedToolUse; index: number }
  >();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (isSubAgentToolUse(entry)) {
      subAgentToolUses.set(entry.toolId, { toolUse: entry, index: i });
    }
  }

  // Pass 2: Collect all skill tool-use entries and their toolIds
  const skillToolUses = new Map<
    string,
    { toolUse: NormalizedToolUse; index: number }
  >();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (isSkillToolUse(entry)) {
      skillToolUses.set(entry.toolId, { toolUse: entry, index: i });
    }
  }

  const knownSubAgentIds = new Set(subAgentToolUses.keys());
  const knownSkillIds = new Set(skillToolUses.keys());

  // Pass 3: Group child entries by parentToolId (for sub-agents and skills)
  const childEntriesByToolId = new Map<
    string,
    { entry: NormalizedEntry; index: number }[]
  >();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const parentId = entry.parentToolId;
    if (
      parentId &&
      (knownSubAgentIds.has(parentId) || knownSkillIds.has(parentId))
    ) {
      if (!childEntriesByToolId.has(parentId)) {
        childEntriesByToolId.set(parentId, []);
      }
      childEntriesByToolId.get(parentId)!.push({ entry, index: i });
    }
  }

  // Mark child entries as processed so they don't appear as standalone
  for (const children of childEntriesByToolId.values()) {
    for (const { index } of children) {
      processedIndices.add(index);
    }
  }

  // Pass 4: Linear scan
  for (let i = 0; i < entries.length; i++) {
    if (processedIndices.has(i)) continue;

    const current = entries[i];

    // Check for skill tool-use
    if (isSkillToolUse(current)) {
      const children = childEntriesByToolId.get(current.toolId) || [];

      // Find the prompt entry: the next synthetic user-prompt not yet processed
      // Typically the entry right after the skill tool-use
      let promptEntry: NormalizedEntry | undefined;
      const next = entries[i + 1];
      if (next && isSyntheticUserPrompt(next) && !processedIndices.has(i + 1)) {
        promptEntry = next;
        processedIndices.add(i + 1);
      }

      result.push({
        kind: 'skill',
        skillToolUse: current,
        promptEntry,
        childEntries: children.map((c) => c.entry),
      });
      processedIndices.add(i);
      continue;
    }

    // Check for compacting start
    if (isCompactingStartEntry(current)) {
      let endIndex: number | undefined;
      for (let j = i + 1; j < entries.length; j++) {
        if (processedIndices.has(j)) continue;
        if (isCompactingEndEntry(entries[j])) {
          endIndex = j;
          break;
        }
      }

      if (endIndex !== undefined) {
        result.push({
          kind: 'compacting',
          startEntry: current,
          endEntry: entries[endIndex],
        });
        processedIndices.add(i);
        processedIndices.add(endIndex);
      } else {
        result.push({
          kind: 'compacting',
          startEntry: current,
        });
        processedIndices.add(i);
      }
      continue;
    }

    // Skip orphaned compact end entries
    if (isCompactingEndEntry(current)) {
      processedIndices.add(i);
      continue;
    }

    // Check for sub-agent tool-use
    if (isSubAgentToolUse(current)) {
      const children = childEntriesByToolId.get(current.toolId) || [];
      result.push({
        kind: 'subagent',
        toolUse: current,
        childEntries: children.map((c) => c.entry),
      });
      processedIndices.add(i);
      continue;
    }

    // Regular entry
    result.push({ kind: 'entry', entry: current });
    processedIndices.add(i);
  }

  return result;
}
