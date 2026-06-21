import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';
import { vol } from 'memfs';


import { detectProjects } from './project-detection-service';

const originalCodexHome = process.env.CODEX_HOME;
const originalOpenCodeDataDir = process.env.OPENCODE_DATA_DIR;

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

describe('detectProjects Codex detection', () => {
  afterEach(() => {
    restoreEnv('CODEX_HOME', originalCodexHome);
    restoreEnv('OPENCODE_DATA_DIR', originalOpenCodeDataDir);
  });

  it('reads Codex session metadata when first JSONL record exceeds 8192 bytes', async () => {
    const tempDir = '/tmp/jean-claude-codex-detection';
    const codexHome = path.join(tempDir, 'codex');
    const projectPath = path.join(tempDir, 'project');
    const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '23');
    vol.mkdirSync(os.homedir(), { recursive: true });
    vol.writeFileSync(
      path.join(os.homedir(), '.claude.json'),
      '{"projects":{}}',
    );
    vol.mkdirSync(projectPath, { recursive: true });
    vol.mkdirSync(sessionDir, { recursive: true });
    vol.mkdirSync(path.join(codexHome, 'archived_sessions'), {
      recursive: true,
    });
    vol.mkdirSync(path.join(tempDir, 'opencode', 'storage', 'session'), {
      recursive: true,
    });

    process.env.CODEX_HOME = codexHome;
    process.env.OPENCODE_DATA_DIR = path.join(tempDir, 'opencode');

    const longSessionMeta = JSON.stringify({
      type: 'session_meta',
      payload: {
        longField: 'x'.repeat(9000),
        cwd: projectPath,
      },
    });
    vol.writeFileSync(
      path.join(sessionDir, 'rollout.jsonl'),
      `${longSessionMeta}\n{"type":"turn_context"}\n`,
    );

    const projects = await detectProjects(new Set());

    expect(projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: projectPath, sources: ['codex'] }),
      ]),
    );
  });
});
