// electron/services/azure-devops-service.ts

import { spawn } from 'child_process';
import { createHash } from 'crypto';

import TurndownService from 'turndown';

import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
  AzureDevOpsComment,
  AzureDevOpsIdentity,
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
  AzureDevOpsIdentity,
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
  identityId?: string; // Org-level identity ID (matches reviewer IDs)
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

export interface TestStep {
  action: string;
  expectedResult: string;
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
  testSteps?: TestStep[];
  parentId?: number;
  linkedPrs?: LinkedPr[];
  relatedTestCaseIds?: number[];
}

export interface AzureDevOpsIteration {
  id: string;
  name: string;
  path: string;
  startDate: string | null;
  finishDate: string | null;
  isCurrent: boolean;
}

export interface AzureDevOpsWorkItemState {
  name: string;
  color?: string;
  category?: string;
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
      'Microsoft.VSTS.TCM.Steps'?: string;
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

interface IdentitiesResponse {
  value?: Array<{
    id?: string;
    providerDisplayName?: string;
    isActive?: boolean;
    properties?: {
      Account?: { $value?: string };
      Mail?: { $value?: string };
    };
  }>;
}

interface GraphUsersResponse {
  value?: Array<{
    descriptor?: string;
    displayName?: string;
    principalName?: string;
    mailAddress?: string;
    isDeletedInOrigin?: boolean;
  }>;
}

interface GraphStorageKeyResponse {
  value?: string;
}

function maskEmail(emailAddress: string): string {
  const [name, domain] = emailAddress.split('@');
  if (!name || !domain) return '<unknown>';
  return `${name.slice(0, 2)}***@${domain}`;
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

/**
 * Lowercase all HTML/XML tag names so Turndown (HTML→Markdown) can parse them.
 * Azure DevOps TCM content uses uppercase tags like <DIV>, <P>, <STRONG>.
 */
function lowercaseHtmlTags(html: string): string {
  return html.replace(/<\/?[A-Z][A-Z0-9]*\b[^>]*>/g, (tag) =>
    tag.toLowerCase(),
  );
}

/** Shared Turndown instance for converting test step HTML to Markdown. */
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

/**
 * Convert Azure DevOps HTML content to Markdown.
 * Lowercases tags first (Azure uses uppercase), then converts via Turndown.
 */
function htmlToMarkdown(html: string): string {
  if (!html) return '';
  const lowered = lowercaseHtmlTags(html.trim());
  return turndown.turndown(lowered).trim();
}

/**
 * Parse Azure DevOps TCM Steps XML into structured test steps.
 * Each step has two parameterizedString elements (action + expected result)
 * containing HTML content, which is converted to Markdown.
 */
function parseTestSteps(stepsXml: string): TestStep[] {
  const stepRegex =
    /<step[^>]*>[\s\S]*?<parameterizedString[^>]*>([\s\S]*?)<\/parameterizedString>(?:[\s\S]*?<parameterizedString[^>]*>([\s\S]*?)<\/parameterizedString>)?[\s\S]*?<\/step>/gi;
  const steps: TestStep[] = [];
  let match;
  while ((match = stepRegex.exec(stepsXml)) !== null) {
    steps.push({
      action: htmlToMarkdown(match[1] || ''),
      expectedResult: htmlToMarkdown(match[2] || ''),
    });
  }
  return steps;
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

/** Extract linked test case IDs from a work item's relations array.
 * Test case links use rel "Microsoft.VSTS.Common.TestedBy-Forward" (work item → test case)
 * and "Microsoft.VSTS.Common.TestedBy-Reverse" (test case → work item).
 */
function extractLinkedTestCaseIds(relations?: WorkItemRelation[]): number[] {
  if (!relations) return [];
  const testRelations = relations.filter(
    (r) =>
      r.rel === 'Microsoft.VSTS.Common.TestedBy-Forward' ||
      r.rel === 'Microsoft.VSTS.Common.TestedBy-Reverse',
  );
  const ids: number[] = [];
  for (const r of testRelations) {
    const match = r.url.match(/\/workItems\/(\d+)$/i);
    if (match) {
      ids.push(parseInt(match[1], 10));
    }
  }
  return ids;
}

/**
 * Fetch PR statuses using project-scoped API (more reliable than org-level).
 * Each LinkedPr carries the project and repo GUIDs extracted from the vstfs URL.
 * Returns a map of PR ID → status metadata.
 */
type PullRequestStatusMetadata = {
  status: 'active' | 'completed' | 'abandoned';
  url: string;
  isDraft: boolean;
  mergeStatus?: 'succeeded' | 'conflicts' | 'failure' | 'notSet';
  approvedBy: Array<{
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  }>;
};

export async function getPullRequestStatuses(params: {
  providerId: string;
  linkedPrs: LinkedPr[];
}): Promise<Map<string, PullRequestStatusMetadata>> {
  if (params.linkedPrs.length === 0) return new Map();
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const results = new Map<string, PullRequestStatusMetadata>();

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
            isDraft?: boolean;
            mergeStatus?: string;
            repository?: { project?: { name?: string }; name?: string };
            pullRequestId: number;
            reviewers?: PullRequestResponse['reviewers'];
          } = await response.json();
          const projectName = pr.repository?.project?.name ?? '';
          const repoName = pr.repository?.name ?? '';
          const url =
            projectName && repoName
              ? `https://dev.azure.com/${orgName}/${encodeURIComponent(projectName)}/_git/${encodeURIComponent(repoName)}/pullrequest/${linkedPr.prId}`
              : '';
          const mappedStatus = mapPrStatus(pr.status);
          results.set(
            `${linkedPr.projectId}:${linkedPr.repoId}:${linkedPr.prId}`,
            {
              status: mappedStatus,
              url,
              isDraft: !!pr.isDraft,
              mergeStatus:
                pr.mergeStatus as PullRequestStatusMetadata['mergeStatus'],
              approvedBy: (pr.reviewers ?? [])
                .filter(
                  (r) =>
                    !r.isContainer &&
                    (mapVoteToStatus(r.vote) === 'approved' ||
                      mapVoteToStatus(r.vote) === 'approved-with-suggestions'),
                )
                .map((r) => ({
                  displayName: r.displayName,
                  uniqueName: r.uniqueName,
                  imageUrl: r.imageUrl,
                })),
            },
          );
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
    relatedTestCaseIds: extractLinkedTestCaseIds(wi.relations),
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
    relatedTestCaseIds: extractLinkedTestCaseIds(wi.relations),
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
    relatedTestCaseIds: extractLinkedTestCaseIds(wi.relations),
  };
}

export async function getWorkItemStates(params: {
  providerId: string;
  projectName: string;
  workItemType: string;
}): Promise<AzureDevOpsWorkItemState[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_apis/wit/workitemtypes/${encodeURIComponent(params.workItemType)}/states?api-version=7.1`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to fetch states for work item type ${params.workItemType}: ${error}`,
    );
  }

  const data = await response.json();
  return (data.value ?? []).map(
    (state: { name: string; color?: string; category?: string }) => ({
      name: state.name,
      color: state.color,
      category: state.category,
    }),
  );
}

