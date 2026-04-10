// electron/services/azure-devops-service.ts

import { spawn } from 'child_process';

import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
  AzureDevOpsComment,
  ReviewerVoteStatus,
} from '@shared/azure-devops-types';
import type {
  AzureBuildDefinition,
  AzureBuildDefinitionDetail,
  AzureBuildDetail,
  AzureBuildRun,
  AzureBuildTimeline,
  AzureGitRef,
  AzureRelease,
  AzureReleaseDefinition,
  AzureReleaseDetail,
  YamlPipelineParameter,
} from '@shared/pipeline-types';

import { ProviderRepository } from '../database/repositories/providers';
import { TokenRepository } from '../database/repositories/tokens';
import { dbg } from '../lib/debug';

import { sendGlobalPromptToWindow } from './global-prompt-service';
import {
  parseYamlParameters,
  validateYamlFilename,
} from './yaml-pipeline-parser';

export type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
  AzureDevOpsComment,
};

export interface AzureDevOpsOrganization {
  id: string;
  name: string;
  url: string;
}

export interface AzureDevOpsUser {
  id: string;
  displayName: string;
  emailAddress: string;
}

export interface AzureDevOpsProject {
  id: string;
  name: string;
  url: string;
}

export interface AzureDevOpsRepo {
  id: string;
  name: string;
  url: string;
  projectId: string;
}

export interface AzureDevOpsOrgDetails {
  projects: Array<{
    project: AzureDevOpsProject;
    repos: AzureDevOpsRepo[];
  }>;
}

export interface LinkedPr {
  prId: number;
  projectId: string; // GUID from vstfs URL
  repoId: string; // GUID from vstfs URL
}

export interface AzureDevOpsWorkItem {
  id: number;
  url: string;
  fields: {
    title: string;
    workItemType: string;
    state: string;
    assignedTo?: string;
    description?: string;
    reproSteps?: string;
    changedDate?: string;
  };
  parentId?: number;
  linkedPrs?: LinkedPr[];
}

export interface AzureDevOpsIteration {
  id: string;
  name: string;
  path: string;
  startDate: string | null;
  finishDate: string | null;
  isCurrent: boolean;
}

interface WiqlResponse {
  workItems: Array<{ id: number; url: string }>;
}

interface WorkItemRelation {
  rel: string;
  url: string;
  attributes: {
    name?: string;
    isLocked?: boolean;
  };
}

interface WorkItemsBatchResponse {
  count: number;
  value: Array<{
    id: number;
    url: string;
    fields: {
      'System.Title': string;
      'System.WorkItemType': string;
      'System.State': string;
      'System.AssignedTo'?: { displayName: string };
      'System.Description'?: string;
      'Microsoft.VSTS.TCM.ReproSteps'?: string;
      'System.ChangedDate'?: string;
    };
    relations?: WorkItemRelation[];
  }>;
}

interface ProfileResponse {
  id: string;
  displayName: string;
  emailAddress: string;
}

interface AccountsResponse {
  count: number;
  value: Array<{
    accountId: string;
    accountName: string;
    accountUri: string;
  }>;
}

interface ProjectsResponse {
  count: number;
  value: Array<{
    id: string;
    name: string;
    url: string;
  }>;
}

interface ReposResponse {
  count: number;
  value: Array<{
    id: string;
    name: string;
    webUrl: string;
    project: {
      id: string;
    };
  }>;
}

export function createAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
}

// Internal function that uses raw token
async function getOrganizationsWithToken(
  token: string,
): Promise<AzureDevOpsOrganization[]> {
  // Step 1: Get the user's member ID from profile
  const profileResponse = await fetch(
    'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.0',
    {
      headers: {
        Authorization: createAuthHeader(token),
      },
    },
  );

  if (!profileResponse.ok) {
    const error = await profileResponse.text();
    throw new Error(`Failed to authenticate with Azure DevOps: ${error}`);
  }

  const profile: ProfileResponse = await profileResponse.json();

  // Step 2: Get the list of organizations
  const accountsResponse = await fetch(
    `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.id}&api-version=7.0`,
    {
      headers: {
        Authorization: createAuthHeader(token),
      },
    },
  );

  if (!accountsResponse.ok) {
    const error = await accountsResponse.text();
    throw new Error(`Failed to fetch organizations: ${error}`);
  }

  const accounts: AccountsResponse = await accountsResponse.json();

  return accounts.value.map((account) => ({
    id: account.accountId,
    name: account.accountName,
    url: `https://dev.azure.com/${account.accountName}`,
  }));
}

// Get organizations using a tokenId (looks up decrypted token internally)
export async function getOrganizationsByTokenId(
  tokenId: string,
): Promise<AzureDevOpsOrganization[]> {
  const token = await TokenRepository.getDecryptedToken(tokenId);
  if (!token) {
    throw new Error(`Token not found: ${tokenId}`);
  }
  return getOrganizationsWithToken(token);
}

// Validate token and get organizations (for initial token creation)
export async function validateTokenAndGetOrganizations(
  token: string,
): Promise<AzureDevOpsOrganization[]> {
  return getOrganizationsWithToken(token);
}

// Get PAT expiration date from Azure DevOps API
export async function getTokenExpiration(
  tokenId: string,
): Promise<string | null> {
  const token = await TokenRepository.getDecryptedToken(tokenId);
  if (!token) {
    throw new Error(`Token not found: ${tokenId}`);
  }

  try {
    // First get organizations to find one we can query
    const orgs = await getOrganizationsWithToken(token);
    if (orgs.length === 0) {
      return null;
    }

    const orgName = orgs[0].name;

    // Query PAT lifecycle API
    const response = await fetch(
      `https://vssps.dev.azure.com/${orgName}/_apis/tokens/pats?api-version=7.1-preview.1`,
      {
        headers: {
          Authorization: createAuthHeader(token),
        },
      },
    );

    if (!response.ok) {
      // API might not be accessible with this token's scopes
      return null;
    }

    const data = await response.json();

    // Find the current token in the list (compare by checking auth works)
    // The API returns PATs but doesn't identify which one we're using
    // Best effort: return the earliest expiring non-expired token
    const pats = data.patTokens || [];
    const now = new Date();

    const validPats = pats
      .filter((pat: { validTo: string }) => new Date(pat.validTo) > now)
      .sort(
        (a: { validTo: string }, b: { validTo: string }) =>
          new Date(a.validTo).getTime() - new Date(b.validTo).getTime(),
      );

    if (validPats.length > 0) {
      return validPats[0].validTo;
    }

    return null;
  } catch {
    // If anything fails, return null (user can set manually)
    return null;
  }
}

