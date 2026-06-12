import type { AiSkillSlotsSetting } from '@shared/types';

import { ProjectRepository } from '../database/repositories/projects';
import { dbg } from '../lib/debug';

import { generateText } from './ai-generation-service';
import { resolveAiSkillSlot } from './ai-skill-slot-resolver';

const PROJECT_SUMMARY_TIMEOUT_MS = 10 * 60 * 1000;
const PROJECT_SUMMARY_MAX_LENGTH = 240;

const PROJECT_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', maxLength: PROJECT_SUMMARY_MAX_LENGTH },
  },
  required: ['summary'],
} as const;

export async function generateProjectSummary({
  project,
}: {
  project: {
    name: string;
    id?: string;
    path: string;
    color: string;
    aiSkillSlots?: AiSkillSlotsSetting | null;
  };
}): Promise<string | null> {
  try {
    const slotConfig = await resolveAiSkillSlot(
      'project-summary',
      project.aiSkillSlots,
    );
    const backend = slotConfig?.backend ?? 'claude-code';
    const model = slotConfig?.model ?? 'haiku';
    const skillName = slotConfig?.skillName ?? undefined;
    const prompt = buildProjectSummaryPrompt({
      project,
      includeRequirements: !slotConfig?.skillName,
    });

    const result = await generateText({
      backend,
      model,
      skillName,
      cwd: project.path,
      allowedTools: ['Read'],
      outputSchema: PROJECT_SUMMARY_SCHEMA,
      timeoutMs: PROJECT_SUMMARY_TIMEOUT_MS,
      prompt,
      usageContext: {
        feature: 'project-summary',
        projectId: project.id ?? null,
        taskId: null,
        stepId: null,
      },
    });

    const summary = extractProjectSummary(result);
    if (summary) dbg.agent('Generated project summary: %s', summary);
    return summary;
  } catch (error) {
    dbg.agent('Failed to generate project summary: %O', error);
    return null;
  }
}

export async function regenerateProjectSummary(projectId: string) {
  const project = await ProjectRepository.findById(projectId);
  if (!project) throw new Error('Project not found');

  const summary = await generateProjectSummary({ project });
  if (!summary) throw new Error('Failed to generate project summary');

  return ProjectRepository.update(projectId, { summary });
}

function buildProjectSummaryPrompt({
  project,
  includeRequirements,
}: {
  project: {
    name: string;
    path: string;
    color: string;
  };
  includeRequirements: boolean;
}): string {
  const projectDetails = `Project name: ${project.name}
Repository path: ${project.path}
Brand color: ${project.color}`;

  if (!includeRequirements) return projectDetails;

  return `Write one short product summary for this software project.

${projectDetails}

Requirements:
- One sentence fragment or short sentence.
- Describe what the app/tool likely does.
- Mention domain/context if inferable from name/path.
- No marketing adjectives, no logo directions, no markdown.`;
}

function extractProjectSummary(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('summary' in value)) return null;
  const summary = (value as { summary: unknown }).summary;
  if (typeof summary !== 'string') return null;
  const normalized = summary.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, PROJECT_SUMMARY_MAX_LENGTH) : null;
}