/**
 * Fetch test cases related to a work item using a WIQL link query.
 * Uses WorkItemLinks query mode with Microsoft.VSTS.Common.TestedBy-Forward
 * to find test cases linked via the "Tested By" relationship.
 */
export async function getRelatedTestCases(params: {
  providerId: string;
  projectName: string;
  workItemId: number;
}): Promise<AzureDevOpsWorkItem[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  // WIQL link query to find test cases linked to this work item
  const wiqlQuery = `SELECT [System.Id] FROM WorkItemLinks WHERE ([Source].[System.Id] = ${params.workItemId}) AND ([System.Links.LinkType] = 'Microsoft.VSTS.Common.TestedBy-Forward') AND ([Target].[System.WorkItemType] = 'Test Case') MODE (MustContain)`;

  const wiqlResponse = await fetch(
    `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_apis/wit/wiql?api-version=7.0`,
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
    console.error(
      `[azure] Failed to query related test cases for work item ${params.workItemId}:`,
      error,
    );
    return [];
  }

  const wiqlData = await wiqlResponse.json();

  // WorkItemLinks query returns { workItemRelations: [{ source, target, rel }] }
  // target contains the linked test case IDs; source is null for the root item
  const targetIds: number[] = (wiqlData.workItemRelations ?? [])
    .filter(
      (r: { target?: { id: number } }) =>
        r.target && r.target.id !== params.workItemId,
    )
    .map((r: { target: { id: number } }) => r.target.id);

  if (targetIds.length === 0) {
    return [];
  }

  // Batch-fetch the test case work item details
  const batchResponse = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workitems?ids=${targetIds.join(',')}&api-version=7.0`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!batchResponse.ok) {
    const error = await batchResponse.text();
    console.error(`[azure] Failed to fetch test case details:`, error);
    return [];
  }

  const batchData: WorkItemsBatchResponse = await batchResponse.json();

  return batchData.value.map((wi) => {
    const testSteps = wi.fields['Microsoft.VSTS.TCM.Steps']
      ? parseTestSteps(wi.fields['Microsoft.VSTS.TCM.Steps'])
      : undefined;

    return {
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
      testSteps,
    };
  });
}

export async function getWorkItemComments(params: {
  providerId: string;
  projectName: string;
  workItemId: number;
}): Promise<
  {
    id: number;
    workItemId: number;
    text: string;
    createdBy: string;
    createdDate: string;
  }[]
> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_apis/wit/workItems/${params.workItemId}/comments?api-version=7.0-preview.4&$top=50&order=desc`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!response.ok) {
    if (response.status === 404) return [];
    const error = await response.text();
    throw new Error(
      `Failed to fetch comments for work item ${params.workItemId}: ${error}`,
    );
  }

  const data = await response.json();
  console.log(
    '[getWorkItemComments]',
    `workItem=${params.workItemId}`,
    `keys=${Object.keys(data).join(',')}`,
    `totalCount=${data.totalCount}`,
    `count=${data.count}`,
    `commentsLength=${(data.comments ?? []).length}`,
  );

  return (data.comments ?? []).map(
    (c: {
      id: number;
      workItemId: number;
      text: string;
      createdBy?: { displayName?: string };
      createdDate?: string;
    }) => ({
      id: c.id,
      workItemId: c.workItemId,
      text: c.text ?? '',
      createdBy: c.createdBy?.displayName ?? 'Unknown',
      createdDate: c.createdDate ?? '',
    }),
  );
}