/** Escape single quotes for WIQL query string interpolation. */
function escapeWiql(value: string): string {
  return value.replace(/'/g, "''");
}

/** Extract parent work item ID from a work item's relations array. */
function extractParentId(relations?: WorkItemRelation[]): number | undefined {
  if (!relations) return undefined;
  const parentRelation = relations.find(
    (r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse',
  );
  if (!parentRelation) return undefined;
  const match = parentRelation.url.match(/\/workItems\/(\d+)$/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Extract linked Pull Request IDs from a work item's relations array.
 * PR artifact links use rel "ArtifactLink" with URL format:
 *   vstfs:///Git/PullRequestId/{projectGuid}%2F{repoGuid}%2F{prId}
 */
function extractLinkedPrs(relations?: WorkItemRelation[]): LinkedPr[] {
  if (!relations) {
    return [];
  }
  const artifactLinks = relations.filter((r) => r.rel === 'ArtifactLink');
  const prs: LinkedPr[] = [];
  for (const r of artifactLinks) {
    // Match vstfs:///Git/PullRequestId/{projectGuid}%2F{repoGuid}%2F{prId}
    // Handles both %2F-encoded and plain / separators
    const match = r.url.match(
      /vstfs:\/\/\/Git\/PullRequestId\/([^%/]+)(?:%2F|\/)([^%/]+)(?:%2F|\/)(\d+)/i,
    );
    if (match) {
      prs.push({
        projectId: match[1],
        repoId: match[2],
        prId: parseInt(match[3], 10),
      });
    }
  }
  return prs;
}

/**
 * Fetch PR statuses using project-scoped API (more reliable than org-level).
 * Each LinkedPr carries the project and repo GUIDs extracted from the vstfs URL.
 * Returns a map of PR ID → { status, url }.
 */
export async function getPullRequestStatuses(params: {
  providerId: string;
  linkedPrs: LinkedPr[];
}): Promise<
  Map<number, { status: 'active' | 'completed' | 'abandoned'; url: string }>
> {
  if (params.linkedPrs.length === 0) return new Map();
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const results = new Map<
    number,
    { status: 'active' | 'completed' | 'abandoned'; url: string }
  >();

  // Fetch in chunks to avoid too many concurrent requests
  for (let i = 0; i < params.linkedPrs.length; i += 10) {
    const chunk = params.linkedPrs.slice(i, i + 10);
    await Promise.all(
      chunk.map(async (linkedPr) => {
        try {
          // Use project-scoped API with GUIDs extracted from the vstfs artifact link
          const apiUrl = `https://dev.azure.com/${orgName}/${linkedPr.projectId}/_apis/git/repositories/${linkedPr.repoId}/pullrequests/${linkedPr.prId}?api-version=7.0`;
          const response = await fetch(apiUrl, {
            headers: { Authorization: authHeader },
          });
          if (!response.ok) {
            dbg.azure(
              'getPullRequestStatuses: failed PR#%d → %d %s',
              linkedPr.prId,
              response.status,
              response.statusText,
            );
            return;
          }
          const pr: {
            status: string;
            repository?: { project?: { name?: string }; name?: string };
            pullRequestId: number;
          } = await response.json();
          const projectName = pr.repository?.project?.name ?? '';
          const repoName = pr.repository?.name ?? '';
          const url =
            projectName && repoName
              ? `https://dev.azure.com/${orgName}/${encodeURIComponent(projectName)}/_git/${encodeURIComponent(repoName)}/pullrequest/${linkedPr.prId}`
              : '';
          const mappedStatus = mapPrStatus(pr.status);
          results.set(linkedPr.prId, {
            status: mappedStatus,
            url,
          });
        } catch (err) {
          dbg.azure(
            'getPullRequestStatuses: exception fetching PR#%d: %O',
            linkedPr.prId,
            err,
          );
        }
      }),
    );
  }

  return results;
}

export async function queryWorkItems(params: {
  providerId: string;
  projectId: string;
  projectName: string;
  filters: {
    states?: string[];
    workItemTypes?: string[];
    excludeWorkItemTypes?: string[];
    searchText?: string;
    iterationPath?: string;
  };
}): Promise<AzureDevOpsWorkItem[]> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  // Extract org name from baseUrl
  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const authHeader = createAuthHeader(token);

  // Build WIQL query conditions
  // Note: [System.TeamProject] requires the project name, not the GUID
  const conditions: string[] = [
    `[System.TeamProject] = '${escapeWiql(params.projectName)}'`,
  ];

  if (params.filters.states && params.filters.states.length > 0) {
    const statesList = params.filters.states
      .map((s) => `'${escapeWiql(s)}'`)
      .join(', ');
    conditions.push(`[System.State] IN (${statesList})`);
  }

  if (params.filters.workItemTypes && params.filters.workItemTypes.length > 0) {
    const typesList = params.filters.workItemTypes
      .map((t) => `'${escapeWiql(t)}'`)
      .join(', ');
    conditions.push(`[System.WorkItemType] IN (${typesList})`);
  }

  // Exclude specific work item types
  if (
    params.filters.excludeWorkItemTypes &&
    params.filters.excludeWorkItemTypes.length > 0
  ) {
    for (const excludeType of params.filters.excludeWorkItemTypes) {
      conditions.push(`[System.WorkItemType] <> '${escapeWiql(excludeType)}'`);
    }
  }

  // Add search text filter - search ID (exact match) OR title (contains)
  if (params.filters.searchText && params.filters.searchText.trim()) {
    const searchText = params.filters.searchText.trim();
    const escapedSearch = escapeWiql(searchText);

    // System.Id is an integer field, so we can only do exact match on it
    // If search text is numeric, search both ID (exact) and title; otherwise just title
    if (/^\d+$/.test(searchText)) {
      conditions.push(
        `([System.Id] = ${searchText} OR [System.Title] Contains '${escapedSearch}')`,
      );
    } else {
      conditions.push(`[System.Title] Contains '${escapedSearch}'`);
    }
  }

  // Filter by iteration path
  if (params.filters.iterationPath) {
    conditions.push(
      `[System.IterationPath] = '${escapeWiql(params.filters.iterationPath)}'`,
    );
  }

  const wiqlQuery = `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;

  // POST WIQL query - use projectName in URL path (Azure DevOps requires name, not GUID)
  const wiqlResponse = await fetch(
    `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_apis/wit/wiql?api-version=7.0&$top=200`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: wiqlQuery }),
    },
  );

  if (!wiqlResponse.ok) {
    const error = await wiqlResponse.text();
    throw new Error(`Failed to query work items: ${error}`);
  }

  const wiqlData: WiqlResponse = await wiqlResponse.json();

  if (wiqlData.workItems.length === 0) {
    return [];
  }

  // Batch-fetch work item details with relations to get parent info
  // Note: $expand=relations cannot be used with the fields parameter, so we fetch all fields
  const ids = wiqlData.workItems.map((wi) => wi.id);
  const batchResponse = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=relations&api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!batchResponse.ok) {
    const error = await batchResponse.text();
    throw new Error(`Failed to fetch work item details: ${error}`);
  }

  const batchData: WorkItemsBatchResponse = await batchResponse.json();

  // Map to AzureDevOpsWorkItem[]
  return batchData.value.map((wi) => ({
    id: wi.id,
    url: `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_workitems/edit/${wi.id}`,
    fields: {
      title: wi.fields['System.Title'],
      workItemType: wi.fields['System.WorkItemType'],
      state: wi.fields['System.State'],
      assignedTo: wi.fields['System.AssignedTo']?.displayName,
      description: wi.fields['System.Description'],
      reproSteps: wi.fields['Microsoft.VSTS.TCM.ReproSteps'],
      changedDate: wi.fields['System.ChangedDate'],
    },
    parentId: extractParentId(wi.relations),
  }));
}

export async function queryAssignedWorkItems(params: {
  providerId: string;
  projectName: string;
}): Promise<AzureDevOpsWorkItem[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const conditions: string[] = [
    `[System.TeamProject] = '${escapeWiql(params.projectName)}'`,
    `[System.AssignedTo] = @Me`,
    `[System.State] IN ('New', 'Active')`,
    `[System.WorkItemType] <> 'Test Suite'`,
    `[System.WorkItemType] <> 'Test Plan'`,
  ];

  const wiqlQuery = `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;

  const wiqlResponse = await fetch(
    `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_apis/wit/wiql?api-version=7.0&$top=50`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: wiqlQuery }),
    },
  );

  if (!wiqlResponse.ok) {
    const error = await wiqlResponse.text();
    throw new Error(`Failed to query assigned work items: ${error}`);
  }

  const wiqlData: WiqlResponse = await wiqlResponse.json();

  if (wiqlData.workItems.length === 0) {
    return [];
  }

  const ids = wiqlData.workItems.map((wi) => wi.id);
  const batchResponse = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=relations&api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!batchResponse.ok) {
    const error = await batchResponse.text();
    throw new Error(`Failed to fetch assigned work item details: ${error}`);
  }

  const batchData: WorkItemsBatchResponse = await batchResponse.json();

  return batchData.value.map((wi) => ({
    id: wi.id,
    url: `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_workitems/edit/${wi.id}`,
    fields: {
      title: wi.fields['System.Title'],
      workItemType: wi.fields['System.WorkItemType'],
      state: wi.fields['System.State'],
      assignedTo: wi.fields['System.AssignedTo']?.displayName,
      description: wi.fields['System.Description'],
      reproSteps: wi.fields['Microsoft.VSTS.TCM.ReproSteps'],
      changedDate: wi.fields['System.ChangedDate'],
    },
    parentId: extractParentId(wi.relations),
    linkedPrs: extractLinkedPrs(wi.relations),
  }));
}

