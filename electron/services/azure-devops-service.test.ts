import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findProviderByIdMock, getDecryptedTokenMock } = vi.hoisted(() => ({
  findProviderByIdMock: vi.fn(),
  getDecryptedTokenMock: vi.fn(),
}));

vi.mock('../database/repositories/providers', () => ({
  ProviderRepository: {
    findById: findProviderByIdMock,
  },
}));

vi.mock('../database/repositories/tokens', () => ({
  TokenRepository: {
    getDecryptedToken: getDecryptedTokenMock,
  },
}));

import {
  getPullRequestFileContent,
  setPullRequestAutoComplete,
  updatePullRequestTitle,
  uploadPullRequestAttachment,
} from './azure-devops-service';

function jsonResponse(body: unknown, init: { ok: boolean; status?: number }) {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 400),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('uploadPullRequestAttachment', () => {
  beforeEach(() => {
    findProviderByIdMock.mockResolvedValue({
      tokenId: 'token-1',
      baseUrl: 'https://dev.azure.com/org',
    });
    getDecryptedTokenMock.mockResolvedValue('pat');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('uses a content hash suffix and retries when Azure reports a duplicate attachment name', async () => {
    const dataBase64 = Buffer.from('image').toString('base64');

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/_apis/profile/profiles/me')) {
        return jsonResponse(
          {
            id: 'profile-id',
            displayName: 'PR Owner',
            emailAddress: 'owner@example.com',
          },
          { ok: true },
        );
      }

      if (url.includes('/_apis/connectionData')) {
        return jsonResponse(
          { authenticatedUser: { id: 'owner-id' } },
          { ok: true },
        );
      }

      if (url.includes('/pullrequests/123?')) {
        return jsonResponse(
          {
            pullRequestId: 123,
            title: 'Test PR',
            status: 'active',
            isDraft: false,
            createdBy: {
              id: 'owner-id',
              displayName: 'PR Owner',
              uniqueName: 'owner@example.com',
            },
            creationDate: '2026-01-01T00:00:00Z',
            sourceRefName: 'refs/heads/feature',
            targetRefName: 'refs/heads/main',
          },
          { ok: true },
        );
      }

      if (url.includes('/attachments/image-6105d6cc.png?')) {
        return jsonResponse(
          {
            message:
              "The attachment with file name 'image-6105d6cc.png' already exists.",
          },
          { ok: false, status: 400 },
        );
      }

      if (url.includes('/attachments/image-6105d6cc-1.png?')) {
        return jsonResponse(
          {
            url: 'https://dev.azure.com/org/project/_apis/attachment/image-6105d6cc-1.png',
          },
          { ok: true },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(
      uploadPullRequestAttachment({
        providerId: 'provider-1',
        projectId: 'project',
        repoId: 'repo',
        pullRequestId: 123,
        fileName: 'image.png',
        mimeType: 'image/png',
        dataBase64,
      }),
    ).resolves.toEqual({
      url: 'https://dev.azure.com/org/project/_apis/attachment/image-6105d6cc-1.png',
    });

    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls).toContain(
      'https://dev.azure.com/org/project/_apis/git/repositories/repo/pullRequests/123/attachments/image-6105d6cc.png?api-version=7.1-preview.1',
    );
    expect(urls).toContain(
      'https://dev.azure.com/org/project/_apis/git/repositories/repo/pullRequests/123/attachments/image-6105d6cc-1.png?api-version=7.1-preview.1',
    );
  });
});

describe('setPullRequestAutoComplete', () => {
  beforeEach(() => {
    findProviderByIdMock.mockResolvedValue({
      tokenId: 'token-1',
      baseUrl: 'https://dev.azure.com/org',
    });
    getDecryptedTokenMock.mockResolvedValue('pat');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends optional policy ids in completion options', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          pullRequestId: 123,
          title: 'Test PR',
          status: 'active',
          isDraft: false,
          createdBy: {
            id: 'owner-id',
            displayName: 'PR Owner',
            uniqueName: 'owner@example.com',
          },
          creationDate: '2026-01-01T00:00:00Z',
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
          autoCompleteSetBy: {
            id: 'owner-id',
            displayName: 'PR Owner',
          },
          completionOptions: {
            mergeStrategy: 'squash',
            deleteSourceBranch: true,
            transitionWorkItems: false,
            autoCompleteIgnoreConfigIds: [11, 22],
          },
        },
        { ok: true },
      ),
    );

    await expect(
      setPullRequestAutoComplete({
        providerId: 'provider-1',
        projectId: 'project',
        repoId: 'repo',
        pullRequestId: 123,
        enabled: true,
        autoCompleteSetById: 'owner-id',
        completionOptions: {
          mergeStrategy: 'squash',
          deleteSourceBranch: true,
          transitionWorkItems: false,
          autoCompleteIgnoreConfigIds: [11, 22],
        },
      }),
    ).resolves.toMatchObject({
      completionOptions: {
        mergeStrategy: 'squash',
        deleteSourceBranch: true,
        transitionWorkItems: false,
        autoCompleteIgnoreConfigIds: [11, 22],
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://dev.azure.com/org/project/_apis/git/repositories/repo/pullrequests/123?api-version=7.0',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          autoCompleteSetBy: { id: 'owner-id' },
          completionOptions: {
            mergeStrategy: 'squash',
            deleteSourceBranch: true,
            transitionWorkItems: false,
            autoCompleteIgnoreConfigIds: [11, 22],
          },
        }),
      }),
    );
  });
});