export async function addWorkItemComment(params: {
  providerId: string;
  projectName: string;
  workItemId: number;
  text: string;
}): Promise<{
  id: number;
  workItemId: number;
  text: string;
  createdBy: string;
  createdDate: string;
}> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const response = await fetch(
    `https://dev.azure.com/${orgName}/${encodeURIComponent(params.projectName)}/_apis/wit/workItems/${params.workItemId}/comments?api-version=7.0-preview.4`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: params.text }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to add comment for work item ${params.workItemId}: ${error}`,
    );
  }

  const c: {
    id: number;
    workItemId?: number;
    text?: string;
    createdBy?: { displayName?: string };
    createdDate?: string;
  } = await response.json();

  return {
    id: c.id,
    workItemId: c.workItemId ?? params.workItemId,
    text: c.text ?? params.text,
    createdBy: c.createdBy?.displayName ?? 'Unknown',
    createdDate: c.createdDate ?? new Date().toISOString(),
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
  const { authHeader, orgName } = await getProviderAuth(providerId);

  // Fetch profile and org identity in parallel
  const [profileResponse, connectionResponse] = await Promise.all([
    fetch(
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.0',
      {
        headers: { Authorization: authHeader },
      },
    ),
    fetch(
      `https://dev.azure.com/${orgName}/_apis/connectionData?api-version=7.0-preview`,
      {
        headers: { Authorization: authHeader },
      },
    ),
  ]);

  if (!profileResponse.ok) {
    const error = await profileResponse.text();
    throw new Error(`Failed to fetch user profile: ${error}`);
  }

  const profile: ProfileResponse = await profileResponse.json();

  const connectionBody = await connectionResponse.text();

  // Extract org-level identity ID (matches reviewer IDs in PRs)
  let identityId: string | undefined;
  if (connectionResponse.ok) {
    const connectionData = JSON.parse(connectionBody);
    identityId = connectionData?.authenticatedUser?.id;
  }

  if (!identityId) {
    const resolvedIdentityId = await resolveIdentityIdByEmail({
      authHeader,
      orgName,
      emailAddress: profile.emailAddress,
    });
    if (resolvedIdentityId) {
      identityId = resolvedIdentityId;
    }
  }

  return {
    id: profile.id,
    displayName: profile.displayName,
    emailAddress: profile.emailAddress,
    identityId,
  };
}

async function resolveIdentityIdByEmail({
  authHeader,
  orgName,
  emailAddress,
}: {
  authHeader: string;
  orgName: string;
  emailAddress: string;
}): Promise<string | undefined> {
  const url = `https://vssps.dev.azure.com/${orgName}/_apis/identities?searchFilter=General&filterValue=${encodeURIComponent(emailAddress)}&queryMembership=None&api-version=7.1`;
  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const responseText = await response.text();
    dbg.azure('identity-lookup:failed', {
      orgName,
      email: maskEmail(emailAddress),
      status: response.status,
      body: responseText,
    });
    return undefined;
  }

  const identities: IdentitiesResponse = await response.json();
  const normalizedEmail = emailAddress.toLowerCase();
  const match = identities.value?.find((identity) => {
    const account = identity.properties?.Account?.$value?.toLowerCase();
    const mail = identity.properties?.Mail?.$value?.toLowerCase();
    return account === normalizedEmail || mail === normalizedEmail;
  });

  dbg.azure('identity-lookup:resolved', {
    orgName,
    email: maskEmail(emailAddress),
    resultCount: identities.value?.length ?? 0,
    matchedByEmail: !!match,
    identityId: match?.id ?? null,
  });

  return match?.id;
}