export async function getWorkItemById(params: {
  providerId: string;
  workItemId: number;
}): Promise<AzureDevOpsWorkItem | null> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const response = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workitems/${params.workItemId}?$expand=relations&api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.text();
    throw new Error(`Failed to fetch work item ${params.workItemId}: ${error}`);
  }

  const wi = await response.json();

  return {
    id: wi.id,
    url:
      wi._links?.html?.href ??
      `https://dev.azure.com/${orgName}/_workitems/edit/${wi.id}`,
    fields: {
      title: wi.fields['System.Title'],
      workItemType: wi.fields['System.WorkItemType'],
      state: wi.fields['System.State'],
      assignedTo: wi.fields['System.AssignedTo']?.displayName,
      description: wi.fields['System.Description'],
      reproSteps: wi.fields['Microsoft.VSTS.TCM.ReproSteps'],
      changedDate: wi.fields['System.ChangedDate'],
    },
    parentId: extractParentId(wi.relations),
  };
}

export async function getIterations(params: {
  providerId: string;
  projectName: string;
}): Promise<AzureDevOpsIteration[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_apis/work/teamsettings/iterations?api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch iterations: ${error}`);
  }

  const data: {
    count: number;
    value: Array<{
      id: string;
      name: string;
      path: string;
      attributes: {
        startDate?: string;
        finishDate?: string;
        timeFrame?: string;
      };
    }>;
  } = await response.json();

  const now = new Date();

  return data.value.map((iter) => {
    const startDate = iter.attributes.startDate ?? null;
    const finishDate = iter.attributes.finishDate ?? null;
    const isCurrent =
      startDate && finishDate
        ? now >= new Date(startDate) && now <= new Date(finishDate)
        : false;

    return {
      id: iter.id,
      name: iter.name,
      path: iter.path,
      startDate,
      finishDate,
      isCurrent,
    };
  });
}

export async function createPullRequest(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  isDraft: boolean;
  workItemIds?: string[];
}): Promise<{ id: number; url: string }> {
  const provider = await ProviderRepository.findById(params.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${params.providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${params.providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${params.providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests?api-version=7.0`,
    {
      method: 'POST',
      headers: {
        Authorization: createAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceRefName: `refs/heads/${params.sourceBranch}`,
        targetRefName: `refs/heads/${params.targetBranch}`,
        title: params.title,
        description: params.description,
        isDraft: params.isDraft,
        ...(params.workItemIds &&
          params.workItemIds.length > 0 && {
            workItemRefs: params.workItemIds.map((id) => ({
              id,
            })),
          }),
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = '';
    if (errorText) {
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.Message || errorText;
      } catch {
        errorMessage = errorText;
      }
    }
    throw new Error(
      `Failed to create pull request (HTTP ${response.status}): ${errorMessage || response.statusText}`,
    );
  }

  const pr = await response.json();
  return {
    id: pr.pullRequestId,
    url: `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`,
  };
}

