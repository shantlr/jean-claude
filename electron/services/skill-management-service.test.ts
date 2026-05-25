import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

import {
  createSkill,
  executeLegacySkillMigration,
  getAllManagedSkills,
  getAllManagedSkillsUnified,
  previewLegacySkillMigration,
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

describe('legacy skill migration', () => {
  it('previews companion files in migratable skill folders', async () => {
    const legacyDir = path.join(os.homedir(), '.claude/skills/rich-skill');
    await fs.mkdir(path.join(legacyDir, 'resources'), { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, 'SKILL.md'),
      '---\nname: rich-skill\ndescription: Rich skill\n---\n\nUse companions.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(legacyDir, 'AGENTS.md'),
      'Extra instructions\n',
      'utf-8',
    );

    const preview = await previewLegacySkillMigration();
    const item = preview.items.find((entry) => entry.name === 'rich-skill');

    expect(item).toEqual(
      expect.objectContaining({
        legacyPath: legacyDir,
        status: 'migrate',
        folderEntries: expect.arrayContaining([
          { name: 'AGENTS.md', type: 'file' },
          { name: 'SKILL.md', type: 'file' },
          { name: 'resources', type: 'directory' },
        ]),
      }),
    );
  });

  it('copies companion files when executing migration', async () => {
    const legacyDir = path.join(os.homedir(), '.claude/skills/rich-skill');
    const canonicalDir = path.join(
      os.homedir(),
      '.config/jean-claude/skills/user/rich-skill',
    );
    await fs.mkdir(path.join(legacyDir, 'resources'), { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, 'SKILL.md'),
      '---\nname: rich-skill\ndescription: Rich skill\n---\n\nUse companions.\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(legacyDir, 'AGENTS.md'),
      'Extra instructions\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(legacyDir, 'resources/example.md'),
      'Example\n',
      'utf-8',
    );

    const preview = await previewLegacySkillMigration();
    const item = preview.items.find((entry) => entry.name === 'rich-skill');
    expect(item).toBeDefined();

    const result = await executeLegacySkillMigration({
      itemIds: [item!.id],
    });

    expect(result.results).toContainEqual(
      expect.objectContaining({ name: 'rich-skill', status: 'migrated' }),
    );
    await expect(
      fs.readFile(path.join(canonicalDir, 'AGENTS.md'), 'utf-8'),
    ).resolves.toBe('Extra instructions\n');
    await expect(
      fs.readFile(path.join(canonicalDir, 'resources/example.md'), 'utf-8'),
    ).resolves.toBe('Example\n');
  });
});
