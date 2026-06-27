import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repositories = vi.hoisted(() => ({
  ProjectRepository: {
    findById: vi.fn(),
  },
  SettingsRepository: {
    get: vi.fn(),
  },
  TaskRepository: {
    findById: vi.fn(),
  },
}));

const aiGeneration = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock('../database/repositories', () => repositories);
vi.mock('./ai-generation-service', () => aiGeneration);

import {
  consolidatePreferenceMemoryForProject,
  recordPreferenceEvidence,
} from './preference-memory-service';

let testDir: string;

beforeEach(async () => {
  await fs.mkdir(os.tmpdir(), { recursive: true });
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jc-preference-memory-'));
  repositories.ProjectRepository.findById.mockReset();
  repositories.SettingsRepository.get.mockReset();
  repositories.SettingsRepository.get.mockResolvedValue({
    enabled: true,
    consolidationEnabled: false,
    consolidationIntervalMinutes: 1440,
  });
  repositories.TaskRepository.findById.mockReset();
  aiGeneration.generateText.mockReset();
});

afterEach(async () => {
  await fs.rm(testDir, { force: true, recursive: true });
});

describe('recordPreferenceEvidence', () => {
  it('does not write evidence when preference memory is disabled', async () => {
    repositories.SettingsRepository.get.mockResolvedValue({ enabled: false });

    const result = await recordPreferenceEvidence({
      source: 'task-review-comment',
      taskId: 'task-1',
      comments: [{ body: 'Prefer smaller diff here.' }],
    });

    expect(result).toEqual({ path: '', recorded: 0 });
    expect(repositories.TaskRepository.findById).not.toHaveBeenCalled();
  });

  it('resolves project from task and appends comment evidence', async () => {
    repositories.TaskRepository.findById.mockResolvedValue({
      id: 'task-1',
      projectId: 'project-1',
      name: 'Fix stale UI',
      prompt: 'Please fix stale UI state.',
      worktreePath: testDir,
      branchName: 'task/fix-stale-ui',
      sourceBranch: 'main',
    });
    repositories.ProjectRepository.findById.mockResolvedValue({
      id: 'project-1',
      name: 'Jean-Claude',
      path: testDir,
    });
    const fileContent = Array.from(
      { length: 201 },
      (_, index) => `line-${index + 1}`,
    ).join('\n');
    const expectedExcerpt = Array.from(
      { length: 161 },
      (_, index) => `line-${index + 21}`,
    ).join('\n');
    await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'src/app.ts'), fileContent, 'utf-8');

    const result = await recordPreferenceEvidence({
      source: 'task-review-comment',
      taskId: 'task-1',
      comments: [
        {
          body: 'Prefer smaller diff here.',
          filePath: 'src/app.ts',
          lineStart: 101,
          presets: ['simplify'],
          selectedText: 'line-101',
        },
      ],
      context: { targetStepId: 'step-1', ignored: undefined },
    });

    expect(result.recorded).toBe(1);
    expect(result.path).toBe(
      path.join(
        testDir,
        '.jean-claude/memory/user-reviews',
        `${new Date().toISOString().slice(0, 10)}.jsonl`,
      ),
    );

    const raw = await fs.readFile(result.path, 'utf-8');
    const records = raw
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: 'task-review-comment',
      taskId: 'task-1',
      projectId: 'project-1',
      comment: {
        body: 'Prefer smaller diff here.',
        filePath: 'src/app.ts',
        lineStart: 101,
        presets: ['simplify'],
        selectedText: 'line-101',
      },
      fileSnapshot: {
        filePath: 'src/app.ts',
        content: expectedExcerpt,
        startLine: 21,
        endLine: 181,
        totalLines: 201,
        truncated: true,
        bytes: expect.any(Number),
      },
      metadata: {
        projectName: 'Jean-Claude',
        projectPath: testDir,
        taskName: 'Fix stale UI',
        taskPrompt: 'Please fix stale UI state.',
        worktreePath: testDir,
        branchName: 'task/fix-stale-ui',
        sourceBranch: 'main',
      },
      context: { targetStepId: 'step-1' },
    });
    expect(records[0].id).toEqual(expect.any(String));
    expect(records[0].createdAt).toEqual(expect.any(String));
  });

  it('consolidates unprocessed daily evidence and records byte offsets', async () => {
    aiGeneration.generateText.mockImplementationOnce(async () => {
      const memoryDir = path.join(testDir, '.jean-claude/memory');
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(
        path.join(memoryDir, 'user-preferences.md'),
        '# User Preferences\n\n- Prefer minimal targeted diffs.\n',
        'utf-8',
      );
      return 'updated';
    });
    const reviewsDir = path.join(testDir, '.jean-claude/memory/user-reviews');
    const evidencePath = path.join(reviewsDir, '2026-06-15.jsonl');
    const firstLine = `${JSON.stringify({ comment: { body: 'Prefer direct state selectors.' } })}\n`;
    const secondLine = `${JSON.stringify({ comment: { body: 'Avoid broad refactors.' } })}\n`;
    await fs.mkdir(reviewsDir, { recursive: true });
    await fs.writeFile(evidencePath, firstLine + secondLine, 'utf-8');
    await fs.writeFile(
      path.join(testDir, '.jean-claude/memory/user-reviews-state.json'),
      JSON.stringify({
        files: {
          '2026-06-15.jsonl': { offset: Buffer.byteLength(firstLine) },
        },
      }),
      'utf-8',
    );

    const result = await consolidatePreferenceMemoryForProject({
      id: 'project-1',
      name: 'Jean-Claude',
      path: testDir,
    });

    expect(result).toEqual({ processed: true });
    expect(aiGeneration.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'claude-code',
        model: 'haiku',
        thinkingEffort: 'default',
        skillName: 'user-preference-memory',
        cwd: testDir,
        allowedTools: ['Read', 'Write', 'Edit'],
        allowRateLimitSwap: false,
        prompt: expect.stringContaining('Avoid broad refactors.'),
      }),
    );
    expect(aiGeneration.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining('Prefer direct state selectors.'),
      }),
    );

    const state = JSON.parse(
      await fs.readFile(
        path.join(testDir, '.jean-claude/memory/user-reviews-state.json'),
        'utf-8',
      ),
    );
    expect(state.files['2026-06-15.jsonl'].offset).toBe(
      Buffer.byteLength(firstLine + secondLine),
    );
    expect(state.lastConsolidatedAt).toEqual(expect.any(String));

    const historyDir = path.join(
      testDir,
      '.jean-claude/memory/user-preferences-history',
    );
    const historyFiles = await fs.readdir(historyDir);
    expect(historyFiles).toHaveLength(1);
    const history = JSON.parse(
      await fs.readFile(path.join(historyDir, historyFiles[0]), 'utf-8'),
    );
    expect(history).toMatchObject({
      id: expect.any(String),
      createdAt: state.lastConsolidatedAt,
      projectId: 'project-1',
      projectName: 'Jean-Claude',
      backend: 'claude-code',
      model: 'haiku',
      thinkingEffort: 'default',
      evidence: {
        files: [
          {
            fileName: '2026-06-15.jsonl',
            fromOffset: Buffer.byteLength(firstLine),
            toOffset: Buffer.byteLength(firstLine + secondLine),
            recordCount: 1,
          },
        ],
      },
      document: {
        path: '.jean-claude/memory/user-preferences.md',
        sha256: expect.any(String),
        content: '# User Preferences\n\n- Prefer minimal targeted diffs.\n',
      },
    });
  });

  it('does not advance offsets when consolidation does not write preferences', async () => {
    aiGeneration.generateText.mockResolvedValue('no file written');
    const reviewsDir = path.join(testDir, '.jean-claude/memory/user-reviews');
    const evidencePath = path.join(reviewsDir, '2026-06-15.jsonl');
    const evidenceLine = `${JSON.stringify({ comment: { body: 'Prefer direct state selectors.' } })}\n`;
    await fs.mkdir(reviewsDir, { recursive: true });
    await fs.writeFile(evidencePath, evidenceLine, 'utf-8');

    const result = await consolidatePreferenceMemoryForProject({
      id: 'project-1',
      name: 'Jean-Claude',
      path: testDir,
    });

    expect(result).toEqual({ processed: false });
    await expect(
      fs.readFile(
        path.join(testDir, '.jean-claude/memory/user-reviews-state.json'),
        'utf-8',
      ),
    ).rejects.toThrow();
    await expect(
      fs.readdir(
        path.join(testDir, '.jean-claude/memory/user-preferences-history'),
      ),
    ).rejects.toThrow();
  });

  it('passes configured backend model and thinking to consolidation generation', async () => {
    aiGeneration.generateText.mockImplementationOnce(async () => {
      const memoryDir = path.join(testDir, '.jean-claude/memory');
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(
        path.join(memoryDir, 'user-preferences.md'),
        '# User Preferences\n',
        'utf-8',
      );
      return 'updated';
    });
    const reviewsDir = path.join(testDir, '.jean-claude/memory/user-reviews');
    await fs.mkdir(reviewsDir, { recursive: true });
    await fs.writeFile(
      path.join(reviewsDir, '2026-06-15.jsonl'),
      `${JSON.stringify({ comment: { body: 'Prefer small diffs.' } })}\n`,
      'utf-8',
    );

    await consolidatePreferenceMemoryForProject(
      { id: 'project-1', name: 'Jean-Claude', path: testDir },
      {
        backend: 'opencode',
        model: 'anthropic/claude-sonnet-4-5',
        thinkingEffort: 'medium',
      },
    );

    expect(aiGeneration.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'opencode',
        model: 'anthropic/claude-sonnet-4-5',
        thinkingEffort: 'medium',
        allowedTools: ['Read', 'Write', 'Edit'],
        allowedToolPatterns: {
          Read: ['.jean-claude/memory/**'],
          Write: ['.jean-claude/memory/**'],
          Edit: ['.jean-claude/memory/**'],
        },
        allowRateLimitSwap: false,
      }),
    );
  });
});