export async function getProviderDetails(
  providerId: string,
): Promise<AzureDevOpsOrgDetails> {
  const provider = await ProviderRepository.findById(providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }
  if (provider.type !== 'azure-devops') {
    throw new Error(`Provider is not Azure DevOps: ${provider.type}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${providerId}`);
  }

  // Extract org name from baseUrl
  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  const authHeader = createAuthHeader(token);

  // Fetch all projects in the organization
  const projectsResponse = await fetch(
    `https://dev.azure.com/${orgName}/_apis/projects?api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!projectsResponse.ok) {
    const error = await projectsResponse.text();
    throw new Error(`Failed to fetch projects: ${error}`);
  }

  const projectsData: ProjectsResponse = await projectsResponse.json();

  // Fetch repos for all projects in parallel
  const projectsWithRepos = await Promise.all(
    projectsData.value.map(async (project) => {
      const reposResponse = await fetch(
        `https://dev.azure.com/${orgName}/${project.id}/_apis/git/repositories?api-version=7.0`,
        {
          headers: { Authorization: authHeader },
        },
      );

      let repos: AzureDevOpsRepo[] = [];
      if (reposResponse.ok) {
        const reposData: ReposResponse = await reposResponse.json();
        repos = reposData.value.map((repo) => ({
          id: repo.id,
          name: repo.name,
          url: repo.webUrl,
          projectId: repo.project.id,
        }));
      }

      return {
        project: {
          id: project.id,
          name: project.name,
          url: `https://dev.azure.com/${orgName}/${encodeURIComponent(project.name)}`,
        },
        repos,
      };
    }),
  );

  return { projects: projectsWithRepos };
}

export interface CloneRepositoryParams {
  orgName: string;
  projectName: string;
  repoName: string;
  targetPath: string;
}

export interface CloneRepositoryResult {
  success: boolean;
  error?: string;
}

// Regex patterns to detect SSH host authenticity prompt
const SSH_AUTHENTICITY_PATTERN = /The authenticity of host '([^']+)'/;
const FINGERPRINT_PATTERN = /(\w+) key fingerprint is ([^\s.]+)/;

