import {
  applyPromptPrefaceToParts,
  type ProjectPromptPrefaceSetting,
  type PromptPrefaceSetting,
} from '@shared/prompt-preface-types';
import type { PromptPart } from '@shared/agent-backend-types';


import { SettingsRepository } from '../database/repositories/settings';

import { readProjectPromptPreface } from './permission-settings-service';

function mergePromptPreface({
  global,
  project,
}: {
  global: PromptPrefaceSetting;
  project: ProjectPromptPrefaceSetting;
}): PromptPrefaceSetting {
  return project.mode === 'override' ? project.entries : global;
}

export async function applyConfiguredPromptPreface({
  parts,
  projectPath,
  isInitialPrompt,
}: {
  parts: PromptPart[];
  projectPath: string;
  isInitialPrompt: boolean;
}): Promise<PromptPart[]> {
  const global = await SettingsRepository.get('promptPreface');
  const project = await readProjectPromptPreface(projectPath, global);
  const effective = mergePromptPreface({ global, project });
  return applyPromptPrefaceToParts({
    parts,
    entries: effective,
    isInitialPrompt,
  });
}
