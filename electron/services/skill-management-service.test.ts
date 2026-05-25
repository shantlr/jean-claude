import * as fs from 'fs/promises';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

import {
  createSkill,
  getAllManagedSkills,
  getAllManagedSkillsUnified,
} from './skill-management-service';

async function writeSkill({
  projectPath,
  relativeDir,
  dirName,
  name,
}: {
  projectPath: string;
  relativeDir: string;
  dirName: string;
  name: string;
}): Promise<string> {
  const skillDir = path.join(projectPath, relativeDir, dirName);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} description\n---\n\n${name} body\n`,
    'utf-8',
  );
  return skillDir;
}

describe('skill management project skill discovery', () => {
  it('discovers repo .claude skills for opencode', async () => {
    const projectPath = '/project';
    const skillDir = await writeSkill({
      projectPath,
      relativeDir: '.claude/skills',
      dirName: 'repo-claude-skill',
      name: 'repo-claude-skill',
    });

    const skills = await getAllManagedSkills({
      backendType: 'opencode',
      projectPath,
    });

    expect(skills).toContainEqual(
      expect.objectContaining({
        name: 'repo-claude-skill',
        source: 'project',
        skillPath: skillDir,
        enabledBackends: { opencode: true },
      }),
    );
  });

  it('creates opencode project skills in .opencode skills', async () => {
    const projectPath = '/project';

    const skill = await createSkill({
      enabledBackends: ['opencode'],
      scope: 'project',
      projectPath,
      name: 'native opencode skill',
      description: 'Native OpenCode skill',
      content: 'Use native OpenCode project skill path.',
    });

    expect(skill.skillPath).toBe(
      path.join(projectPath, '.opencode/skills/native-opencode-skill'),
    );
  });

  it('marks .claude project skills enabled for both claude-code and opencode', async () => {
    const projectPath = '/project';
    const skillDir = await writeSkill({
      projectPath,
      relativeDir: '.claude/skills',
      dirName: 'shared-project-skill',
      name: 'shared-project-skill',
    });

    const skills = await getAllManagedSkillsUnified({ projectPath });
    const skill = skills.find((item) => item.skillPath === skillDir);

    expect(skill?.enabledBackends).toEqual({
      'claude-code': true,
      opencode: true,
    });
  });
});