export async function cloneRepository(
  params: CloneRepositoryParams,
): Promise<CloneRepositoryResult> {
  const { orgName, projectName, repoName, targetPath } = params;

  // Build SSH URL for Azure DevOps
  // Format: git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
  const sshUrl = `git@ssh.dev.azure.com:v3/${orgName}/${encodeURIComponent(projectName)}/${encodeURIComponent(repoName)}`;

  return new Promise((resolve) => {
    const gitProcess = spawn('git', ['clone', sshUrl, targetPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    let promptHandled = false;

    gitProcess.stderr.on('data', async (data: Buffer) => {
      stderr += data.toString();

      // Check for SSH host authenticity prompt
      if (!promptHandled && SSH_AUTHENTICITY_PATTERN.test(stderr)) {
        promptHandled = true;

        const hostMatch = stderr.match(SSH_AUTHENTICITY_PATTERN);
        const fingerprintMatch = stderr.match(FINGERPRINT_PATTERN);

        const host = hostMatch?.[1] ?? 'unknown';
        const keyType = fingerprintMatch?.[1] ?? 'Unknown';
        const fingerprint = fingerprintMatch?.[2] ?? 'unknown';

        const accepted = await sendGlobalPromptToWindow({
          title: 'Unknown SSH Host',
          message: `The authenticity of host '${host}' can't be established.`,
          details: `${keyType} key fingerprint:\n${fingerprint}`,
          acceptLabel: 'Trust & Connect',
          rejectLabel: 'Cancel',
        });

        if (gitProcess.stdin) {
          gitProcess.stdin.write(accepted ? 'yes\n' : 'no\n');
        }
      }
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        // Parse common git clone errors for user-friendly messages
        let errorMessage = stderr.trim();

        if (
          stderr.includes('Permission denied') ||
          stderr.includes('Could not read from remote repository')
        ) {
          errorMessage =
            'SSH key not configured or permission denied. Please ensure your SSH key is set up for Azure DevOps.';
        } else if (
          stderr.includes('already exists and is not an empty directory')
        ) {
          errorMessage = 'Target directory already exists and is not empty.';
        } else if (stderr.includes('Repository not found')) {
          errorMessage =
            'Repository not found. Please check if the repository exists.';
        } else if (stderr.includes('Host key verification failed')) {
          errorMessage = 'SSH host verification was rejected.';
        }

        resolve({ success: false, error: errorMessage });
      }
    });

    gitProcess.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to run git: ${err.message}`,
      });
    });
  });
}

// Helper to get auth header and org name from provider
async function getProviderAuth(providerId: string): Promise<{
  authHeader: string;
  orgName: string;
}> {
  const provider = await ProviderRepository.findById(providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }
  if (!provider.tokenId) {
    throw new Error(`Provider has no associated token: ${providerId}`);
  }

  const token = await TokenRepository.getDecryptedToken(provider.tokenId);
  if (!token) {
    throw new Error(`Token not found for provider: ${providerId}`);
  }

  const orgName = provider.baseUrl.split('/').pop();
  if (!orgName) {
    throw new Error(`Invalid provider baseUrl: ${provider.baseUrl}`);
  }

  return {
    authHeader: createAuthHeader(token),
    orgName,
  };
}

export async function getCurrentUser(
  providerId: string,
): Promise<AzureDevOpsUser> {
  const { authHeader } = await getProviderAuth(providerId);

  const profileResponse = await fetch(
    'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.0',
    {
      headers: {
        Authorization: authHeader,
      },
    },
  );

  if (!profileResponse.ok) {
    const error = await profileResponse.text();
    throw new Error(`Failed to fetch user profile: ${error}`);
  }

  const profile: ProfileResponse = await profileResponse.json();

  return {
    id: profile.id,
    displayName: profile.displayName,
    emailAddress: profile.emailAddress,
  };
}

// Pull Request API response types
interface PullRequestResponse {
  pullRequestId: number;
  title: string;
  status: string;
  isDraft: boolean;
  createdBy: {
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  creationDate: string;
  sourceRefName: string;
  targetRefName: string;
  description?: string;
  mergeStatus?: string;
  reviewers?: Array<{
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
    vote: number;
    isContainer?: boolean; // true if this is a group, false/undefined if user
  }>;
}

interface PullRequestsListResponse {
  count: number;
  value: PullRequestResponse[];
}

// GitUserDate from Azure DevOps API
interface GitUserDate {
  date: string;
  email: string;
  name: string;
  imageUrl?: string;
}

// GitCommitRef from Azure DevOps API
interface CommitResponse {
  commitId: string;
  author: GitUserDate;
  committer?: GitUserDate;
  comment: string;
  commentTruncated?: boolean;
  url: string;
  remoteUrl?: string;
  parents?: string[];
}

interface CommitsListResponse {
  count: number;
  value: CommitResponse[];
}

// GitPullRequestChange from Azure DevOps API
// changeType can be: None(0), Add(1), Edit(2), Encoding(4), Rename(8), Delete(16),
// Undelete(32), Branch(64), Merge(128), Lock(256), Rollback(512), SourceRename(1024),
// TargetRename(2048), Property(4096), All(8191)
// The API returns string values like "add", "edit", "delete", "rename", etc.
interface ChangeResponse {
  changeTrackingId?: number;
  changeId?: number;
  changeType: string; // e.g., "add", "edit", "delete", "rename", "edit, rename"
  item?: {
    objectId?: string;
    originalObjectId?: string;
    path: string;
    url?: string;
  };
  originalPath?: string;
  sourceServerItem?: string;
  url?: string;
}

// GitPullRequestIterationChanges from Azure DevOps API
interface ChangesListResponse {
  changeEntries: ChangeResponse[];
  nextSkip?: number;
  nextTop?: number;
}

interface CommentResponse {
  id: number;
  parentCommentId?: number;
  content: string;
  commentType?: string; // 'unknown', 'text', 'codeChange', 'system'
  isDeleted?: boolean;
  author: {
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  publishedDate: string;
  lastUpdatedDate: string;
  lastContentUpdatedDate?: string;
}

interface ThreadResponse {
  id: number;
  status?: string; // 'unknown', 'active', 'fixed', 'wontFix', 'closed', 'byDesign', 'pending'
  publishedDate?: string;
  lastUpdatedDate?: string;
  threadContext?: {
    filePath: string;
    leftFileStart?: { line: number; offset?: number };
    leftFileEnd?: { line: number; offset?: number };
    rightFileStart?: { line: number; offset?: number };
    rightFileEnd?: { line: number; offset?: number };
  };
  pullRequestThreadContext?: {
    iterationContext?: {
      firstComparingIteration: number;
      secondComparingIteration: number;
    };
    changeTrackingId?: number;
  };
  comments: CommentResponse[];
  isDeleted: boolean;
  properties?: Record<string, unknown>;
}

interface ThreadsListResponse {
  count: number;
  value: ThreadResponse[];
}

function mapPrStatus(status: string): 'active' | 'completed' | 'abandoned' {
  switch (status.toLowerCase()) {
    case 'active':
      return 'active';
    case 'completed':
      return 'completed';
    case 'abandoned':
      return 'abandoned';
    default:
      return 'active';
  }
}

function mapVoteToStatus(vote: number): ReviewerVoteStatus {
  if (vote === 10) return 'approved';
  if (vote === 5) return 'approved-with-suggestions';
  if (vote === -5) return 'waiting';
  if (vote <= -10) return 'rejected';
  return 'none';
}

function mapChangeType(
  changeType: string,
): 'add' | 'edit' | 'delete' | 'rename' {
  // changeType can be a single value or combined (e.g., "edit, rename")
  const lowerType = changeType.toLowerCase();

  // Check for specific types - order matters for combined types
  if (lowerType.includes('delete')) {
    return 'delete';
  }
  if (
    lowerType.includes('rename') ||
    lowerType.includes('sourcerename') ||
    lowerType.includes('targetrename')
  ) {
    return 'rename';
  }
  if (lowerType.includes('add')) {
    return 'add';
  }
  if (
    lowerType.includes('edit') ||
    lowerType.includes('merge') ||
    lowerType.includes('encoding')
  ) {
    return 'edit';
  }

  return 'edit';
}

function mapThreadStatus(
  status?: string,
):
  | 'active'
  | 'fixed'
  | 'wontFix'
  | 'closed'
  | 'byDesign'
  | 'pending'
  | 'unknown' {
  if (!status) return 'unknown';
  switch (status.toLowerCase()) {
    case 'active':
      return 'active';
    case 'fixed':
      return 'fixed';
    case 'wontfix':
      return 'wontFix';
    case 'closed':
      return 'closed';
    case 'bydesign':
      return 'byDesign';
    case 'pending':
      return 'pending';
    default:
      return 'unknown';
  }
}

function mapCommentType(
  commentType?: string,
): 'text' | 'codeChange' | 'system' | 'unknown' {
  if (!commentType) return 'text';
  switch (commentType.toLowerCase()) {
    case 'text':
      return 'text';
    case 'codechange':
      return 'codeChange';
    case 'system':
      return 'system';
    default:
      return 'unknown';
  }
}

export async function listPullRequests(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  status?: 'active' | 'completed' | 'abandoned' | 'all';
}): Promise<AzureDevOpsPullRequest[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const statusParam =
    params.status === 'all' ? 'all' : (params.status ?? 'active');
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests?searchCriteria.status=${statusParam}&api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list pull requests: ${error}`);
  }

  const data: PullRequestsListResponse = await response.json();

  return data.value.map((pr) => ({
    id: pr.pullRequestId,
    title: pr.title,
    status: mapPrStatus(pr.status),
    isDraft: pr.isDraft,
    createdBy: {
      displayName: pr.createdBy.displayName,
      uniqueName: pr.createdBy.uniqueName,
      imageUrl: pr.createdBy.imageUrl,
    },
    creationDate: pr.creationDate,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    url: `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`,
    reviewers: (pr.reviewers ?? []).map((r) => ({
      displayName: r.displayName,
      uniqueName: r.uniqueName,
      imageUrl: r.imageUrl,
      voteStatus: mapVoteToStatus(r.vote),
      isContainer: r.isContainer,
    })),
  }));
}

export async function getPullRequest(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<AzureDevOpsPullRequestDetails> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get pull request: ${error}`);
  }

  const pr: PullRequestResponse = await response.json();

  return {
    id: pr.pullRequestId,
    title: pr.title,
    status: mapPrStatus(pr.status),
    isDraft: pr.isDraft,
    createdBy: {
      displayName: pr.createdBy.displayName,
      uniqueName: pr.createdBy.uniqueName,
      imageUrl: pr.createdBy.imageUrl,
    },
    creationDate: pr.creationDate,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    url: `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`,
    description: pr.description ?? '',
    mergeStatus: pr.mergeStatus as AzureDevOpsPullRequestDetails['mergeStatus'],
    reviewers: (pr.reviewers ?? []).map((r) => ({
      displayName: r.displayName,
      uniqueName: r.uniqueName,
      imageUrl: r.imageUrl,
      voteStatus: mapVoteToStatus(r.vote),
      isContainer: r.isContainer,
    })),
  };
}

export async function getPullRequestWorkItems(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<AzureDevOpsWorkItem[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const refsUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/workitems?api-version=7.0`;

  const refsResponse = await fetch(refsUrl, {
    headers: { Authorization: authHeader },
  });

  if (!refsResponse.ok) {
    const error = await refsResponse.text();
    throw new Error(`Failed to fetch PR work items: ${error}`);
  }

  const refsData: { value: Array<{ id: string; url: string }> } =
    await refsResponse.json();

  if (refsData.value.length === 0) {
    return [];
  }

  const ids = refsData.value.map((ref) => ref.id);
  const batchResponse = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=relations&api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!batchResponse.ok) {
    const error = await batchResponse.text();
    throw new Error(`Failed to fetch PR work item details: ${error}`);
  }

  const batchData: WorkItemsBatchResponse = await batchResponse.json();

  return batchData.value.map((wi) => ({
    id: wi.id,
    url: `https://dev.azure.com/${orgName}/_workitems/edit/${wi.id}`,
    fields: {
      title: wi.fields['System.Title'],
      workItemType: wi.fields['System.WorkItemType'],
      state: wi.fields['System.State'],
      assignedTo: wi.fields['System.AssignedTo']?.displayName,
      description: wi.fields['System.Description'],
      reproSteps: wi.fields['Microsoft.VSTS.TCM.ReproSteps'],
      changedDate: wi.fields['System.ChangedDate'],
    },
    parentId: extractParentId(wi.relations),
  }));
}