export async function searchIdentities(params: {
  providerId: string;
  query: string;
}): Promise<AzureDevOpsIdentity[]> {
  const query = params.query.trim();

  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  if (!query) {
    return listGraphUsers({ authHeader, orgName });
  }

  const url = new URL(
    `https://vssps.dev.azure.com/${orgName}/_apis/identities`,
  );
  url.searchParams.set('queryMembership', 'None');
  url.searchParams.set('api-version', '7.1');
  if (query) {
    url.searchParams.set('searchFilter', 'General');
    url.searchParams.set('filterValue', query);
  }
  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    dbg.azure('identity-search:failed', {
      orgName,
      query,
      status: response.status,
      body: error,
    });
    return [];
  }

  const identities: IdentitiesResponse = await response.json();
  return (identities.value ?? [])
    .filter((identity) => !!identity.id && !!identity.providerDisplayName)
    .filter((identity) => identity.isActive !== false)
    .map((identity) => ({
      id: identity.id!,
      displayName: identity.providerDisplayName!,
      uniqueName:
        identity.properties?.Mail?.$value ??
        identity.properties?.Account?.$value,
    }))
    .slice(0, 10);
}

async function listGraphUsers({
  authHeader,
  orgName,
}: {
  authHeader: string;
  orgName: string;
}): Promise<AzureDevOpsIdentity[]> {
  const url = new URL(
    `https://vssps.dev.azure.com/${orgName}/_apis/graph/users`,
  );
  url.searchParams.set('api-version', '7.1-preview.1');

  const graphUsers: NonNullable<GraphUsersResponse['value']> = [];
  let continuationToken: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    if (continuationToken) {
      url.searchParams.set('continuationToken', continuationToken);
    }

    const response = await fetch(url, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      const error = await response.text();
      dbg.azure('graph-users:list-failed', {
        orgName,
        status: response.status,
        reason:
          response.status === 401
            ? 'Azure DevOps token is missing Graph Read scope (vso.graph)'
            : undefined,
        body: error,
      });
      return [];
    }

    const users: GraphUsersResponse = await response.json();
    graphUsers.push(...(users.value ?? []));
    continuationToken = response.headers.get('x-ms-continuationtoken');
    if (!continuationToken || graphUsers.length >= 500) break;
  }

  const people = graphUsers
    .filter((user) => user.descriptor && user.displayName)
    .filter((user) => user.isDeletedInOrigin !== true)
    .filter((user) => user.mailAddress || user.principalName?.includes('@'))
    .slice(0, 500);

  const identities = await Promise.all(
    people.map(async (user): Promise<AzureDevOpsIdentity | null> => {
      const storageKey = await getGraphStorageKey({
        authHeader,
        orgName,
        descriptor: user.descriptor!,
      });
      if (!storageKey) return null;
      return {
        id: storageKey,
        displayName: user.displayName!,
        uniqueName: user.mailAddress || user.principalName,
      } satisfies AzureDevOpsIdentity;
    }),
  );

  return identities
    .filter((identity): identity is AzureDevOpsIdentity => !!identity)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function getGraphStorageKey({
  authHeader,
  orgName,
  descriptor,
}: {
  authHeader: string;
  orgName: string;
  descriptor: string;
}): Promise<string | null> {
  const response = await fetch(
    `https://vssps.dev.azure.com/${orgName}/_apis/graph/storagekeys/${encodeURIComponent(descriptor)}?api-version=7.1`,
    { headers: { Authorization: authHeader } },
  );

  if (!response.ok) return null;

  const data: GraphStorageKeyResponse = await response.json();
  return data.value ?? null;
}

// Pull Request API response types
interface PullRequestResponse {
  pullRequestId: number;
  title: string;
  status: string;
  isDraft: boolean;
  createdBy: {
    id: string;
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  creationDate: string;
  sourceRefName: string;
  targetRefName: string;
  description?: string;
  mergeStatus?: string;
  autoCompleteSetBy?: {
    displayName: string;
    id: string;
  };
  completionOptions?: {
    mergeStrategy?: string;
    deleteSourceBranch?: boolean;
    transitionWorkItems?: boolean;
    mergeCommitMessage?: string;
    autoCompleteIgnoreConfigIds?: number[];
  };
  reviewers?: Array<{
    id: string;
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
    id?: string;
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  usersLiked?: Array<{
    id?: string;
    displayName: string;
    uniqueName?: string;
    imageUrl?: string;
  }>;
  publishedDate: string;
  lastUpdatedDate: string;
  lastContentUpdatedDate?: string;
}

function mapCommentResponse(comment: CommentResponse): AzureDevOpsComment {
  return {
    id: comment.id,
    parentCommentId: comment.parentCommentId,
    content: comment.content,
    commentType: mapCommentType(comment.commentType),
    author: {
      id: comment.author.id,
      displayName: comment.author.displayName,
      uniqueName: comment.author.uniqueName,
      imageUrl: comment.author.imageUrl,
    },
    usersLiked: (comment.usersLiked ?? []).map((user) => ({
      id: user.id,
      displayName: user.displayName,
      uniqueName: user.uniqueName,
      imageUrl: user.imageUrl,
    })),
    publishedDate: comment.publishedDate,
    lastUpdatedDate: comment.lastUpdatedDate,
  };
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
      id: pr.createdBy.id,
      displayName: pr.createdBy.displayName,
      uniqueName: pr.createdBy.uniqueName,
      imageUrl: pr.createdBy.imageUrl,
    },
    creationDate: pr.creationDate,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    url: `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`,
    mergeStatus: pr.mergeStatus as AzureDevOpsPullRequest['mergeStatus'],
    reviewers: (pr.reviewers ?? []).map((r) => ({
      id: r.id,
      displayName: r.displayName,
      uniqueName: r.uniqueName,
      imageUrl: r.imageUrl,
      voteStatus: mapVoteToStatus(r.vote),
      isContainer: r.isContainer,
    })),
  }));
}

