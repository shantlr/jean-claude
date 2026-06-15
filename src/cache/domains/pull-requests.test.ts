import { beforeEach, describe, expect, it } from 'vitest';

import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
} from '@shared/azure-devops-types';

import { markResourceStale, setResourceSuccess } from '../cache-actions';
import { cache$, resetCache } from '../cache-store';

import {
  allProjectsPullRequestsResourceKey,
  ingestAllProjectsPullRequestLists,
  ingestPullRequest,
  ingestPullRequestList,
  markPullRequestDetailAndListsStale,
  markPullRequestListsStale,
  projectPullRequestsResourceKey,
  pullRequestEntityKey,
  pullRequestResourceKey,
  repoPullRequestsResourceKey,
  selectAllProjectsPullRequests,
  selectProjectPullRequests,
  selectPullRequest,
  selectPullRequestDetails,
  selectRepoPullRequests,
} from './pull-requests';

function createPullRequest(
  overrides: Partial<AzureDevOpsPullRequest> = {},
): AzureDevOpsPullRequest {
  return {
    id: 42,
    title: 'Summary title',
    status: 'active',
    isDraft: false,
    createdBy: {
      id: 'user-1',
      displayName: 'User One',
      uniqueName: 'user@example.com',
    },
    creationDate: '2026-01-01T00:00:00.000Z',
    sourceRefName: 'refs/heads/feature',
    targetRefName: 'refs/heads/main',
    url: 'https://example.com/pr/42',
    reviewers: [],
    ...overrides,
  };
}

function createPullRequestDetails(
  overrides: Partial<AzureDevOpsPullRequestDetails> = {},
): AzureDevOpsPullRequestDetails {
  return {
    ...createPullRequest({ title: 'Detail title' }),
    description: 'Detailed description',
    completionOptions: {
      mergeStrategy: 'squash',
      deleteSourceBranch: true,
      transitionWorkItems: false,
    },
    ...overrides,
  };
}