export async function getPullRequestCommits(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<AzureDevOpsCommit[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/commits?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get pull request commits: ${error}`);
  }

  const data: CommitsListResponse = await response.json();

  return data.value.map((commit) => ({
    commitId: commit.commitId,
    author: {
      name: commit.author.name,
      email: commit.author.email,
      date: commit.author.date,
    },
    comment: commit.comment,
    url: commit.url,
  }));
}

export async function getPullRequestChanges(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<AzureDevOpsFileChange[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  // First get the iterations to find the latest one
  const iterationsUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/iterations?api-version=7.0`;
  const iterationsResponse = await fetch(iterationsUrl, {
    headers: { Authorization: authHeader },
  });

  if (!iterationsResponse.ok) {
    const error = await iterationsResponse.text();
    throw new Error(`Failed to get pull request iterations: ${error}`);
  }

  const iterationsData: { count: number; value: Array<{ id: number }> } =
    await iterationsResponse.json();

  if (iterationsData.count === 0) {
    return [];
  }

  // Get changes from the latest iteration
  const latestIterationId =
    iterationsData.value[iterationsData.value.length - 1].id;
  const changesUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/iterations/${latestIterationId}/changes?api-version=7.0`;

  const changesResponse = await fetch(changesUrl, {
    headers: { Authorization: authHeader },
  });

  if (!changesResponse.ok) {
    const error = await changesResponse.text();
    throw new Error(`Failed to get pull request changes: ${error}`);
  }

  const data: ChangesListResponse = await changesResponse.json();

  return data.changeEntries
    .filter((change) => change.item?.path) // Filter out entries without paths
    .map((change) => ({
      path: change.item!.path,
      changeType: mapChangeType(change.changeType),
      originalPath: change.originalPath,
    }));
}

export async function getPullRequestFileContent(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  filePath: string;
  version: 'base' | 'head';
}): Promise<string> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  // First get the PR to find source and target refs
  const prUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}?api-version=7.0`;
  const prResponse = await fetch(prUrl, {
    headers: { Authorization: authHeader },
  });

  if (!prResponse.ok) {
    const error = await prResponse.text();
    throw new Error(`Failed to get pull request: ${error}`);
  }

  const pr: { sourceRefName: string; targetRefName: string } =
    await prResponse.json();

  // Determine which version to fetch
  const versionDescriptor =
    params.version === 'base'
      ? pr.targetRefName.replace('refs/heads/', '')
      : pr.sourceRefName.replace('refs/heads/', '');

  const contentUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/items?path=${encodeURIComponent(params.filePath)}&versionDescriptor.version=${encodeURIComponent(versionDescriptor)}&versionDescriptor.versionType=branch&api-version=7.0`;

  const response = await fetch(contentUrl, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    // File might not exist in base (new file) or head (deleted file)
    if (response.status === 404) {
      return '';
    }
    const error = await response.text();
    throw new Error(`Failed to get file content: ${error}`);
  }

  return response.text();
}

export async function getPullRequestThreads(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<AzureDevOpsCommentThread[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get pull request threads: ${error}`);
  }

  const data: ThreadsListResponse = await response.json();

  return (
    data.value
      // Filter out threads that only contain system comments
      .filter((thread) => {
        if (thread.isDeleted) return false;
        // Keep thread if it has at least one non-system comment
        return thread.comments.some(
          (c) => c.commentType !== 'system' && c.content,
        );
      })
      .map((thread) => ({
        id: thread.id,
        status: mapThreadStatus(thread.status),
        threadContext: thread.threadContext
          ? {
              filePath: thread.threadContext.filePath,
              rightFileStart: thread.threadContext.rightFileStart,
              rightFileEnd: thread.threadContext.rightFileEnd,
            }
          : undefined,
        comments: thread.comments
          // Filter out system comments within threads
          .filter((c) => c.commentType !== 'system')
          .map((comment) => ({
            id: comment.id,
            parentCommentId: comment.parentCommentId,
            content: comment.content,
            commentType: mapCommentType(comment.commentType),
            author: {
              displayName: comment.author.displayName,
              uniqueName: comment.author.uniqueName,
              imageUrl: comment.author.imageUrl,
            },
            publishedDate: comment.publishedDate,
            lastUpdatedDate: comment.lastUpdatedDate,
          })),
        isDeleted: thread.isDeleted,
      }))
  );
}

