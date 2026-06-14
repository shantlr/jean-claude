import type {
  NormalizedEntry,
  NormalizedToolUse,
  ToolUseByName,
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

/**
 * A group of messages initiated by a user prompt.
 * Contains all work (tool calls, assistant messages, etc.) until the next prompt or result.
 */
export type PromptGroup = {
  kind: 'prompt-group';
  promptEntry: NormalizedEntry & { type: 'user-prompt' };
  childMessages: DisplayMessage[];
  resultEntry?: NormalizedEntry & { type: 'result' };
  /** Duration in ms from prompt to result, computed from timestamps */
  durationMs?: number;
  status: 'running' | 'completed' | 'error' | 'interrupted';
};

/**
 * Top-level stream message: either a prompt group or a standalone display message
 * (for messages that appear before the first prompt, e.g. system status).
 */
export type StreamMessage = PromptGroup | DisplayMessage;

// --- Helpers ---

function hasPendingToolWork(message: DisplayMessage): boolean {
  if (message.kind === 'entry') {
    return message.entry.type === 'tool-use' && !message.entry.result;
  }

  if (message.kind === 'subagent') {
    return !message.toolUse.result;
  }

  return false;
}

function hasAssistantCompletionMessage(messages: DisplayMessage[]): boolean {
  let sawAssistantMessage = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];

    if (hasPendingToolWork(message)) {
      return false;
    }

    if (
      message.kind === 'entry' &&
      message.entry.type === 'assistant-message' &&
      message.entry.value.trim()
    ) {
      sawAssistantMessage = true;
    }
  }

  return sawAssistantMessage;
}

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

function isSDKSyntheticUserPrompt(entry: NormalizedEntry): boolean {
  return entry.type === 'user-prompt' && entry.isSDKSynthetic === true;
}

function hasDuplicateUserPrompt(
  entries: NormalizedEntry[],
  startIndex: number,
): boolean {
  const current = entries[startIndex];
  if (current.type !== 'user-prompt') return false;

  const currentValue = current.value.trim();
  if (!currentValue) return false;

  for (let i = startIndex + 1; i < entries.length; i++) {
    const entry = entries[i];
    if (isSDKSyntheticUserPrompt(entry) || entry.type === 'result') {
      return false;
    }

    if (
      entry.type === 'user-prompt' &&
      !isSDKSyntheticUserPrompt(entry) &&
      entry.value.trim() === currentValue
    ) {
      return true;
    }
  }

  return false;
}

function pathsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function getEditedFilePaths(entry: NormalizedEntry): string[] {
  if (entry.type !== 'tool-use') return [];

  if (entry.name === 'edit') {
    const edit = entry as ToolUseByName<'edit'>;
    return (edit.input.files ?? [{ filePath: edit.input.filePath }])
      .map((file) => file.filePath)
      .filter(Boolean);
  }

  if (entry.name === 'write') {
    const write = entry as ToolUseByName<'write'>;
    return (write.input.files ?? [{ filePath: write.input.filePath }])
      .map((file) => file.filePath)
      .filter(Boolean);
  }

  return [];
}