function mapPullRequestResponse(
  pr: PullRequestResponse,
  webUrl: string,
): AzureDevOpsPullRequestDetails {
  return {
    id: pr.pullRequestId,
    title: pr.title,
    status: mapPrStatus(pr.status),
    isDraft: pr.isDraft,
    createdBy: {
      id: pr.createdBy.id,
      displayName: pr.createdBy.displayName,
      uniqueName: pr.createdBy.uniqueName,
      imageUrl: pr.createdBy.imageUrl,
    },
    creationDate: pr.creationDate,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    url: webUrl,
    description: pr.description ?? '',
    mergeStatus: pr.mergeStatus as AzureDevOpsPullRequestDetails['mergeStatus'],
    autoCompleteSetBy: pr.autoCompleteSetBy
      ? {
          displayName: pr.autoCompleteSetBy.displayName,
          id: pr.autoCompleteSetBy.id,
        }
      : undefined,
    completionOptions: pr.completionOptions
      ? {
          mergeStrategy: (pr.completionOptions.mergeStrategy ??
            'noFastForward') as
            | 'noFastForward'
            | 'squash'
            | 'rebase'
            | 'rebaseMerge',
          deleteSourceBranch: pr.completionOptions.deleteSourceBranch ?? false,
          transitionWorkItems:
            pr.completionOptions.transitionWorkItems ?? false,
          mergeCommitMessage: pr.completionOptions.mergeCommitMessage,
          autoCompleteIgnoreConfigIds:
            pr.completionOptions.autoCompleteIgnoreConfigIds,
        }
      : undefined,
    reviewers: (pr.reviewers ?? []).map((r) => ({
      id: r.id,
      displayName: r.displayName,
      uniqueName: r.uniqueName,
      imageUrl: r.imageUrl,
      voteStatus: mapVoteToStatus(r.vote),
      isContainer: r.isContainer,
    })),
  };
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
  const webUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`;

  return mapPullRequestResponse(pr, webUrl);
}

async function assertCurrentUserOwnsPullRequest(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<void> {
  const [currentUser, pullRequest] = await Promise.all([
    getCurrentUser(params.providerId),
    getPullRequest(params),
  ]);
  const currentUserEmail = currentUser.emailAddress.toLowerCase();
  const ownerEmail = pullRequest.createdBy.uniqueName.toLowerCase();

  if (
    currentUser.identityId !== pullRequest.createdBy.id &&
    currentUser.id !== pullRequest.createdBy.id &&
    currentUserEmail !== ownerEmail
  ) {
    throw new Error('Only the pull request owner can edit this pull request');
  }
}

export async function updatePullRequestTitle(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  title: string;
}): Promise<AzureDevOpsPullRequestDetails> {
  const title = params.title.trim();
  if (!title) {
    throw new Error('Pull request title is required');
  }

  await assertCurrentUserOwnsPullRequest(params);

  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}?api-version=7.0`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update pull request title: ${error}`);
  }

  const pr: PullRequestResponse = await response.json();
  const webUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`;

  return mapPullRequestResponse(pr, webUrl);
}

