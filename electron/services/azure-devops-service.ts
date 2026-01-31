// electron/services/azure-devops-service.ts

import { spawn } from 'child_process';

import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
  AzureDevOpsComment,
} from '../../shared/azure-devops-types';
import { ProviderRepository } from '../database/repositories/providers';
import { TokenRepository } from '../database/repositories/tokens';

import { sendGlobalPromptToWindow } from './global-prompt-service';

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

export interface AzureDevOpsWorkItem {
  id: number;
  url: string;
  fields: {
    title: string;
    workItemType: string;
    state: string;
    assignedTo?: string;
    description?: string;
  };
}

interface WiqlResponse {
  workItems: Array<{ id: number; url: string }>;
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
    };
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

function createAuthHeader(token: string): string {
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

export async function queryWorkItems(params: {
  providerId: string;
  projectId: string;
  projectName: string;
  filters: { states?: string[]; workItemTypes?: string[]; searchText?: string };
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
    `[System.TeamProject] = '${params.projectName}'`,
  ];

  if (params.filters.states && params.filters.states.length > 0) {
    const statesList = params.filters.states.map((s) => `'${s}'`).join(', ');
    conditions.push(`[System.State] IN (${statesList})`);
  }

  if (params.filters.workItemTypes && params.filters.workItemTypes.length > 0) {
    const typesList = params.filters.workItemTypes
      .map((t) => `'${t}'`)
      .join(', ');
    conditions.push(`[System.WorkItemType] IN (${typesList})`);
  }

  // Add search text filter - search ID (exact match) OR title (contains)
  if (params.filters.searchText && params.filters.searchText.trim()) {
    const searchText = params.filters.searchText.trim();
    // Escape single quotes in search text to prevent WIQL injection
    const escapedSearch = searchText.replace(/'/g, "''");

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

  const wiqlQuery = `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;

  // POST WIQL query - use projectName in URL path (Azure DevOps requires name, not GUID)
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
    throw new Error(`Failed to query work items: ${error}`);
  }

  const wiqlData: WiqlResponse = await wiqlResponse.json();

  if (wiqlData.workItems.length === 0) {
    return [];
  }

  // Batch-fetch work item details
  const ids = wiqlData.workItems.map((wi) => wi.id);
  const batchResponse = await fetch(
    `https://dev.azure.com/${orgName}/_apis/wit/workitems?ids=${ids.join(',')}&fields=System.Title,System.WorkItemType,System.State,System.AssignedTo,System.Description&api-version=7.0`,
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
    },
  }));
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
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create pull request: ${error}`);
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
      vote: r.vote,
    })),
  };
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
        filePath: params.filePath,
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