export async function addPullRequestComment(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  content: string;
}): Promise<AzureDevOpsCommentThread> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads?api-version=7.0`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      comments: [{ content: params.content, commentType: 1 }],
      status: 'active',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to add comment: ${error}`);
  }

  const thread: ThreadResponse = await response.json();

  return {
    id: thread.id,
    status: mapThreadStatus(thread.status),
    threadContext: thread.threadContext
      ? {
          filePath: thread.threadContext.filePath,
          rightFileStart: thread.threadContext.rightFileStart,
          rightFileEnd: thread.threadContext.rightFileEnd,
        }
      : undefined,
    comments: thread.comments.map((comment) => ({
      id: comment.id,
      parentCommentId: comment.parentCommentId,
      content: comment.content,
      commentType: mapCommentType(comment.commentType),
      author: {
        displayName: comment.author.displayName,
        uniqueName: comment.author.uniqueName,
        imageUrl: comment.author.imageUrl,
      },
      publishedDate: comment.publishedDate,
      lastUpdatedDate: comment.lastUpdatedDate,
    })),
    isDeleted: thread.isDeleted,
  };
}

export async function getWorkItem(params: {
  providerId: string;
  workItemId: number;
}): Promise<{ assignedTo?: string }> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/_apis/wit/workitems/${params.workItemId}?fields=System.AssignedTo&api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch work item ${params.workItemId}: ${error}`);
  }

  const data: {
    fields: {
      'System.AssignedTo'?: { displayName: string; uniqueName: string };
    };
  } = await response.json();

  return {
    assignedTo: data.fields['System.AssignedTo']?.uniqueName,
  };
}

export async function activateWorkItem(params: {
  providerId: string;
  workItemId: number;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  // Check if work item is currently unassigned
  const workItem = await getWorkItem(params);

  // Build patch operations
  const patchOps: Array<{ op: string; path: string; value: string }> = [
    {
      op: 'add',
      path: '/fields/System.State',
      value: 'Active',
    },
  ];

  // Only assign if currently unassigned
  if (!workItem.assignedTo) {
    const currentUser = await getCurrentUser(params.providerId);
    patchOps.push({
      op: 'add',
      path: '/fields/System.AssignedTo',
      value: currentUser.emailAddress,
    });
  }

  const url = `https://dev.azure.com/${orgName}/_apis/wit/workitems/${params.workItemId}?api-version=7.0`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json-patch+json',
    },
    body: JSON.stringify(patchOps),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to activate work item ${params.workItemId}: ${error}`,
    );
  }
}

export async function getPullRequestActivityMetadata(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<{
  lastCommitDate: string | null;
  lastThreadActivityDate: string | null;
  activeThreadCount: number;
}> {
  const [commits, threads] = await Promise.all([
    getPullRequestCommits(params),
    getPullRequestThreads(params),
  ]);

  // Latest commit date (commits are returned newest-first by Azure DevOps)
  const lastCommitDate = commits.length > 0 ? commits[0].author.date : null;

  // Filter out deleted and system threads
  const realThreads = threads.filter(
    (t) => !t.isDeleted && t.comments.some((c) => c.commentType !== 'system'),
  );

  // Find max lastUpdatedDate across all comments in all threads
  let lastThreadActivityDate: string | null = null;
  let activeThreadCount = 0;

  for (const thread of realThreads) {
    if (thread.status === 'active') {
      activeThreadCount++;
    }
    for (const comment of thread.comments) {
      if (
        !lastThreadActivityDate ||
        comment.lastUpdatedDate > lastThreadActivityDate
      ) {
        lastThreadActivityDate = comment.lastUpdatedDate;
      }
    }
  }

  return { lastCommitDate, lastThreadActivityDate, activeThreadCount };
}

export async function addThreadReply(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  threadId: number;
  content: string;
}): Promise<AzureDevOpsComment> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads/${params.threadId}/comments?api-version=7.0`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: params.content,
      parentCommentId: 1,
      commentType: 1,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to add thread reply: ${error}`);
  }

  const comment: CommentResponse = await response.json();

  return {
    id: comment.id,
    parentCommentId: comment.parentCommentId,
    content: comment.content,
    commentType: mapCommentType(comment.commentType),
    author: {
      displayName: comment.author.displayName,
      uniqueName: comment.author.uniqueName,
      imageUrl: comment.author.imageUrl,
    },
    publishedDate: comment.publishedDate,
    lastUpdatedDate: comment.lastUpdatedDate,
  };
}

const THREAD_STATUS_MAP: Record<string, number> = {
  active: 1,
  fixed: 2,
  wontFix: 3,
  closed: 4,
  byDesign: 5,
  pending: 6,
};

export async function updateThreadStatus(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  threadId: number;
  status: string;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads/${params.threadId}?api-version=7.0`;

  const statusValue = THREAD_STATUS_MAP[params.status] ?? 1;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: statusValue,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update thread status: ${error}`);
  }
}

export async function addPullRequestFileComment(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  filePath: string;
  line: number;
  lineEnd?: number;
  content: string;
}): Promise<AzureDevOpsCommentThread> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads?api-version=7.0`;

  const endLine = params.lineEnd ?? params.line;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      comments: [{ content: params.content, commentType: 1 }],
      status: 'active',
      threadContext: {
        filePath: params.filePath.startsWith('/')
          ? params.filePath
          : `/${params.filePath}`,
        rightFileStart: { line: params.line, offset: 1 },
        rightFileEnd: { line: endLine, offset: 1 },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to add file comment: ${error}`);
  }

  const thread: ThreadResponse = await response.json();

  return {
    id: thread.id,
    status: mapThreadStatus(thread.status),
    threadContext: thread.threadContext
      ? {
          filePath: thread.threadContext.filePath,
          rightFileStart: thread.threadContext.rightFileStart,
          rightFileEnd: thread.threadContext.rightFileEnd,
        }
      : undefined,
    comments: thread.comments.map((comment) => ({
      id: comment.id,
      parentCommentId: comment.parentCommentId,
      content: comment.content,
      commentType: mapCommentType(comment.commentType),
      author: {
        displayName: comment.author.displayName,
        uniqueName: comment.author.uniqueName,
        imageUrl: comment.author.imageUrl,
      },
      publishedDate: comment.publishedDate,
      lastUpdatedDate: comment.lastUpdatedDate,
    })),
    isDeleted: thread.isDeleted,
  };
}

// ─── Pipeline & Release Tracking APIs ────────────────────────────────

const PIPELINE_API_TIMEOUT_MS = 15_000;

export async function listBuildDefinitions(params: {
  providerId: string;
  projectId: string;
}): Promise<AzureBuildDefinition[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/definitions?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list build definitions: ${error}`);
  }

  const data: { value: AzureBuildDefinition[] } = await response.json();
  return data.value;
}