export async function updatePullRequestDescription(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  description: string;
}): Promise<AzureDevOpsPullRequestDetails> {
  await assertCurrentUserOwnsPullRequest(params);

  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}?api-version=7.0`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description: params.description }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update pull request description: ${error}`);
  }

  const pr: PullRequestResponse = await response.json();
  const webUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`;

  return mapPullRequestResponse(pr, webUrl);
}

export async function uploadPullRequestAttachment(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  fileName: string;
  mimeType: string;
  dataBase64: string;
}): Promise<{ url: string }> {
  await assertCurrentUserOwnsPullRequest(params);

  const { authHeader, orgName } = await getProviderAuth(params.providerId);
  const data = Buffer.from(params.dataBase64, 'base64');
  const hashSuffix = createHash('sha256')
    .update(data)
    .digest('hex')
    .slice(0, 8);

  for (let attempt = 0; attempt < 10; attempt++) {
    const fileName = getPullRequestAttachmentFileName(
      params.fileName,
      hashSuffix,
      attempt,
    );
    const encodedFileName = encodeURIComponent(fileName);
    const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullRequests/${params.pullRequestId}/attachments/${encodedFileName}?api-version=7.1-preview.1`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    });

    if (!response.ok) {
      const error = await response.text();
      if (isDuplicateAttachmentNameError(error) && attempt < 9) {
        continue;
      }
      throw new Error(`Failed to upload pull request attachment: ${error}`);
    }

    const attachment: { url?: string } = await response.json();
    if (!attachment.url) {
      throw new Error('Azure DevOps did not return an attachment URL');
    }

    return { url: attachment.url };
  }

  throw new Error('Failed to upload pull request attachment');
}

function getPullRequestAttachmentFileName(
  fileName: string,
  hashSuffix: string,
  attempt: number,
) {
  const suffix = attempt === 0 ? hashSuffix : `${hashSuffix}-${attempt}`;

  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex <= 0) return `${fileName}-${suffix}`;

  return `${fileName.slice(0, extensionIndex)}-${suffix}${fileName.slice(extensionIndex)}`;
}

function isDuplicateAttachmentNameError(error: string) {
  return /attachment with file name ['"][^'"]+['"] already exists/i.test(error);
}

export async function votePullRequest(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  reviewerId: string;
  vote: number;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/reviewers/${params.reviewerId}?api-version=7.0`;

  dbg.azure('pr-vote:request', {
    projectId: params.projectId,
    repoId: params.repoId,
    pullRequestId: params.pullRequestId,
    reviewerId: params.reviewerId,
    vote: params.vote,
  });

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: params.reviewerId,
      vote: params.vote,
    }),
  });

  const responseText = await response.text();

  dbg.azure('pr-vote:response', {
    projectId: params.projectId,
    repoId: params.repoId,
    pullRequestId: params.pullRequestId,
    reviewerId: params.reviewerId,
    vote: params.vote,
    status: response.status,
    ok: response.ok,
    body: response.ok ? undefined : responseText,
  });

  if (!response.ok) {
    throw new Error(`Failed to vote on pull request: ${responseText}`);
  }
}

export async function setPullRequestAutoComplete(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  enabled: boolean;
  autoCompleteSetById?: string;
  completionOptions?: {
    mergeStrategy: string;
    deleteSourceBranch: boolean;
    transitionWorkItems: boolean;
    mergeCommitMessage?: string;
    autoCompleteIgnoreConfigIds?: number[];
  };
}): Promise<AzureDevOpsPullRequestDetails> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}?api-version=7.0`;

  const body = params.enabled
    ? {
        autoCompleteSetBy: { id: params.autoCompleteSetById },
        completionOptions: params.completionOptions,
      }
    : {
        autoCompleteSetBy: {
          id: '00000000-0000-0000-0000-000000000000',
        },
      };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to set auto-complete: ${error}`);
  }

  const pr: PullRequestResponse = await response.json();
  const isAutoCompleteSet = !!pr.autoCompleteSetBy;

  if (params.enabled && !isAutoCompleteSet) {
    throw new Error(
      'Azure DevOps accepted the request but did not enable auto-complete',
    );
  }

  if (!params.enabled && isAutoCompleteSet) {
    throw new Error(
      'Azure DevOps accepted the request but did not cancel auto-complete',
    );
  }

  const webUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_git/${params.repoId}/pullrequest/${pr.pullRequestId}`;

  return mapPullRequestResponse(pr, webUrl);
}

export async function publishPullRequest(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}?api-version=7.0`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isDraft: false }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to publish pull request: ${error}`);
  }
}

export async function getPullRequestPolicyEvaluations(params: {
  providerId: string;
  projectId: string;
  pullRequestId: number;
}): Promise<
  import('@shared/azure-devops-types').AzureDevOpsPolicyEvaluation[]
> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const artifactId = encodeURIComponent(
    `vstfs:///CodeReview/CodeReviewId/${params.projectId}/${params.pullRequestId}`,
  );
  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/policy/evaluations?artifactId=${artifactId}&api-version=7.0-preview`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get policy evaluations: ${error}`);
  }

  const data: {
    value: Array<{
      evaluationId: string;
      status: string;
      configuration: {
        id: number;
        isEnabled: boolean;
        isBlocking: boolean;
        type: { id: string; displayName: string };
        settings: Record<string, unknown>;
      };
      context?: Record<string, unknown>;
    }>;
  } = await response.json();

  dbg.azure(
    'policy-evaluations:raw',
    data.value.map((e) => ({
      id: e.evaluationId,
      status: e.status,
      configurationId: e.configuration.id,
      type: e.configuration.type.displayName,
      isEnabled: e.configuration.isEnabled,
      isBlocking: e.configuration.isBlocking,
      settings: {
        buildDefinitionId:
          (e.configuration.settings.buildDefinitionId as number | undefined) ??
          null,
        displayName:
          (e.configuration.settings.displayName as string | undefined) ?? null,
        minimumApproverCount:
          (e.configuration.settings.minimumApproverCount as
            | number
            | undefined) ?? null,
      },
      context: {
        buildId: (e.context?.buildId as number | undefined) ?? null,
        buildDefinitionId:
          (e.context?.buildDefinitionId as number | undefined) ?? null,
        isExpired: (e.context?.isExpired as boolean | undefined) ?? null,
      },
    })),
  );

  const enabledEvals = data.value.filter((e) => e.configuration.isEnabled);

  // Resolve build definition names for policies that have a buildDefinitionId
  // but no displayName set
  const buildDefIds = [
    ...new Set(
      enabledEvals
        .filter(
          (e) =>
            e.configuration.settings.buildDefinitionId &&
            !e.configuration.settings.displayName,
        )
        .map((e) => e.configuration.settings.buildDefinitionId as number),
    ),
  ];

  const buildDefNames = new Map<number, string>();
  if (buildDefIds.length > 0) {
    try {
      const defsUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/build/definitions?definitionIds=${buildDefIds.join(',')}&api-version=7.0`;
      const defsResponse = await fetch(defsUrl, {
        headers: { Authorization: authHeader },
      });
      if (defsResponse.ok) {
        const defsData: {
          value: Array<{ id: number; name: string }>;
        } = await defsResponse.json();
        for (const def of defsData.value) {
          buildDefNames.set(def.id, def.name);
        }
      }
    } catch {
      // Fallback to type.displayName if build def lookup fails
    }
  }

  const validStatuses = new Set([
    'approved',
    'rejected',
    'running',
    'queued',
    'notApplicable',
    'broken',
  ]);

  return enabledEvals.map((e) => {
    const buildDefId = e.configuration.settings.buildDefinitionId as
      | number
      | undefined;
    const resolvedName =
      (e.configuration.settings.displayName as string | undefined) ??
      (buildDefId ? buildDefNames.get(buildDefId) : undefined) ??
      e.configuration.type.displayName;

    const status = validStatuses.has(e.status)
      ? (e.status as import('@shared/azure-devops-types').AzureDevOpsPolicyEvaluation['status'])
      : 'broken';

    return {
      evaluationId: e.evaluationId,
      status,
      isBlocking: e.configuration.isBlocking,
      configuration: {
        id: e.configuration.id,
        isEnabled: e.configuration.isEnabled,
        isBlocking: e.configuration.isBlocking,
        type: e.configuration.type,
        settings: {
          ...e.configuration.settings,
          buildDefinitionId: buildDefId,
          displayName: resolvedName,
        },
      },
      context: e.context
        ? {
            buildId: e.context.buildId as number | undefined,
            buildDefinitionId: e.context.buildDefinitionId as
              | number
              | undefined,
            isExpired: e.context.isExpired as boolean | undefined,
          }
        : undefined,
    };
  });
}

export async function requeuePolicyEvaluation(params: {
  providerId: string;
  projectId: string;
  evaluationId: string;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/policy/evaluations/${params.evaluationId}?api-version=7.0-preview`;

  dbg.azure('policy-requeue:request', {
    evaluationId: params.evaluationId,
    url,
  });

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'queued' }),
  });

  const responseText = await response.text();
  dbg.azure('policy-requeue:response', {
    status: response.status,
    ok: response.ok,
    body: responseText,
  });

  if (!response.ok) {
    throw new Error(`Failed to requeue policy evaluation: ${responseText}`);
  }
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

