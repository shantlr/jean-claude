// electron/services/azure-devops-service.ts

import { ProviderRepository } from '../database/repositories/providers';
import { TokenRepository } from '../database/repositories/tokens';

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
