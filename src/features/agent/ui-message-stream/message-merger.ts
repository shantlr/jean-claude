import type {
  AgentMessage,
  CompactMetadata,
} from '../../../../shared/agent-types';
import { isSkillToolUseResult } from '../../../../shared/agent-types';

/**
 * Represents a message ready for display in the timeline.
 * Can be either a regular message, a merged skill message, or a compacting message.
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
 * Merge consecutive skill launch + skill prompt messages into single display entries.
 * Also merge compacting status + compact_boundary messages.
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
 */
export function mergeSkillMessages(messages: AgentMessage[]): DisplayMessage[] {
  const result: DisplayMessage[] = [];
  const processedIndices = new Set<number>();

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

    // Regular message
    result.push({ kind: 'regular', message: current });
    processedIndices.add(i);
  }

  return result;
}