function hasToolEditForFile(
  entry: NormalizedEntry,
  editedFilePaths: string[],
): boolean {
  return (
    entry.type === 'file-edited' &&
    editedFilePaths.some((filePath) => pathsMatch(entry.filePath, filePath))
  );
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
  const editedFilePaths = entries.flatMap(getEditedFilePaths);
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
    if (hasToolEditForFile(entry, editedFilePaths)) continue;
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
    if (hasToolEditForFile(current, editedFilePaths)) {
      processedIndices.add(i);
      continue;
    }

    if (
      isSDKSyntheticUserPrompt(current) &&
      hasDuplicateUserPrompt(entries, i)
    ) {
      processedIndices.add(i);
      continue;
    }

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

// --- Stage 2: Group display messages by user prompts ---

function isUserPromptMessage(
  dm: DisplayMessage,
): dm is { kind: 'entry'; entry: NormalizedEntry & { type: 'user-prompt' } } {
  return (
    dm.kind === 'entry' &&
    dm.entry.type === 'user-prompt' &&
    dm.entry.value.trim() !== ''
  );
}

function isResultMessage(
  dm: DisplayMessage,
): dm is { kind: 'entry'; entry: NormalizedEntry & { type: 'result' } } {
  return dm.kind === 'entry' && dm.entry.type === 'result';
}

function parseDateMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function computeGroupDuration(
  promptEntry: NormalizedEntry,
  resultEntry: NormalizedEntry,
): number | undefined {
  // Prefer the result's own durationMs if available
  if (
    resultEntry.type === 'result' &&
    typeof resultEntry.durationMs === 'number' &&
    Number.isFinite(resultEntry.durationMs) &&
    resultEntry.durationMs >= 0
  ) {
    return resultEntry.durationMs;
  }
  // Fall back to timestamp difference
  const startMs = parseDateMs(promptEntry.date);
  const endMs = parseDateMs(resultEntry.date);
  if (startMs !== undefined && endMs !== undefined && endMs >= startMs) {
    return endMs - startMs;
  }
  return undefined;
}

/**
 * Group display messages by user prompts.
 * Each user-prompt starts a new PromptGroup that collects all following messages
 * until the next user-prompt. A result entry marks the group as complete, but
 * later trailing messages still stay attached to that same group.
 *
 * Messages before the first prompt pass through as standalone DisplayMessages.
 *
 * @param isRunning Whether the task is currently running (affects last group status)
 */
export function groupByPrompts(
  displayMessages: DisplayMessage[],
  isRunning?: boolean,
): StreamMessage[] {
  const result: StreamMessage[] = [];
  let currentGroup: PromptGroup | null = null;

  function finalizeCurrentGroup({
    hasNextPrompt,
  }: {
    hasNextPrompt: boolean;
  }): void {
    if (!currentGroup) return;

    if (!currentGroup.resultEntry) {
      const completedWithoutResult = hasAssistantCompletionMessage(
        currentGroup.childMessages,
      );

      currentGroup.status = completedWithoutResult
        ? 'completed'
        : hasNextPrompt
          ? 'interrupted'
          : isRunning
            ? 'running'
            : 'interrupted';
    }

    result.push(currentGroup);
    currentGroup = null;
  }

  for (const dm of displayMessages) {
    // A user prompt starts a new group
    if (isUserPromptMessage(dm)) {
      // Finalize previous group if any
      finalizeCurrentGroup({ hasNextPrompt: true });

      currentGroup = {
        kind: 'prompt-group',
        promptEntry: dm.entry as NormalizedEntry & { type: 'user-prompt' },
        childMessages: [],
        status: 'running', // will be finalized when result is found
      };
      continue;
    }

    // A result entry marks the current group as complete
    if (isResultMessage(dm) && currentGroup) {
      const resultEntry = dm.entry as NormalizedEntry & { type: 'result' };
      currentGroup.resultEntry = resultEntry;
      currentGroup.durationMs = computeGroupDuration(
        currentGroup.promptEntry,
        resultEntry,
      );
      currentGroup.status = resultEntry.isError ? 'error' : 'completed';
      continue;
    }

    // Compacting belongs inside current group (it happens during an agent turn)
    if (dm.kind === 'compacting') {
      if (currentGroup) {
        currentGroup.childMessages.push(dm);
      } else {
        result.push(dm);
      }
      continue;
    }

    // Inside a group: collect as child
    if (currentGroup) {
      currentGroup.childMessages.push(dm);
      continue;
    }

    // No active group: pass through standalone
    result.push(dm);
  }

  // Finalize last group if still open
  finalizeCurrentGroup({ hasNextPrompt: false });

  return result;
}
