import type {
  NormalizedMessage,
  NormalizedCompactPart,
  NormalizedToolUsePart,
} from '@shared/agent-backend-types';
import { isStructuredSkillResult } from '@shared/agent-backend-types';

/**
 * Represents a message ready for display in the timeline.
 * Can be either a regular message, a merged skill message, a compacting message, or a sub-agent group.
 */
export type DisplayMessage =
  | { kind: 'regular'; message: NormalizedMessage }
  | {
      kind: 'skill';
      launchMessage: NormalizedMessage;
      promptMessage: NormalizedMessage;
      skillName: string;
    }
  | {
      kind: 'compacting';
      startMessage: NormalizedMessage;
      endMessage?: NormalizedMessage;
      metadata?: NormalizedCompactPart;
    }
  | {
      kind: 'subagent';
      toolUseId: string;
      launchBlock: NormalizedToolUsePart;
      launchMessage: NormalizedMessage;
      childMessages: NormalizedMessage[];
      isComplete: boolean;
    };

/**
 * Check if a message is a skill launch message.
 * Skill launch messages are user messages with a tool-result part that has a skill structuredResult.
 */
function isSkillLaunchMessage(message: NormalizedMessage): boolean {
  if (message.role !== 'user') return false;
  return message.parts.some(
    (p) =>
      p.type === 'tool-result' &&
      p.structuredResult &&
      isStructuredSkillResult(p.structuredResult),
  );
}

/**
 * Get the skill command name from a skill launch message.
 */
function getSkillName(message: NormalizedMessage): string {
  for (const part of message.parts) {
    if (
      part.type === 'tool-result' &&
      part.structuredResult &&
      isStructuredSkillResult(part.structuredResult)
    ) {
      return part.structuredResult.commandName;
    }
  }
  return '';
}

/**
 * Check if a message is a synthetic skill prompt message.
 * These are SDK-generated messages containing skill documentation.
 */
function isSyntheticMessage(message: NormalizedMessage): boolean {
  return message.role === 'user' && message.isSynthetic === true;
}

/**
 * Check if a message is a compacting start message.
 * A system message with a system-status part where status === 'compacting'.
 */
function isCompactingStartMessage(message: NormalizedMessage): boolean {
  if (message.role !== 'system') return false;
  return message.parts.some(
    (p) =>
      p.type === 'system-status' &&
      p.subtype === 'status' &&
      p.status === 'compacting',
  );
}

/**
 * Check if a message is a compact boundary (end) message.
 * A system message with a compact part.
 */
function isCompactBoundaryMessage(message: NormalizedMessage): boolean {
  if (message.role !== 'system') return false;
  return message.parts.some((p) => p.type === 'compact');
}

/**
 * Get the compact metadata from a compact boundary message.
 */
function getCompactMetadata(
  message: NormalizedMessage,
): NormalizedCompactPart | undefined {
  for (const part of message.parts) {
    if (part.type === 'compact') return part;
  }
  return undefined;
}

/**
 * Extract Task tool-use parts from an assistant message.
 */
function extractTaskToolUseParts(
  message: NormalizedMessage,
): { part: NormalizedToolUsePart; message: NormalizedMessage }[] {
  if (message.role !== 'assistant') return [];

  return message.parts
    .filter(
      (p): p is NormalizedToolUsePart =>
        p.type === 'tool-use' && p.toolName === 'Task',
    )
    .map((part) => ({ part, message }));
}

/**
 * Check if a message belongs to a sub-agent (has parentToolUseId).
 */
function isSubagentMessage(message: NormalizedMessage): boolean {
  return !!message.parentToolUseId;
}

/**
 * Find the tool-result for a given tool_use_id in the messages.
 */
