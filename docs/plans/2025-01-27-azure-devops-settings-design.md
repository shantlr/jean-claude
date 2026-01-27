# Azure DevOps Integration - Settings Page Design

## Overview

Add an Azure DevOps tab to the settings page allowing users to connect multiple Azure DevOps organizations using Personal Access Tokens (PATs).

## Data Model

No schema changes needed. We use the existing `providers` table:

| Field | Value |
|-------|-------|
| `type` | `'azure-devops'` |
| `label` | Organization name (auto-populated from API, editable later) |
| `baseUrl` | `https://dev.azure.com/{orgName}` |
| `token` | PAT (encrypted via safeStorage) |

## API Design

### New API Endpoint

```typescript
// Add to Api interface in src/lib/api.ts
azureDevOps: {
  getOrganizations: (token: string) => Promise<AzureDevOpsOrganization[]>;
}

interface AzureDevOpsOrganization {
  id: string;      // GUID
  name: string;    // Organization name
  url: string;     // https://dev.azure.com/{name}
}
```

### Azure DevOps API Calls

1. Get member ID: `GET https://app.vssps.visualstudio.com/_apis/profile/profiles/me`
2. List organizations: `GET https://app.vssps.visualstudio.com/_apis/accounts?memberId={memberId}`

## Routing

Convert settings tabs to route-based navigation:

```
/settings              → redirects to /settings/general
/settings/general      → General settings (editor preference)
/settings/azure-devops → Azure DevOps organizations
/settings/debug        → Debug database viewer
```

## UI Design

### Azure DevOps Tab Layout

```
┌──────────────────────────────────────┬────────────────────────────────┐
│ Azure DevOps          [+ Add Org]    │  (Right pane - when adding)    │
├──────────────────────────────────────┤                                │
│                                      │  Add Organization              │
│ ┌──────────────────────────────────┐ │  ─────────────────             │
│ │ 🏢 MyCompany                   ✕ │ │                                │
│ │    dev.azure.com/mycompany       │ │  Personal Access Token         │
│ └──────────────────────────────────┘ │  ┌────────────────────────┐    │
│                                      │  │ ••••••••••••••••••     │    │
│ ┌──────────────────────────────────┐ │  └────────────────────────┘    │
│ │ 🏢 PersonalProjects            ✕ │ │  🔗 How to create a PAT        │
│ └──────────────────────────────────┘ │                                │
│                                      │  [Connect]                     │
│                                      │                                │
│                                      │  ── after connecting ──        │
│                                      │                                │
│                                      │  Select organizations:         │
│                                      │  ☑ MyCompany                   │
│                                      │  ☐ OtherOrg                    │
│                                      │                                │
│                                      │  [Add Selected]  [Cancel]      │
└──────────────────────────────────────┴────────────────────────────────┘
```

### Add Organization Flow

1. **Enter PAT**: User pastes their PAT, clicks "Connect"
2. **Loading**: Spinner while fetching organizations
3. **Select Orgs**: Checkbox list of accessible orgs (if multiple)
4. **Confirm**: Creates provider(s) with org name as label

### States

- **Empty**: "No organizations connected yet"
- **Loading**: Spinner while fetching
- **Error**: Invalid token or network error with message
- **Success**: Org added, pane closes

## File Structure

### New Files

```
electron/
  services/
    azure-devops-service.ts      # API calls to Azure DevOps

src/
  routes/
    settings/
      index.tsx                  # Redirect to /settings/general
      general.tsx                # Current settings content (extracted)
      azure-devops.tsx           # Azure DevOps tab
      debug.tsx                  # Debug tab (extracted)

  features/settings/
    ui-azure-devops-tab/
      index.tsx                  # Main content (org list + pane)
      organization-list.tsx      # List of connected orgs
      organization-card.tsx      # Single org card
      add-organization-pane.tsx  # Right pane for adding

  hooks/
    use-azure-devops.ts          # Hook for getOrganizations mutation
```

### Modified Files

```
electron/ipc/handlers.ts         # Add azureDevOps.getOrganizations handler
electron/preload.ts              # Expose azureDevOps API
src/lib/api.ts                   # Add azureDevOps types
src/routes/settings.tsx          # Convert to layout with tab nav + Outlet
```

## Implementation Order

1. **Backend service**: `azure-devops-service.ts` with API calls
2. **IPC layer**: Handler + preload + api types
3. **Hook**: `use-azure-devops.ts` mutation
4. **Routing refactor**: Convert settings to nested routes
5. **UI components**: Tab content, org list, add pane
