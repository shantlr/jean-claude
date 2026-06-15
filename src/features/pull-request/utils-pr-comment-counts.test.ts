import { describe, expect, it } from 'vitest';

import type {
  AzureDevOpsCommentThread,
  AzureDevOpsFileChange,
} from '@/lib/api';

import { getCommentCountByPrFile } from './utils-pr-comment-counts';

function thread(
  filePath: string,
  commentCount: number,
  overrides: Partial<AzureDevOpsCommentThread> = {},
): AzureDevOpsCommentThread {
  return {
    id: 1,
    status: 'active',
    threadContext: { filePath },
    comments: Array.from({ length: commentCount }, (_, index) => ({
      id: index + 1,
      content: `Comment ${index + 1}`,
      commentType: 'text',
      author: { displayName: 'Reviewer', uniqueName: 'reviewer@example.com' },
      usersLiked: [],
      publishedDate: '2026-05-30T00:00:00.000Z',
      lastUpdatedDate: '2026-05-30T00:00:00.000Z',
    })),
    isDeleted: false,
    ...overrides,
  };
}

describe('PR comment counts by file', () => {
  it('keys counts to Azure change paths with leading slashes', () => {
    const files: AzureDevOpsFileChange[] = [
      { path: '/src/app.ts', changeType: 'edit' },
    ];

    expect(
      getCommentCountByPrFile({
        files,
        threads: [thread('/src/app.ts', 2)],
      }),
    ).toEqual({ '/src/app.ts': 2 });
  });

  it('matches thread paths without leading slashes to file-tree paths', () => {
    const files: AzureDevOpsFileChange[] = [
      { path: '/src/app.ts', changeType: 'edit' },
    ];

    expect(
      getCommentCountByPrFile({
        files,
        threads: [thread('src/app.ts', 1)],
      }),
    ).toEqual({ '/src/app.ts': 1 });
  });

  it('ignores deleted threads and comments outside changed files', () => {
    const files: AzureDevOpsFileChange[] = [
      { path: '/src/app.ts', changeType: 'edit' },
    ];

    expect(
      getCommentCountByPrFile({
        files,
        threads: [
          thread('/src/app.ts', 1, { isDeleted: true }),
          thread('/src/other.ts', 1),
        ],
      }),
    ).toEqual({});
  });
});