export async function getCommitChanges(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  commitId: string;
}): Promise<AzureDevOpsFileChange[]> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/commits/${params.commitId}/changes?api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get commit changes: ${error}`);
  }

  const data: {
    changeCounts: Record<string, number>;
    changes: Array<
      ChangeResponse & {
        item?: ChangeResponse['item'] & { isFolder?: boolean };
      }
    >;
  } = await response.json();

  return data.changes
    .filter((change) => change.item?.path && !change.item.isFolder)
    .map((change) => ({
      path: change.item!.path,
      changeType: mapChangeType(change.changeType),
      originalPath: change.sourceServerItem,
    }));
}

export async function getFileContentAtCommit(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  commitId: string;
  filePath: string;
  version: 'current' | 'parent';
}): Promise<string> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  let versionId = params.commitId;

  if (params.version === 'parent') {
    // Get parent commit ID
    const commitUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/commits/${params.commitId}?api-version=7.0`;
    const commitResponse = await fetch(commitUrl, {
      headers: { Authorization: authHeader },
    });
    if (!commitResponse.ok) {
      return '';
    }
    const commitData: { parents?: string[] } = await commitResponse.json();
    if (!commitData.parents?.length) {
      return ''; // Initial commit, no parent
    }
    versionId = commitData.parents[0];
  }

  const contentUrl = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/items?path=${encodeURIComponent(params.filePath)}&versionDescriptor.version=${encodeURIComponent(versionId)}&versionDescriptor.versionType=commit&api-version=7.0`;

  const response = await fetch(contentUrl, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return ''; // File doesn't exist at this version (new or deleted)
    }
    const error = await response.text();
    throw new Error(`Failed to get file content at commit: ${error}`);
  }

  return response.text();
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
          .map(mapCommentResponse),
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
    comments: thread.comments.map(mapCommentResponse),
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

export async function updateWorkItemState(params: {
  providerId: string;
  workItemId: number;
  state: string;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const patchOps = [
    {
      op: 'add',
      path: '/fields/System.State',
      value: params.state,
    },
  ];

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
      `Failed to update work item ${params.workItemId} state to ${params.state}: ${error}`,
    );
  }
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
  unresolvedCommentCount: number;
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
  let unresolvedCommentCount = 0;

  for (const thread of realThreads) {
    const isActiveThread =
      thread.status === 'active' ||
      thread.status === 'pending' ||
      thread.status === 'unknown';

    if (isActiveThread) {
      activeThreadCount++;
      unresolvedCommentCount += thread.comments.filter(
        (comment) => comment.commentType !== 'system',
      ).length;
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

  return {
    lastCommitDate,
    lastThreadActivityDate,
    activeThreadCount,
    unresolvedCommentCount,
  };
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

  return mapCommentResponse(comment);
}

export async function setThreadCommentLike(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  threadId: number;
  commentId: number;
  liked: boolean;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads/${params.threadId}/comments/${params.commentId}/likes?api-version=7.1`;

  const response = await fetch(url, {
    method: params.liked ? 'POST' : 'DELETE',
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update comment like: ${error}`);
  }
}

export async function deleteThreadComment(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  threadId: number;
  commentId: number;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads/${params.threadId}/comments/${params.commentId}?api-version=7.0`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete thread comment: ${error}`);
  }
}

export async function updateThreadComment(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  threadId: number;
  commentId: number;
  content: string;
}): Promise<AzureDevOpsComment> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/${params.projectId}/_apis/git/repositories/${params.repoId}/pullrequests/${params.pullRequestId}/threads/${params.threadId}/comments/${params.commentId}?api-version=7.0`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: params.content }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update thread comment: ${error}`);
  }

  const comment: CommentResponse = await response.json();

  return mapCommentResponse(comment);
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
    comments: thread.comments.map(mapCommentResponse),
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

export async function linkWorkItemToPr(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  workItemId: number;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const artifactUrl = `vstfs:///Git/PullRequestId/${params.projectId}%2F${params.repoId}%2F${params.pullRequestId}`;

  const patchOps = [
    {
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'ArtifactLink',
        url: artifactUrl,
        attributes: {
          name: 'Pull Request',
        },
      },
    },
  ];

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
      `Failed to link work item ${params.workItemId} to PR: ${error}`,
    );
  }
}

export async function unlinkWorkItemFromPr(params: {
  providerId: string;
  projectId: string;
  repoId: string;
  pullRequestId: number;
  workItemId: number;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  // Fetch work item with relations to find the relation index
  const wiUrl = `https://dev.azure.com/${orgName}/_apis/wit/workitems/${params.workItemId}?$expand=relations&api-version=7.0`;

  const wiResponse = await fetch(wiUrl, {
    headers: { Authorization: authHeader },
  });

  if (!wiResponse.ok) {
    const error = await wiResponse.text();
    throw new Error(`Failed to fetch work item ${params.workItemId}: ${error}`);
  }

  const wiData: {
    relations?: Array<{ rel: string; url: string }>;
  } = await wiResponse.json();

  // Find the relation index matching our PR artifact link
  const artifactUrl = `vstfs:///Git/PullRequestId/${params.projectId}%2F${params.repoId}%2F${params.pullRequestId}`;

  const relationIndex = wiData.relations?.findIndex(
    (r) => r.rel === 'ArtifactLink' && r.url === artifactUrl,
  );

  if (relationIndex === undefined || relationIndex === -1) {
    // Already unlinked
    return;
  }

  const patchOps = [
    {
      op: 'remove',
      path: `/relations/${relationIndex}`,
    },
  ];

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
      `Failed to unlink work item ${params.workItemId} from PR: ${error}`,
    );
  }
}
