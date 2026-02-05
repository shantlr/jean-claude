import type {
  AgentMessage,
  CompactMetadata,
  ToolUseBlock,
} from '../../../../shared/agent-types';
import { isSkillToolUseResult } from '../../../../shared/agent-types';

/**
 * Represents a message ready for display in the timeline.
 * Can be either a regular message, a merged skill message, a compacting message, or a sub-agent group.
 */
export type DisplayMessage =
  | { kind: 'regular'; message: AgentMessage }
  | {
      kind: 'skill';
      launchMessage: AgentMessage;
      promptMessage: AgentMessage;
      skillName: string;
    }
  | {
      kind: 'compacting';
      startMessage: AgentMessage;
      endMessage?: AgentMessage;
      metadata?: CompactMetadata;
    }
  | {
      kind: 'subagent';
      toolUseId: string;
      launchBlock: ToolUseBlock;
      launchMessage: AgentMessage;
      childMessages: AgentMessage[];
      isComplete: boolean;
    };

/**
 * Check if a message is a skill launch message.
 * Skill launch messages have a tool_use_result with commandName.
 */
function isSkillLaunchMessage(message: AgentMessage): boolean {
  return (
    message.type === 'user' &&
    !!message.tool_use_result &&
    isSkillToolUseResult(message.tool_use_result) &&
    typeof message.tool_use_result.commandName === 'string'
  );
}

/**
 * Check if a message is a synthetic skill prompt message.
 * These are SDK-generated messages containing skill documentation.
 */
function isSyntheticMessage(message: AgentMessage): boolean {
  return message.type === 'user' && message.isSynthetic === true;
}

/**
 * Check if a message is a compacting start message.
 * {type: "system", subtype: "status", status: "compacting", ...}
 */
function isCompactingStartMessage(message: AgentMessage): boolean {
  return (
    message.type === 'system' &&
    message.subtype === 'status' &&
    message.status === 'compacting'
  );
}

/**
 * Check if a message is a compact boundary (end) message.
 * {type: "system", subtype: "compact_boundary", compact_metadata: {...}, ...}
 */
function isCompactBoundaryMessage(message: AgentMessage): boolean {
  return message.type === 'system' && message.subtype === 'compact_boundary';
}

/**
 * Extract Task tool_use blocks from an assistant message.
 */
function extractTaskToolUseBlocks(
  message: AgentMessage,
): { block: ToolUseBlock; message: AgentMessage }[] {
  if (
    message.type !== 'assistant' ||
    !message.message ||
    message.message.role !== 'assistant'
  ) {
    return [];
  }

  return message.message.content
    .filter(
      (block): block is ToolUseBlock =>
        block.type === 'tool_use' && block.name === 'Task',
    )
    .map((block) => ({ block, message }));
}

/**
 * Check if a message belongs to a sub-agent (has parent_tool_use_id).
 */
function isSubagentMessage(message: AgentMessage): boolean {
  return !!message.parent_tool_use_id;
}

/**
 * Find the tool_result for a given tool_use_id in the messages.
 */
function findToolResult(messages: AgentMessage[], toolUseId: string): boolean {
  for (const message of messages) {
    if (message.type === 'user' && message.message) {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id === toolUseId) {
            return true;
          }
        }
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
 * 1. Current message has tool_use_result.commandName (skill launch)
 * 2. Next message has isSynthetic: true (synthetic skill prompt)
 * 3. Both conditions must be true to merge
 *
 * Detection logic for compacting:
 * 1. Current message is {type: "system", subtype: "status", status: "compacting"}
 * 2. Look ahead for {type: "system", subtype: "compact_boundary"} with same session_id
 * 3. If found, merge into single compacting entry with metadata
 * 4. If not found, show as in-progress compacting
 *
 * Detection logic for sub-agents:
 * 1. Find assistant messages with Task tool_use blocks
 * 2. Collect all messages with matching parent_tool_use_id
 * 3. Group them into a single subagent entry
 */
export function mergeSkillMessages(messages: AgentMessage[]): DisplayMessage[] {
  const result: DisplayMessage[] = [];
  const processedIndices = new Set<number>();

  // First pass: collect all Task tool_use blocks and their indices
  const taskToolUses = new Map<
    string,
    { block: ToolUseBlock; launchMessage: AgentMessage; messageIndex: number }
  >();
  for (let i = 0; i < messages.length; i++) {
    const taskBlocks = extractTaskToolUseBlocks(messages[i]);
    for (const { block, message } of taskBlocks) {
      taskToolUses.set(block.id, {
        block,
        launchMessage: message,
        messageIndex: i,
      });
    }
  }

  // Second pass: collect child messages for each Task tool_use
  const childMessagesByToolUseId = new Map<
    string,
    { message: AgentMessage; index: number }[]
  >();
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (isSubagentMessage(message) && message.parent_tool_use_id) {
      const parentId = message.parent_tool_use_id;
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
        skillName:
          current.tool_use_result &&
          isSkillToolUseResult(current.tool_use_result)
            ? current.tool_use_result.commandName
            : '',
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
        const candidate = messages[j];
        if (
          isCompactBoundaryMessage(candidate) &&
          candidate.session_id === current.session_id
        ) {
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
          metadata: endMessage.compact_metadata,
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

    // Check if this message contains Task tool_use blocks
    const taskBlocks = extractTaskToolUseBlocks(current);
    if (taskBlocks.length > 0) {
      // For messages with Task tool_use, we need to handle them specially
      // The message itself might have text blocks and multiple tool_use blocks
      // We'll render non-Task content as regular, and each Task as a subagent entry

      // First, check if there are non-Task content blocks
      const hasNonTaskContent =
        current.message?.role === 'assistant' &&
        current.message.content.some(
          (block) =>
            (block.type === 'text' && block.text.trim()) ||
            (block.type === 'tool_use' && block.name !== 'Task'),
        );

      if (hasNonTaskContent) {
        // Render the regular message (non-Task parts will be shown)
        // But we need a modified version that excludes Task tool_use blocks
        // For simplicity, we render the whole message - the timeline entry
        // will show text and non-Task tools, and we add subagent entries after
        result.push({ kind: 'regular', message: current });
      }

      // Add subagent entries for each Task tool_use
      for (const { block } of taskBlocks) {
        const children = childMessagesByToolUseId.get(block.id) || [];
        const childMessages = children.map((c) => c.message);
        const isComplete = findToolResult(messages, block.id);

        result.push({
          kind: 'subagent',
          toolUseId: block.id,
          launchBlock: block,
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