describe('updatePullRequestTitle', () => {
  beforeEach(() => {
    findProviderByIdMock.mockResolvedValue({
      tokenId: 'token-1',
      baseUrl: 'https://dev.azure.com/org',
    });
    getDecryptedTokenMock.mockResolvedValue('pat');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('patches title without requiring current user to own the PR', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          pullRequestId: 123,
          title: 'Updated PR',
          status: 'active',
          isDraft: false,
          createdBy: {
            id: 'owner-id',
            displayName: 'PR Owner',
            uniqueName: 'owner@example.com',
          },
          creationDate: '2026-01-01T00:00:00Z',
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
        },
        { ok: true },
      ),
    );

    await expect(
      updatePullRequestTitle({
        providerId: 'provider-1',
        projectId: 'project',
        repoId: 'repo',
        pullRequestId: 123,
        title: '  Updated PR  ',
      }),
    ).resolves.toMatchObject({ title: 'Updated PR' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://dev.azure.com/org/project/_apis/git/repositories/repo/pullrequests/123?api-version=7.0',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated PR' }),
      }),
    );
  });
});

describe('getPullRequestFileContent', () => {
  beforeEach(() => {
    findProviderByIdMock.mockResolvedValue({
      tokenId: 'token-1',
      baseUrl: 'https://dev.azure.com/org',
    });
    getDecryptedTokenMock.mockResolvedValue('pat');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('loads base content from PR iteration common commit instead of target branch head', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/pullrequests/123/iterations?')) {
        return jsonResponse(
          {
            count: 1,
            value: [
              {
                id: 7,
                commonRefCommit: { commitId: 'common-commit' },
                sourceRefCommit: { commitId: 'source-commit' },
                targetRefCommit: { commitId: 'target-commit' },
              },
            ],
          },
          { ok: true },
        );
      }

      if (
        url.includes('/items?') &&
        url.includes('versionDescriptor.version=common-commit') &&
        url.includes('versionDescriptor.versionType=commit')
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => 'base content',
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(
      getPullRequestFileContent({
        providerId: 'provider-1',
        projectId: 'project',
        repoId: 'repo',
        pullRequestId: 123,
        filePath: '/src/file.ts',
        version: 'base',
      }),
    ).resolves.toBe('base content');

    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('versionType=branch'))).toBe(false);
    expect(urls).toContain(
      'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=%2Fsrc%2Ffile.ts&versionDescriptor.version=common-commit&versionDescriptor.versionType=commit&api-version=7.0',
    );
  });

  it('loads head content from PR iteration source commit', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/pullrequests/123/iterations?')) {
        return jsonResponse(
          {
            count: 1,
            value: [
              {
                id: 7,
                commonRefCommit: { commitId: 'common-commit' },
                sourceRefCommit: { commitId: 'source-commit' },
                targetRefCommit: { commitId: 'target-commit' },
              },
            ],
          },
          { ok: true },
        );
      }

      if (
        url.includes('/items?') &&
        url.includes('versionDescriptor.version=source-commit') &&
        url.includes('versionDescriptor.versionType=commit')
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => 'head content',
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(
      getPullRequestFileContent({
        providerId: 'provider-1',
        projectId: 'project',
        repoId: 'repo',
        pullRequestId: 123,
        filePath: '/src/file.ts',
        version: 'head',
      }),
    ).resolves.toBe('head content');

    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls).toContain(
      'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=%2Fsrc%2Ffile.ts&versionDescriptor.version=source-commit&versionDescriptor.versionType=commit&api-version=7.0',
    );
  });

  it('falls back to PR iteration target commit when common commit is absent', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/pullrequests/123/iterations?')) {
        return jsonResponse(
          {
            count: 1,
            value: [
              {
                id: 7,
                sourceRefCommit: { commitId: 'source-commit' },
                targetRefCommit: { commitId: 'target-commit' },
              },
            ],
          },
          { ok: true },
        );
      }

      if (
        url.includes('/items?') &&
        url.includes('versionDescriptor.version=target-commit') &&
        url.includes('versionDescriptor.versionType=commit')
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => 'target content',
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(
      getPullRequestFileContent({
        providerId: 'provider-1',
        projectId: 'project',
        repoId: 'repo',
        pullRequestId: 123,
        filePath: '/src/file.ts',
        version: 'base',
      }),
    ).resolves.toBe('target content');

    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls).toContain(
      'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=%2Fsrc%2Ffile.ts&versionDescriptor.version=target-commit&versionDescriptor.versionType=commit&api-version=7.0',
    );
  });
});
