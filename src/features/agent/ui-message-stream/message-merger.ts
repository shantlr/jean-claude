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
      latestChildEntryDate?: string;
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
      latestChildEntryDate?: string;
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

export interface PromptNavigationItem {
  index: number;
  text: string;
}

export interface MessageStreamProcessingCache {
  entries: NormalizedEntry[];
  isRunning?: boolean;
  streamMessages: StreamMessage[];
  promptIndexMap: Map<number, number>;
  promptNavigationItems: PromptNavigationItem[];
  lastPromptGroupIndex: number;
}

export interface MessageStreamProcessingResult {
  streamMessages: StreamMessage[];
  promptIndexMap: Map<number, number>;
  promptNavigationItems: PromptNavigationItem[];
  lastPromptGroupIndex: number;
  cache: MessageStreamProcessingCache;
}

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

function getLatestEntryDate(
  latest: { date: string; ms: number } | null,
  entry: NormalizedEntry,
): { date: string; ms: number } | null {
  const ms = parseDateMs(entry.date);
  if (ms === undefined || (latest && ms <= latest.ms)) return latest;

  return { date: entry.date, ms };
}

function getLatestChildEntryDate(
  toolId: string,
  childEntriesByToolId: Map<
    string,
    { entry: NormalizedEntry; index: number }[]
  >,
  visited = new Set<string>(),
): string | undefined {
  if (visited.has(toolId)) return undefined;

  visited.add(toolId);

  let latest: { date: string; ms: number } | null = null;
  const children = childEntriesByToolId.get(toolId) ?? [];

  for (const { entry } of children) {
    latest = getLatestEntryDate(latest, entry);

    if (entry.type !== 'tool-use') continue;

    const childDate = getLatestChildEntryDate(
      entry.toolId,
      childEntriesByToolId,
      visited,
    );
    const childMs = parseDateMs(childDate);
    if (childDate && childMs !== undefined && (!latest || childMs > latest.ms)) {
      latest = { date: childDate, ms: childMs };
    }
  }

  return latest?.date;
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
        latestChildEntryDate: getLatestChildEntryDate(
          current.toolId,
          childEntriesByToolId,
        ),
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
        latestChildEntryDate: getLatestChildEntryDate(
          current.toolId,
          childEntriesByToolId,
        ),
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

function isNonEmptyUserPromptEntry(
  entry: NormalizedEntry | undefined,
): entry is NormalizedEntry & { type: 'user-prompt' } {
  return entry?.type === 'user-prompt' && entry.value.trim() !== '';
}

function findCommonPrefixLength(
  previous: NormalizedEntry[],
  next: NormalizedEntry[],
): number {
  const max = Math.min(previous.length, next.length);
  for (let i = 0; i < max; i++) {
    if (previous[i] !== next[i]) return i;
  }
  return max;
}

function findCheckpointIndex(
  entries: NormalizedEntry[],
  changedIndex: number,
): number {
  for (let i = Math.min(changedIndex, entries.length - 1); i >= 0; i--) {
    if (isNonEmptyUserPromptEntry(entries[i])) return i;
  }
  return 0;
}

function findStreamIndexForPrompt(
  streamMessages: StreamMessage[],
  promptId: string,
): number {
  return streamMessages.findIndex(
    (message) =>
      message.kind === 'prompt-group' && message.promptEntry.id === promptId,
  );
}

function buildPromptIndexMetadata(streamMessages: StreamMessage[]): {
  promptIndexMap: Map<number, number>;
  promptNavigationItems: PromptNavigationItem[];
  lastPromptGroupIndex: number;
} {
  const promptIndexMap = new Map<number, number>();
  const promptNavigationItems: PromptNavigationItem[] = [];
  let counter = 0;
  let lastPromptGroupIndex = -1;

  for (let i = 0; i < streamMessages.length; i++) {
    const message = streamMessages[i];
    if (message.kind === 'prompt-group') {
      const text = message.promptEntry.value.trim();
      promptIndexMap.set(i, counter);
      if (text) promptNavigationItems.push({ index: counter, text });
      counter++;
      lastPromptGroupIndex = i;
    } else if (
      message.kind === 'entry' &&
      isNonEmptyUserPromptEntry(message.entry)
    ) {
      promptIndexMap.set(i, counter);
      promptNavigationItems.push({
        index: counter,
        text: message.entry.value.trim(),
      });
      counter++;
    } else if (message.kind === 'skill') {
      promptIndexMap.set(i, counter);
      const skillPrompt =
        message.promptEntry?.type === 'user-prompt'
          ? message.promptEntry.value.trim()
          : '';
      const text =
        skillPrompt ||
        `Use skill ${
          'skillName' in message.skillToolUse
            ? message.skillToolUse.skillName
            : 'unknown'
        }`;
      promptNavigationItems.push({ index: counter, text });
      counter++;
    }
  }

  return { promptIndexMap, promptNavigationItems, lastPromptGroupIndex };
}

function reusePromptNavigationItemsIfEqual(
  next: PromptNavigationItem[],
  previous?: PromptNavigationItem[],
): PromptNavigationItem[] {
  if (!previous || previous.length !== next.length) return next;

  for (let i = 0; i < next.length; i++) {
    if (
      previous[i].index !== next[i].index ||
      previous[i].text !== next[i].text
    ) {
      return next;
    }
  }

  return previous;
}

function buildMessageStream(
  entries: NormalizedEntry[],
  isRunning?: boolean,
): StreamMessage[] {
  return groupByPrompts(mergeSkillMessages(entries), isRunning);
}

function areDisplayMessagesEqual(
  a: DisplayMessage,
  b: DisplayMessage,
): boolean {
  if (a.kind !== b.kind) return false;

  if (a.kind === 'entry' && b.kind === 'entry') {
    return a.entry === b.entry;
  }

  if (a.kind === 'skill' && b.kind === 'skill') {
    return (
      a.skillToolUse === b.skillToolUse &&
      a.promptEntry === b.promptEntry &&
      areEntriesEqual(a.childEntries, b.childEntries) &&
      a.latestChildEntryDate === b.latestChildEntryDate
    );
  }

  if (a.kind === 'compacting' && b.kind === 'compacting') {
    return a.startEntry === b.startEntry && a.endEntry === b.endEntry;
  }

  if (a.kind === 'subagent' && b.kind === 'subagent') {
    return (
      a.toolUse === b.toolUse &&
      areEntriesEqual(a.childEntries, b.childEntries) &&
      a.latestChildEntryDate === b.latestChildEntryDate
    );
  }

  return false;
}

function areEntriesEqual(a: NormalizedEntry[], b: NormalizedEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areDisplayMessageArraysEqual(
  a: DisplayMessage[],
  b: DisplayMessage[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!areDisplayMessagesEqual(a[i], b[i])) return false;
  }
  return true;
}

function arePromptGroupsEqual(a: PromptGroup, b: PromptGroup): boolean {
  return (
    a.promptEntry === b.promptEntry &&
    a.resultEntry === b.resultEntry &&
    a.durationMs === b.durationMs &&
    a.status === b.status &&
    areDisplayMessageArraysEqual(a.childMessages, b.childMessages)
  );
}

function reuseUnchangedStreamMessages(
  next: StreamMessage[],
  previous?: StreamMessage[],
): StreamMessage[] {
  if (!previous || previous.length === 0) return next;

  const previousPromptGroups = new Map<string, PromptGroup>();
  for (const message of previous) {
    if (message.kind === 'prompt-group') {
      previousPromptGroups.set(message.promptEntry.id, message);
    }
  }

  let didReuse = false;
  const reused = next.map((message, index) => {
    const previousMessage = previous[index];

    if (message.kind === 'prompt-group') {
      const previousGroup = previousPromptGroups.get(message.promptEntry.id);
      if (previousGroup && arePromptGroupsEqual(previousGroup, message)) {
        didReuse = true;
        return previousGroup;
      }
      return message;
    }

    if (
      previousMessage &&
      previousMessage.kind !== 'prompt-group' &&
      areDisplayMessagesEqual(previousMessage, message)
    ) {
      didReuse = true;
      return previousMessage;
    }

    return message;
  });

  return didReuse ? reused : next;
}

function hasGlobalMergeDependency(entry: NormalizedEntry): boolean {
  return (
    !!entry.parentToolId ||
    getEditedFilePaths(entry).length > 0 ||
    entry.type === 'file-edited'
  );
}

function shouldRebuildMessageStream(
  entries: NormalizedEntry[],
  changedIndex: number,
): boolean {
  return entries.slice(changedIndex).some(hasGlobalMergeDependency);
}

export function processMessageStream(
  entries: NormalizedEntry[],
  isRunning?: boolean,
  previousCache?: MessageStreamProcessingCache,
): MessageStreamProcessingResult {
  let streamMessages: StreamMessage[];

  if (
    entries.length === 0 ||
    !previousCache ||
    entries.length < previousCache.entries.length
  ) {
    streamMessages = buildMessageStream(entries, isRunning);
  } else {
    const commonPrefixLength = findCommonPrefixLength(
      previousCache.entries,
      entries,
    );

    if (
      commonPrefixLength === entries.length &&
      previousCache.isRunning === isRunning
    ) {
      return { ...previousCache, cache: previousCache };
    }

    if (shouldRebuildMessageStream(entries, commonPrefixLength)) {
      streamMessages = buildMessageStream(entries, isRunning);
    } else {
      const checkpointIndex = findCheckpointIndex(entries, commonPrefixLength);
      const checkpointEntry = entries[checkpointIndex];
      const checkpointStreamIndex = isNonEmptyUserPromptEntry(checkpointEntry)
        ? findStreamIndexForPrompt(
            previousCache.streamMessages,
            checkpointEntry.id,
          )
        : -1;

      if (checkpointStreamIndex >= 0) {
        streamMessages = [
          ...previousCache.streamMessages.slice(0, checkpointStreamIndex),
          ...buildMessageStream(entries.slice(checkpointIndex), isRunning),
        ];
      } else {
        streamMessages = buildMessageStream(entries, isRunning);
      }
    }
  }

  streamMessages = reuseUnchangedStreamMessages(
    streamMessages,
    previousCache?.streamMessages,
  );

  const { promptIndexMap, lastPromptGroupIndex, promptNavigationItems } =
    buildPromptIndexMetadata(streamMessages);
  const stablePromptNavigationItems = reusePromptNavigationItemsIfEqual(
    promptNavigationItems,
    previousCache?.promptNavigationItems,
  );
  const cache: MessageStreamProcessingCache = {
    entries,
    isRunning,
    streamMessages,
    promptIndexMap,
    promptNavigationItems: stablePromptNavigationItems,
    lastPromptGroupIndex,
  };

  return {
    streamMessages,
    promptIndexMap,
    promptNavigationItems: stablePromptNavigationItems,
    lastPromptGroupIndex,
    cache,
  };
}
