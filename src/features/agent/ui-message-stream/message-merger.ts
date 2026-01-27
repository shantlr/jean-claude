import type { AgentMessage } from '../../../../shared/agent-types';

/**
 * Represents a message ready for display in the timeline.
 * Can be either a regular message or a merged skill message.
 */
export type DisplayMessage =
  | { kind: 'regular'; message: AgentMessage }
  | {
      kind: 'skill';
      launchMessage: AgentMessage;
      promptMessage: AgentMessage;
      skillName: string;
    };

/**
 * Check if a message is a skill launch message.
 * Skill launch messages have a tool_use_result with commandName.
 */
function isSkillLaunchMessage(message: AgentMessage): boolean {
  return (
    message.type === 'user' &&
    typeof message.tool_use_result?.commandName === 'string'
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
 * Merge consecutive skill launch + skill prompt messages into single display entries.
 *
 * Detection logic:
 * 1. Current message has tool_use_result.commandName (skill launch)
 * 2. Next message has isSynthetic: true (synthetic skill prompt)
 * 3. Both conditions must be true to merge
 */
export function mergeSkillMessages(messages: AgentMessage[]): DisplayMessage[] {
  const result: DisplayMessage[] = [];
  let i = 0;

  while (i < messages.length) {
    const current = messages[i];
    const next = messages[i + 1];

    // Check for skill launch + synthetic prompt pair
    if (isSkillLaunchMessage(current) && next && isSyntheticMessage(next)) {
      result.push({
        kind: 'skill',
        launchMessage: current,
        promptMessage: next,
        skillName: current.tool_use_result!.commandName,
      });
      i += 2; // Skip both messages
    } else {
      result.push({ kind: 'regular', message: current });
      i += 1;
    }
  }

  return result;
}
