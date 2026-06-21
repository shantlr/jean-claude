import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { parse as parseToml } from 'smol-toml';

import type {
  BackendUserConfig,
  BackendUserConfigUpdate,
} from '@shared/backend-config-settings-types';
import type { AgentBackendType } from '@shared/agent-backend-types';


function getConfig(backend: AgentBackendType): {
  paths: string[];
  schemaUrl: string;
  defaultContent: string;
} {
  const home = os.homedir();

  switch (backend) {
    case 'claude-code':
      return {
        paths: [path.join(home, '.claude', 'settings.json')],
        schemaUrl: 'https://json.schemastore.org/claude-code-settings.json',
        defaultContent:
          '{\n  "$schema": "https://json.schemastore.org/claude-code-settings.json"\n}\n',
      };
    case 'opencode':
      return {
        paths: [
          path.join(home, '.config', 'opencode', 'opencode.jsonc'),
          path.join(home, '.config', 'opencode', 'opencode.json'),
        ],
        schemaUrl: 'https://opencode.ai/config.json',
        defaultContent:
          '{\n  "$schema": "https://opencode.ai/config.json"\n}\n',
      };
    case 'codex':
      return {
        paths: [path.join(home, '.codex', 'config.toml')],
        schemaUrl: 'https://developers.openai.com/codex/config-reference',
        defaultContent: '',
      };
  }
}

function stripJsonComments(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inString) {
      result += char;
      const wasEscaped = escaped;
      escaped = char === '\\' ? !escaped : false;
      if (char === '"' && !wasEscaped) inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (index < content.length && content[index] !== '\n') index += 1;
      result += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (
        index < content.length &&
        !(content[index] === '*' && content[index + 1] === '/')
      ) {
        result += content[index] === '\n' ? '\n' : ' ';
        index += 1;
      }
      index += 1;
      continue;
    }

    result += char;
  }

  return result;
}

function stripTrailingCommas(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      result += char;
      const wasEscaped = escaped;
      escaped = char === '\\' ? !escaped : false;
      if (char === '"' && !wasEscaped) inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === ',') {
      let nextIndex = index + 1;
      while (/\s/.test(content[nextIndex] ?? '')) nextIndex += 1;
      if (content[nextIndex] === '}' || content[nextIndex] === ']') continue;
    }

    result += char;
  }

  return result;
}

function parseJsonLike(content: string): unknown {
  return JSON.parse(stripTrailingCommas(stripJsonComments(content)));
}

async function resolveConfigPath(config: ReturnType<typeof getConfig>) {
  for (const configPath of config.paths) {
    try {
      await fs.access(configPath);
      return configPath;
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
  }
  return config.paths[0];
}

export async function readBackendUserConfig(
  backend: AgentBackendType,
): Promise<BackendUserConfig> {
  const config = getConfig(backend);
  const configPath = await resolveConfigPath(config);
  try {
    const content = await fs.readFile(configPath, 'utf8');
    return {
      backend,
      path: configPath,
      schemaUrl: config.schemaUrl,
      exists: true,
      content,
    };
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    return {
      backend,
      path: configPath,
      schemaUrl: config.schemaUrl,
      exists: false,
      content: config.defaultContent,
    };
  }
}

export async function writeBackendUserConfig({
  backend,
  content,
}: BackendUserConfigUpdate): Promise<BackendUserConfig> {
  const config = getConfig(backend);
  const configPath = await resolveConfigPath(config);
  if (backend === 'codex') {
    try {
      parseToml(content);
    } catch (error) {
      throw new Error(
        `Invalid config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      content.endsWith('\n') ? content : `${content}\n`,
      'utf8',
    );
    return readBackendUserConfig(backend);
  }

  let parsed: unknown;
  try {
    parsed = parseJsonLike(content);
  } catch (error) {
    throw new Error(
      `Invalid config: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Config must be a JSON object');
  }

  const formatted = `${JSON.stringify(parsed, null, 2)}\n`;
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, formatted, 'utf8');
  return readBackendUserConfig(backend);
}