describe('pull request cache domain', () => {
  beforeEach(() => {
    resetCache();
  });

  it('builds pull request entity keys from provider, repo, and PR identity', () => {
    expect(
      pullRequestResourceKey({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: '42',
      }),
    ).toBe('pullRequest:github:repo-1:42');
  });

  it('does not include project ID in pull request entity keys', () => {
    const key = pullRequestResourceKey({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequestId: '42',
    });

    expect(key).not.toContain('project-1');
    expect(key).toBe('pullRequest:github:repo-1:42');
    expect(
      pullRequestEntityKey({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: '42',
      }),
    ).toBe(key);
  });

  it('builds relation keys for project and repo pull request lists', () => {
    expect(projectPullRequestsResourceKey('project-1')).toBe(
      'pullRequests:project:project-1',
    );
    expect(projectPullRequestsResourceKey('project-1', 'completed')).toBe(
      'pullRequests:project:project-1:status:completed',
    );
    expect(
      repoPullRequestsResourceKey({ providerId: 'github', repoId: 'repo-1' }),
    ).toBe('pullRequests:repo:github:repo-1');
    expect(
      repoPullRequestsResourceKey({
        providerId: 'github',
        repoId: 'repo-1',
        status: 'completed',
      }),
    ).toBe('pullRequests:repo:github:repo-1:status:completed');
  });

  it('builds all-projects keys from status and repo identities', () => {
    const key = allProjectsPullRequestsResourceKey({
      status: 'active',
      projects: [
        {
          id: 'project-2',
          name: 'Beta',
          color: '#222',
          repoProviderId: 'github',
          repoProjectId: 'org',
          repoId: 'repo-2',
        },
        {
          id: 'project-1',
          name: 'Alpha',
          color: '#111',
          repoProviderId: 'github',
          repoProjectId: 'org',
          repoId: 'repo-1',
        },
      ],
    });

    expect(key).toBe(
      'pullRequests:allProjects:status:active:projects:project-1:github:org:repo-1|project-2:github:org:repo-2',
    );
  });

  it('ingests summary then detail and keeps all fields', () => {
    ingestPullRequest({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequest: createPullRequest({ title: 'Summary title' }),
    });
    ingestPullRequest({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequest: createPullRequestDetails({ title: 'Detail title' }),
    });

    expect(
      selectPullRequest({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      }),
    ).toMatchObject({
      id: 42,
      title: 'Detail title',
      description: 'Detailed description',
      completionOptions: { mergeStrategy: 'squash' },
    });
    expect(
      cache$.resources['pullRequest:github:repo-1:42'].get(),
    ).toMatchObject({ status: 'success', stale: false });
  });

  it('does not drop detail fields when ingesting a later summary', () => {
    ingestPullRequest({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequest: createPullRequestDetails({
        autoCompleteSetBy: { id: 'user-2', displayName: 'User Two' },
      }),
    });
    ingestPullRequest({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequest: createPullRequest({ title: 'Updated summary title' }),
    });

    expect(
      selectPullRequest({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      }),
    ).toMatchObject({
      title: 'Updated summary title',
      description: 'Detailed description',
      autoCompleteSetBy: { id: 'user-2', displayName: 'User Two' },
      completionOptions: { deleteSourceBranch: true },
    });
  });

  it('selects same entity objects from repo and project indexes', () => {
    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      pullRequests: [
        createPullRequest({ id: 42, title: 'First' }),
        createPullRequest({ id: 43, title: 'Second' }),
      ],
    });

    const repoPullRequests = selectRepoPullRequests({
      providerId: 'github',
      repoId: 'repo-1',
    });
    const projectPullRequests = selectProjectPullRequests('project-1');

    expect(repoPullRequests.map((pullRequest) => pullRequest.title)).toEqual([
      'First',
      'Second',
    ]);
    expect(projectPullRequests).toEqual(repoPullRequests);
    expect(projectPullRequests[0]).toBe(repoPullRequests[0]);
    expect(cache$.indexes['pullRequests:repo:github:repo-1'].ids.get()).toEqual(
      ['pullRequest:github:repo-1:42', 'pullRequest:github:repo-1:43'],
    );
    expect(cache$.indexes['pullRequests:project:project-1'].ids.get()).toEqual([
      'pullRequest:github:repo-1:42',
      'pullRequest:github:repo-1:43',
    ]);
  });

  it('reflects patched detail title and description through list selectors', () => {
    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      status: 'active',
      pullRequests: [createPullRequest({ id: 42, title: 'Original title' })],
    });

    ingestPullRequest({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequest: createPullRequestDetails({
        title: 'Updated title',
        description: 'Updated description',
      }),
    });

    expect(
      selectPullRequestDetails({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      }),
    ).toMatchObject({
      title: 'Updated title',
      description: 'Updated description',
    });
    expect(selectProjectPullRequests('project-1', 'active')[0]).toMatchObject({
      title: 'Updated title',
      description: 'Updated description',
    });
    expect(
      selectAllProjectsPullRequests(
        [{ id: 'project-1', name: 'Alpha', color: '#111' }],
        'active',
      )[0],
    ).toMatchObject({
      title: 'Updated title',
      description: 'Updated description',
      projectId: 'project-1',
    });
  });

  it('does not mark detail resources fresh when ingesting list summaries', () => {
    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequests: [createPullRequest({ id: 42 })],
    });

    expect(
      selectPullRequest({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      }),
    ).toMatchObject({ id: 42, title: 'Summary title' });
    expect(
      selectPullRequestDetails({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      }),
    ).toBeUndefined();
    expect(
      cache$.resources[
        pullRequestResourceKey({
          providerId: 'github',
          repoId: 'repo-1',
          pullRequestId: 42,
        })
      ].get(),
    ).toBeUndefined();
    expect(
      cache$.resources['pullRequests:repo:github:repo-1'].get(),
    ).toMatchObject({ status: 'success', stale: false });
  });

  it('selects pull request details only after detail ingestion', () => {
    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequests: [createPullRequest({ id: 42 })],
    });

    expect(
      selectPullRequestDetails({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      }),
    ).toBeUndefined();

    ingestPullRequest({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequest: createPullRequestDetails(),
    });

    expect(
      selectPullRequestDetails({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      }),
    ).toMatchObject({
      id: 42,
      description: 'Detailed description',
    });
  });

  it('keeps selecting fetched pull request details after stale mark', () => {
    ingestPullRequest({
      providerId: 'github',
      repoId: 'repo-1',
      pullRequest: createPullRequestDetails(),
    });

    markResourceStale('pullRequest:github:repo-1:42');

    expect(
      selectPullRequestDetails({
        providerId: 'github',
        repoId: 'repo-1',
        pullRequestId: 42,
      }),
    ).toMatchObject({
      id: 42,
      description: 'Detailed description',
    });
  });

  it('keeps status-specific pull request list indexes isolated', () => {
    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      status: 'active',
      pullRequests: [createPullRequest({ id: 42, title: 'Active' })],
    });
    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      status: 'completed',
      pullRequests: [
        createPullRequest({ id: 43, title: 'Completed', status: 'completed' }),
      ],
    });

    expect(
      selectProjectPullRequests('project-1', 'active').map(
        (pullRequest) => pullRequest.title,
      ),
    ).toEqual(['Active']);
    expect(
      selectProjectPullRequests('project-1', 'completed').map(
        (pullRequest) => pullRequest.title,
      ),
    ).toEqual(['Completed']);
    expect(
      selectRepoPullRequests({
        providerId: 'github',
        repoId: 'repo-1',
        status: 'active',
      }).map((pullRequest) => pullRequest.title),
    ).toEqual(['Active']);
    expect(
      cache$.indexes['pullRequests:project:project-1:status:active'].ids.get(),
    ).toEqual(['pullRequest:github:repo-1:42']);
    expect(
      cache$.indexes[
        'pullRequests:project:project-1:status:completed'
      ].ids.get(),
    ).toEqual(['pullRequest:github:repo-1:43']);
  });

  it('selects all project pull requests with current project fields sorted newest first', () => {
    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      status: 'active',
      pullRequests: [
        createPullRequest({
          id: 42,
          title: 'Older',
          creationDate: '2026-01-01T00:00:00.000Z',
        }),
      ],
    });
    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-2',
      projectId: 'project-2',
      status: 'active',
      pullRequests: [
        createPullRequest({
          id: 43,
          title: 'Newer',
          creationDate: '2026-01-02T00:00:00.000Z',
        }),
      ],
    });

    const pullRequests = selectAllProjectsPullRequests(
      [
        { id: 'project-1', name: 'Alpha', color: '#111' },
        { id: 'project-2', name: 'Beta', color: '#222' },
      ],
      'active',
    );

    expect(pullRequests.map((pullRequest) => pullRequest.title)).toEqual([
      'Newer',
      'Older',
    ]);
    expect(pullRequests[0]).toMatchObject({
      projectId: 'project-2',
      projectName: 'Beta',
      projectColor: '#222',
    });
    expect(
      cache$.pullRequests['pullRequest:github:repo-2:43'].get(),
    ).not.toHaveProperty('projectName');
  });

  it('skips failed all-project list ingests without clearing existing project indexes', () => {
    ingestPullRequestList({
      providerId: 'github',
      repoId: 'repo-1',
      projectId: 'project-1',
      status: 'active',
      pullRequests: [createPullRequest({ id: 42, title: 'Existing' })],
    });

    ingestAllProjectsPullRequestLists({
      projects: [
        {
          id: 'project-1',
          name: 'Alpha',
          color: '#111',
          repoProviderId: 'github',
          repoProjectId: 'org',
          repoId: 'repo-1',
        },
      ],
      status: 'active',
      pullRequestLists: [null],
    });

    expect(
      selectProjectPullRequests('project-1', 'active').map(
        (pullRequest) => pullRequest.title,
      ),
    ).toEqual(['Existing']);
    expect(
      cache$.indexes['pullRequests:project:project-1:status:active'].ids.get(),
    ).toEqual(['pullRequest:github:repo-1:42']);
  });

  it('marks pull request list resources stale for all statuses', () => {
    markPullRequestListsStale({
      projectId: 'project-1',
      providerId: 'github',
      repoId: 'repo-1',
    });

    for (const key of [
      'pullRequests:repo:github:repo-1',
      'pullRequests:repo:github:repo-1:status:active',
      'pullRequests:repo:github:repo-1:status:completed',
      'pullRequests:repo:github:repo-1:status:abandoned',
      'pullRequests:repo:github:repo-1:status:all',
      'pullRequests:project:project-1',
      'pullRequests:project:project-1:status:active',
      'pullRequests:project:project-1:status:completed',
      'pullRequests:project:project-1:status:abandoned',
      'pullRequests:project:project-1:status:all',
    ]) {
      expect(cache$.resources[key].get()).toMatchObject({ stale: true });
    }
  });

  it('marks existing all-project pull request resources stale', () => {
    const allProjectsKey = allProjectsPullRequestsResourceKey({
      projects: [
        {
          id: 'project-1',
          name: 'Alpha',
          color: '#111',
          repoProviderId: 'github',
          repoProjectId: 'org',
          repoId: 'repo-1',
        },
      ],
      status: 'active',
    });
    setResourceSuccess(allProjectsKey);

    markPullRequestListsStale({
      projectId: 'project-1',
      providerId: 'github',
      repoId: 'repo-1',
    });

    expect(cache$.resources[allProjectsKey].get()).toMatchObject({
      stale: true,
    });
  });

  it('marks pull request detail and list resources stale', () => {
    markPullRequestDetailAndListsStale({
      projectId: 'project-1',
      providerId: 'github',
      repoId: 'repo-1',
      pullRequestId: 42,
    });

    expect(
      cache$.resources['pullRequest:github:repo-1:42'].get(),
    ).toMatchObject({ stale: true });
    expect(
      cache$.resources['pullRequests:repo:github:repo-1'].get(),
    ).toMatchObject({ stale: true });
    expect(
      cache$.resources['pullRequests:project:project-1'].get(),
    ).toMatchObject({ stale: true });
  });
});
