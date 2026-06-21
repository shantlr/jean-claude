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
  if (project.mode === 'inherit') {
    return global;
  }

  if (project.mode === 'override') {
    return {
      text: project.text,
      placement: project.placement,
      frequency: project.frequency,
    };
  }

  const globalText = global.text.trim();
  const projectText = project.text.trim();
  if (!projectText) return global;
  if (!globalText) {
    return {
      text: projectText,
      placement: project.placement,
      frequency: project.frequency,
    };
  }

  return {
    text: `${globalText}\n\n${projectText}`,
    placement: project.placement,
    frequency: project.frequency,
  };
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
  const [global, project] = await Promise.all([
    SettingsRepository.get('promptPreface'),
    readProjectPromptPreface(projectPath),
  ]);
  const effective = mergePromptPreface({ global, project });

  if (effective.frequency === 'initial' && !isInitialPrompt) {
    return parts;
  }

  return applyPromptPrefaceToParts({ parts, preface: effective });
}