export async function listReleaseDefinitions(params: {
  providerId: string;
  projectId: string;
}): Promise<AzureReleaseDefinition[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://vsrm.dev.azure.com/${orgName}/${params.projectId}/_apis/release/definitions?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list release definitions: ${error}`);
  }

  const data: { value: AzureReleaseDefinition[] } = await response.json();
  return data.value;
}

export async function listBuilds(params: {
  providerId: string;
  projectId: string;
  definitionId: number;
  minId?: number;
}): Promise<AzureBuildRun[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  let url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds?definitions=${params.definitionId}&$top=50&api-version=7.0`;
  if (params.minId) {
    url += `&minId=${params.minId}`;
  }

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list builds: ${error}`);
  }

  const data: { value: AzureBuildRun[] } = await response.json();
  return data.value;
}

export async function listReleases(params: {
  providerId: string;
  projectId: string;
  definitionId: number;
  minCreatedTime?: string;
}): Promise<AzureRelease[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  let url = `https://vsrm.dev.azure.com/${orgName}/${params.projectId}/_apis/release/releases?definitionId=${params.definitionId}&$top=50&api-version=7.0`;
  if (params.minCreatedTime) {
    url += `&minCreatedTime=${encodeURIComponent(params.minCreatedTime)}`;
  }

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list releases: ${error}`);
  }

  const data: { value: AzureRelease[] } = await response.json();
  return data.value;
}

export async function getBuild(params: {
  providerId: string;
  projectId: string;
  buildId: number;
}): Promise<AzureBuildDetail> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds/${params.buildId}?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get build: ${error}`);
  }

  return response.json();
}

export async function getBuildTimeline(params: {
  providerId: string;
  projectId: string;
  buildId: number;
}): Promise<AzureBuildTimeline> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds/${params.buildId}/timeline?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get build timeline: ${error}`);
  }

  return response.json();
}

export async function getBuildLog(params: {
  providerId: string;
  projectId: string;
  buildId: number;
  logId: number;
}): Promise<string> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds/${params.buildId}/logs/${params.logId}?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader, Accept: 'text/plain' },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get build log: ${error}`);
  }

  return response.text();
}

export async function getRelease(params: {
  providerId: string;
  projectId: string;
  releaseId: number;
}): Promise<AzureReleaseDetail> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://vsrm.dev.azure.com/${orgName}/${params.projectId}/_apis/release/releases/${params.releaseId}?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get release: ${error}`);
  }

  return response.json();
}

export async function listBranches(params: {
  providerId: string;
  projectId: string;
  repoId: string;
}): Promise<AzureGitRef[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/refs?filter=heads/&api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list branches: ${error}`);
  }

  const data: { value: AzureGitRef[] } = await response.json();
  return data.value;
}

/** Maximum YAML response size to accept (1 MB). */
const MAX_YAML_CONTENT_LENGTH = 1_048_576;

export async function getBuildDefinitionDetail(params: {
  providerId: string;
  projectId: string;
  definitionId: number;
}): Promise<AzureBuildDefinitionDetail> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/definitions/${params.definitionId}?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get build definition: ${error}`);
  }

  return response.json();
}

export async function getYamlPipelineParameters(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  yamlFilename: string;
  branch: string;
}): Promise<YamlPipelineParameter[]> {
  validateYamlFilename(params.yamlFilename);

  if (
    !params.providerId ||
    !params.projectId ||
    !params.repoId ||
    !params.branch
  ) {
    throw new Error(
      'All parameters (providerId, projectId, repoId, branch) are required',
    );
  }

  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const yamlPath = params.yamlFilename.startsWith('/')
    ? params.yamlFilename
    : `/${params.yamlFilename}`;
  const branch = params.branch.replace('refs/heads/', '');

  const yamlUrl = new URL(
    `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(params.projectId)}/_apis/git/repositories/${encodeURIComponent(params.repoId)}/items`,
  );
  yamlUrl.searchParams.set('path', yamlPath);
  yamlUrl.searchParams.set('versionDescriptor.version', branch);
  yamlUrl.searchParams.set('versionDescriptor.versionType', 'branch');
  yamlUrl.searchParams.set('api-version', '7.0');

  const yamlResponse = await fetch(yamlUrl.toString(), {
    headers: { Authorization: authHeader },
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!yamlResponse.ok) {
    console.warn(
      `[pipelines] Failed to fetch YAML file ${params.yamlFilename} on branch ${branch}: ${yamlResponse.status} ${yamlResponse.statusText}`,
    );
    return [];
  }

  // Check Content-Length before buffering the entire response into memory
  // to avoid exhausting memory on unexpectedly large files.
  const contentLength = yamlResponse.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_YAML_CONTENT_LENGTH) {
    console.warn(
      `[pipelines] YAML response too large (${contentLength} bytes), skipping`,
    );
    return [];
  }

  return parseYamlParameters(await yamlResponse.text());
}

export async function queueBuild(params: {
  providerId: string;
  projectId: string;
  definitionId: number;
  sourceBranch: string;
  parameters?: Record<string, string>;
  templateParameters?: Record<string, string>;
}): Promise<AzureBuildRun> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds?api-version=7.0`;

  const sourceBranch = params.sourceBranch.startsWith('refs/heads/')
    ? params.sourceBranch
    : `refs/heads/${params.sourceBranch}`;

  const body: Record<string, unknown> = {
    definition: { id: params.definitionId },
    sourceBranch,
  };
  if (params.parameters) {
    body.parameters = JSON.stringify(params.parameters);
  }
  if (params.templateParameters) {
    body.templateParameters = params.templateParameters;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to queue build: ${error}`);
  }

  return response.json();
}

export async function createRelease(params: {
  providerId: string;
  projectId: string;
  definitionId: number;
  description?: string;
}): Promise<AzureRelease> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://vsrm.dev.azure.com/${orgName}/${params.projectId}/_apis/release/releases?api-version=7.0`;

  const body: Record<string, unknown> = {
    definitionId: params.definitionId,
  };
  if (params.description) {
    body.description = params.description;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create release: ${error}`);
  }

  return response.json();
}

export async function cancelBuild(params: {
  providerId: string;
  projectId: string;
  buildId: number;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/builds/${params.buildId}?api-version=7.0`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'cancelling' }),
    signal: AbortSignal.timeout(PIPELINE_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to cancel build: ${error}`);
  }
}
