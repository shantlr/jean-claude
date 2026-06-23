import {
  type AiSkillSlotConfig,
  type AiSkillSlotKey,
  type AiSkillSlotsSetting,
  DEFAULT_PROJECT_FEATURE_MAP_SLOT,
  isAiSkillSlotsSetting,
} from '@shared/types';
import type { AgentBackendType } from '@shared/agent-backend-types';

import { SettingsRepository } from '../database/repositories/settings';

async function normalizeSlotForEnabledBackends(
  slot: AiSkillSlotConfig,
  { preserveSkillOnFallback = false }: { preserveSkillOnFallback?: boolean } = {},
): Promise<AiSkillSlotConfig> {
  const backendsSetting = await SettingsRepository.get('backends');
  if (backendsSetting.enabledBackends.includes(slot.backend)) {
    return slot;
  }

  const fallbackBackend: AgentBackendType = backendsSetting.enabledBackends.includes(
    backendsSetting.defaultBackend,
  )
    ? backendsSetting.defaultBackend
    : (backendsSetting.enabledBackends[0] ?? slot.backend);
  const backendDefaultModels = await SettingsRepository.get(
    'backendDefaultModels',
  );

  return {
    backend: fallbackBackend,
    model: backendDefaultModels.models[fallbackBackend] ?? 'default',
    thinkingEffort: 'default',
    skillName: preserveSkillOnFallback ? slot.skillName : null,
  };
}

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
      return normalizeSlotForEnabledBackends(projectSlots[slotKey]);
    }
  }

  // 2. Check global setting (SettingsRepository.get already validates)
  const globalSlots = await SettingsRepository.get('aiSkillSlots');
  if (globalSlots[slotKey] !== undefined) {
    return normalizeSlotForEnabledBackends(globalSlots[slotKey]);
  }

  if (slotKey === 'project-feature-map') {
    return normalizeSlotForEnabledBackends(DEFAULT_PROJECT_FEATURE_MAP_SLOT, {
      preserveSkillOnFallback: true,
    });
  }

  // 3. Not configured
  return undefined;
}
