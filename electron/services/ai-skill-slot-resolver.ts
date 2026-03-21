import {
  isAiSkillSlotsSetting,
  type AiSkillSlotConfig,
  type AiSkillSlotKey,
  type AiSkillSlotsSetting,
} from '@shared/types';

import { SettingsRepository } from '../database/repositories/settings';

/**
 * Resolves an AI skill slot configuration.
 *
 * Resolution order:
 * 1. Project-level override (if provided and valid)
 * 2. Global setting
 * 3. undefined (feature disabled)
 */
export async function resolveAiSkillSlot(
  slotKey: AiSkillSlotKey,
  projectSlots: AiSkillSlotsSetting | null | undefined,
): Promise<AiSkillSlotConfig | undefined> {
  // 1. Check project override (validate in case of corrupted data)
  if (projectSlots && isAiSkillSlotsSetting(projectSlots)) {
    if (projectSlots[slotKey] !== undefined) {
      return projectSlots[slotKey];
    }
  }

  // 2. Check global setting (SettingsRepository.get already validates)
  const globalSlots = await SettingsRepository.get('aiSkillSlots');
  if (globalSlots[slotKey] !== undefined) {
    return globalSlots[slotKey];
  }

  // 3. Not configured
  return undefined;
}
