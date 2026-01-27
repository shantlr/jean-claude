// electron/services/azure-devops-service.ts

export interface AzureDevOpsOrganization {
  id: string;
  name: string;
  url: string;
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

export async function getOrganizations(token: string): Promise<AzureDevOpsOrganization[]> {
  // Step 1: Get the user's member ID from profile
  const profileResponse = await fetch(
    'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.0',
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
      },
    }
  );

  if (!profileResponse.ok) {
    const error = await profileResponse.text();
    throw new Error(`Failed to authenticate with Azure DevOps: ${error}`);
  }

  const profile: ProfileResponse = await profileResponse.json();

  // Step 2: Get the list of organizations the user has access to
  const accountsResponse = await fetch(
    `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.id}&api-version=7.0`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
      },
    }
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
