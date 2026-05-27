import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

import {
  createAgent,
  disableAgent,
  executeLegacyAgentMigration,
  getAgentContent,
  getAllManagedAgents,
  previewLegacyAgentMigration,
} from './agent-management-service';

async function writeAgent(filePath: string, name: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    `---\nname: ${name}\ndescription: ${name} description\n---\n\n${name} body\n`,
    'utf-8',
  );
}

describe('agent management safety', () => {
  it('rejects content reads outside known agent directories', async () => {
    const outsidePath = path.join(os.homedir(), 'outside.md');
    await writeAgent(outsidePath, 'outside');

    await expect(getAgentContent({ agentPath: outsidePath })).rejects.toThrow(
      'outside managed agent directories',
    );
  });

  it('does not treat a foreign backend symlink as enabled or remove it', async () => {
    const agent = await createAgent({
      enabledBackends: ['claude-code'],
      name: 'safe-agent',
      description: 'Safe agent',
      content: 'Use safely.',
    });
    const foreignTarget = path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/foreign.md',
    );
    const opencodeSymlink = path.join(
      os.homedir(),
      '.config/opencode/agents/safe-agent.md',
    );
    await writeAgent(foreignTarget, 'foreign');
    await fs.mkdir(path.dirname(opencodeSymlink), { recursive: true });
    await fs.symlink(foreignTarget, opencodeSymlink);

    const agents = await getAllManagedAgents();
    const discovered = agents.find(
      (item) => item.agentPath === agent.agentPath,
    );
    expect(discovered?.enabledBackends.opencode).toBe(false);

    await disableAgent({ agentPath: agent.agentPath, backendType: 'opencode' });

    await expect(fs.realpath(opencodeSymlink)).resolves.toBe(foreignTarget);
  });
});

describe('legacy agent migration', () => {
  it('does not overwrite canonical agent when selected legacy files collide', async () => {
    const claudeLegacyPath = path.join(os.homedir(), '.claude/agents/same.md');
    const opencodeLegacyPath = path.join(
      os.homedir(),
      '.config/opencode/agents/same.md',
    );
    const canonicalPath = path.join(
      os.homedir(),
      '.config/jean-claude/agents/user/same.md',
    );
    await writeAgent(claudeLegacyPath, 'claude-same');
    await writeAgent(opencodeLegacyPath, 'opencode-same');

    const preview = await previewLegacyAgentMigration();
    const itemIds = preview.items
      .filter((item) => item.legacyPath.endsWith('/same.md'))
      .map((item) => item.id);

    expect(itemIds).toHaveLength(2);

    const result = await executeLegacyAgentMigration({ itemIds });

    expect(
      result.results.filter((item) => item.status === 'migrated'),
    ).toHaveLength(1);
    expect(
      result.results.filter((item) => item.status === 'failed'),
    ).toHaveLength(1);
    await expect(fs.readFile(canonicalPath, 'utf-8')).resolves.toContain(
      'claude-same',
    );
    await expect(fs.readFile(opencodeLegacyPath, 'utf-8')).resolves.toContain(
      'opencode-same',
    );
  });
});