function findToolResult(
  messages: NormalizedMessage[],
  toolUseId: string,
): boolean {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const part of message.parts) {
      if (part.type === 'tool-result' && part.toolId === toolUseId) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Merge consecutive skill launch + skill prompt messages into single display entries.
 * Also merge compacting status + compact_boundary messages.
 * Also group sub-agent messages under their parent Task tool_use.
 *
 * Detection logic for skills:
 * 1. Current message has a tool-result part with skill structuredResult
 * 2. Next message has isSynthetic: true (synthetic skill prompt)
 * 3. Both conditions must be true to merge
 *
 * Detection logic for compacting:
 * 1. Current message is system with system-status part (status: 'compacting')
 * 2. Look ahead for system message with compact part
 * 3. If found, merge into single compacting entry with metadata
 * 4. If not found, show as in-progress compacting
 *
 * Detection logic for sub-agents:
 * 1. Find assistant messages with Task tool-use parts
 * 2. Collect all messages with matching parentToolUseId
 * 3. Group them into a single subagent entry
 */
export function mergeSkillMessages(
  messages: NormalizedMessage[],
): DisplayMessage[] {
  const result: DisplayMessage[] = [];
  const processedIndices = new Set<number>();

  // First pass: collect all Task tool-use parts and their indices
  const taskToolUses = new Map<
    string,
    {
      part: NormalizedToolUsePart;
      launchMessage: NormalizedMessage;
      messageIndex: number;
    }
  >();
  for (let i = 0; i < messages.length; i++) {
    const taskParts = extractTaskToolUseParts(messages[i]);
    for (const { part, message } of taskParts) {
      taskToolUses.set(part.toolId, {
        part,
        launchMessage: message,
        messageIndex: i,
      });
    }
  }

  // Second pass: collect child messages for each Task tool_use.
  // Only consider a message a sub-agent child if its parentToolUseId matches
  // a known Task tool-use ID. OpenCode sets parentToolUseId on assistant responses
  // to link back to the user message — these are NOT sub-agent children.
  const childMessagesByToolUseId = new Map<
    string,
    { message: NormalizedMessage; index: number }[]
  >();
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (
      isSubagentMessage(message) &&
      message.parentToolUseId &&
      taskToolUses.has(message.parentToolUseId)
    ) {
      const parentId = message.parentToolUseId;
      if (!childMessagesByToolUseId.has(parentId)) {
        childMessagesByToolUseId.set(parentId, []);
      }
      childMessagesByToolUseId.get(parentId)!.push({ message, index: i });
    }
  }

  // Mark sub-agent child messages as processed (they'll be rendered within subagent entries)
  for (const children of childMessagesByToolUseId.values()) {
    for (const { index } of children) {
      processedIndices.add(index);
    }
  }

  for (let i = 0; i < messages.length; i++) {
    if (processedIndices.has(i)) continue;

    const current = messages[i];
    const next = messages[i + 1];

    // Check for skill launch + synthetic prompt pair
    if (
      isSkillLaunchMessage(current) &&
      next &&
      isSyntheticMessage(next) &&
      !processedIndices.has(i + 1)
    ) {
      result.push({
        kind: 'skill',
        launchMessage: current,
        promptMessage: next,
        skillName: getSkillName(current),
      });
      processedIndices.add(i);
      processedIndices.add(i + 1);
      continue;
    }

    // Check for compacting start message
    if (isCompactingStartMessage(current)) {
      // Look for matching compact_boundary in remaining messages
      let endMessageIndex: number | undefined;
      for (let j = i + 1; j < messages.length; j++) {
        if (processedIndices.has(j)) continue;
        if (isCompactBoundaryMessage(messages[j])) {
          endMessageIndex = j;
          break;
        }
      }

      if (endMessageIndex !== undefined) {
        const endMessage = messages[endMessageIndex];
        result.push({
          kind: 'compacting',
          startMessage: current,
          endMessage,
          metadata: getCompactMetadata(endMessage),
        });
        processedIndices.add(i);
        processedIndices.add(endMessageIndex);
      } else {
        // No end message found yet - show as in-progress
        result.push({
          kind: 'compacting',
          startMessage: current,
        });
        processedIndices.add(i);
      }
      continue;
    }

    // Skip orphaned compact_boundary messages (already merged with start)
    if (isCompactBoundaryMessage(current)) {
      processedIndices.add(i);
      continue;
    }

    // Check if this message contains Task tool-use parts
    const taskParts = extractTaskToolUseParts(current);
    if (taskParts.length > 0) {
      // For messages with Task tool_use, we need to handle them specially
      // The message itself might have text parts and multiple tool_use parts
      // We'll render non-Task content as regular, and each Task as a subagent entry

      // First, check if there are non-Task content parts
      const hasNonTaskContent = current.parts.some(
        (p) =>
          (p.type === 'text' && p.text.trim()) ||
          (p.type === 'tool-use' && p.toolName !== 'Task'),
      );

      if (hasNonTaskContent) {
        result.push({ kind: 'regular', message: current });
      }

      // Add subagent entries for each Task tool_use
      for (const { part } of taskParts) {
        const children = childMessagesByToolUseId.get(part.toolId) || [];
        const childMessages = children.map((c) => c.message);
        const isComplete = findToolResult(messages, part.toolId);

        result.push({
          kind: 'subagent',
          toolUseId: part.toolId,
          launchBlock: part,
          launchMessage: current,
          childMessages,
          isComplete,
        });
      }

      processedIndices.add(i);
      continue;
    }

    // Regular message
    result.push({ kind: 'regular', message: current });
    processedIndices.add(i);
  }

  return result;
}
