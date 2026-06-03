import { describe, expect, it, vi } from 'vitest';

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
  loader: { config: () => undefined },
}));

vi.mock('monaco-editor', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/edcore.main.js', () => ({}));

import { buildWorkItemSnippetContext } from '@/features/new-task/ui-prompt-composer';
import type { AzureDevOpsWorkItem, WorkItemComment } from '@/lib/api';
import { resolveSnippetTemplate } from '@/lib/resolve-snippet-template';

describe('buildWorkItemSnippetContext', () => {
  it('includes cleaned work item fields and comments for snippet variables', () => {
    const workItems: AzureDevOpsWorkItem[] = [
      {
        id: 123,
        url: 'https://example.test/work-items/123',
        fields: {
          title: 'Fix composer snippets',
          workItemType: 'Bug',
          state: 'Active',
          description: '<p>Replace <b>vars</b></p>',
        },
      },
    ];
    const comments: WorkItemComment[] = [
      {
        id: 1,
        workItemId: 123,
        createdBy: 'Patrick',
        createdDate: '2026-06-01T10:00:00.000Z',
        text: '<p>Still shows {{project.name}}</p>',
      },
    ];

    expect(
      buildWorkItemSnippetContext({
        workItems,
        comments,
        testCasesByWorkItem: { 123: [{ id: 99, title: 'Regression test' }] },
      }),
    ).toEqual([
      {
        id: '123',
        title: 'Fix composer snippets',
        description: '<p>Replace <b>vars</b></p>',
        comments: [
          {
            author: 'Patrick',
            date: '2026-06-01T10:00:00.000Z',
            body: '<p>Still shows {{project.name}}</p>',
          },
        ],
        testCases: [{ id: 99, title: 'Regression test' }],
      },
    ]);
  });

  it('resolves project and selected comment variables in work item snippets', () => {
    const workItems: AzureDevOpsWorkItem[] = [
      {
        id: 123,
        url: 'https://example.test/work-items/123',
        fields: {
          title: 'Fix composer snippets',
          workItemType: 'Bug',
          state: 'Active',
        },
      },
    ];
    const comments: WorkItemComment[] = [
      {
        id: 1,
        workItemId: 123,
        createdBy: 'Patrick',
        createdDate: '2026-06-01T10:00:00.000Z',
        text: '<p>Use project context</p>',
      },
    ];

    const result = resolveSnippetTemplate(
      '{{project.name}}\n{{#each workItems}}{{title}}: {{#each comments}}{{author}}={{body}}{{/each}}{{/each}}',
      {
        project: { name: 'Jean-Claude', path: '/repo' },
        workItems: buildWorkItemSnippetContext({ workItems, comments }),
      },
    );

    expect(result.output).toBe(
      'Jean-Claude\nFix composer snippets: Patrick=<p>Use project context</p>',
    );
  });
});
