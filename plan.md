# Plan: Discover & Install Skills from skills.sh Registry

## Overview

Add a "Browse" experience to the Skills settings page that lets users search the [skills.sh](https://skills.sh) registry, preview skill details, and install skills with one click. Installation clones the skill from GitHub, copies the `SKILL.md` (and companion files) into JC's canonical storage, and creates backend symlinks — reusing the existing `createSkill`-like flow.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Renderer                                                 │
│                                                           │
│  SkillsSettings (index.tsx)                               │
│    ├── [existing] My Skills + Installed Skills grid       │
│    └── [NEW] "Browse" button → SkillRegistryBrowser       │
│         ├── Search input (debounced)                      │
│         ├── Result cards grid (RegistrySkillCard)         │
│         └── Right pane: RegistrySkillPreview              │
│              ├── Name, description, install count, source │
│              ├── SKILL.md content preview (fetched)       │
│              ├── Backend checkboxes                        │
│              └── "Install" button                         │
│                                                           │
│  Hooks: useRegistrySearch(), useRegistrySkillContent(),   │
│         useInstallRegistrySkill()                         │
└──────────────────┬───────────────────────────────────────┘
                   │ IPC
┌──────────────────▼───────────────────────────────────────┐
│  Main Process                                             │
│                                                           │
│  skill-registry-service.ts (NEW)                          │
│    ├── searchRegistry(query) → fetch skills.sh API        │
│    ├── fetchRegistrySkillContent(source, skillName)       │
│    │     → GitHub API (raw content) for SKILL.md preview  │
│    └── installFromRegistry(source, skillId, backends)     │
│          → shallow git clone → discover SKILL.md          │
│          → copy to JC canonical → create symlinks         │
│                                                           │
│  IPC Handlers: skills:registrySearch,                     │
│    skills:registryFetchContent, skills:registryInstall    │
└──────────────────────────────────────────────────────────┘
```

## Step-by-Step Implementation

### Step 1: Add registry types (`shared/skill-types.ts`)

Add new types for registry skills:

```ts
/** A skill from the skills.sh search API */
export interface RegistrySkill {
  id: string;           // e.g. "vercel-labs/agent-skills/react-best-practices"
  skillId: string;      // e.g. "react-best-practices"
  name: string;
  installs: number;
  source: string;       // e.g. "vercel-labs/agent-skills"
}

/** Search results from skills.sh */
export interface RegistrySearchResult {
  query: string;
  skills: RegistrySkill[];
  count: number;
}

/** Content fetched for a registry skill preview */
export interface RegistrySkillContent {
  name: string;
  description: string;
  content: string;       // markdown body (without frontmatter)
}
```

### Step 2: Create registry service (`electron/services/skill-registry-service.ts`)

New service file with three functions:

**`searchRegistry({ query })`**
- Calls `GET https://skills.sh/api/search?q=<query>` using native `fetch()`
- Returns `RegistrySearchResult`
- Error handling: network errors, non-200 responses

**`fetchRegistrySkillContent({ source, skillId })`**
- Fetches the `SKILL.md` raw content via GitHub raw URL: `https://raw.githubusercontent.com/<source>/main/skills/<skillId>/SKILL.md`
- Falls back to trying the root `SKILL.md` if the skill IS the repo itself
- Parses frontmatter using the existing `parseFrontmatter()` pattern (extracted to a shared util or duplicated)
- Returns `RegistrySkillContent`

**`installFromRegistry({ source, skillId, enabledBackends })`**
- Creates a temp directory via `os.tmpdir()` + `fs.mkdtemp()`
- Shallow clone: `git clone --depth 1 https://github.com/<source>.git <tmpDir>` with a 60s timeout
- Discovers the SKILL.md at `<tmpDir>/skills/<skillId>/SKILL.md` (or root if single-skill repo)
- Reads and parses the SKILL.md frontmatter for name/description
- Copies the **entire skill directory** (SKILL.md + companions like AGENTS.md, resources/, etc.) to `~/.config/jean-claude/skills/user/<normalizedName>/`
- Creates symlinks in each enabled backend's skills dir (same logic as existing `createSkill`)
- Cleans up temp dir
- Returns the created `ManagedSkill`
- Error handling: clone failure, skill not found, name conflict, cleanup on failure

### Step 3: Add IPC handlers (`electron/ipc/handlers.ts`)

Register three new handlers following the existing pattern:

```ts
ipcMain.handle('skills:registrySearch', async (_, query: string) => {
  dbg.ipc('skills:registrySearch query=%s', query);
  return searchRegistry({ query });
});

ipcMain.handle('skills:registryFetchContent', async (_, source: string, skillId: string) => {
  dbg.ipc('skills:registryFetchContent source=%s skillId=%s', source, skillId);
  return fetchRegistrySkillContent({ source, skillId });
});

ipcMain.handle('skills:registryInstall', async (_, params: {
  source: string;
  skillId: string;
  enabledBackends: AgentBackendType[];
}) => {
  dbg.ipc('skills:registryInstall source=%s skill=%s', params.source, params.skillId);
  return installFromRegistry(params);
});
```

### Step 4: Add preload bridge (`electron/preload.ts`)

Extend the `skillManagement` object:

```ts
registrySearch: (query: string) =>
  ipcRenderer.invoke('skills:registrySearch', query),
registryFetchContent: (source: string, skillId: string) =>
  ipcRenderer.invoke('skills:registryFetchContent', source, skillId),
registryInstall: (params: { source: string; skillId: string; enabledBackends: string[] }) =>
  ipcRenderer.invoke('skills:registryInstall', params),
```

### Step 5: Add API types (`src/lib/api.ts`)

Extend the `skillManagement` section of the `Api` interface:

```ts
registrySearch: (query: string) => Promise<RegistrySearchResult>;
registryFetchContent: (source: string, skillId: string) => Promise<RegistrySkillContent>;
registryInstall: (params: {
  source: string;
  skillId: string;
  enabledBackends: AgentBackendType[];
}) => Promise<ManagedSkill>;
```

Also add stubs to the fallback api object.

### Step 6: Add React hooks (`src/hooks/use-managed-skills.ts`)

Add three new hooks:

```ts
export function useRegistrySearch(query: string) {
  return useQuery({
    queryKey: ['skillRegistry', 'search', query],
    queryFn: () => api.skillManagement.registrySearch(query),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData, // smooth transitions between searches
  });
}

export function useRegistrySkillContent(source: string | null, skillId: string | null) {
  return useQuery({
    queryKey: ['skillRegistry', 'content', source, skillId],
    queryFn: () => api.skillManagement.registryFetchContent(source!, skillId!),
    enabled: !!source && !!skillId,
    staleTime: 5 * 60_000,
  });
}

export function useInstallRegistrySkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      source: string;
      skillId: string;
      enabledBackends: AgentBackendType[];
    }) => api.skillManagement.registryInstall(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managedSkillsQueryKeys.all });
    },
  });
}
```

### Step 7: Create UI components

#### 7a. `src/features/settings/ui-skills-settings/skill-registry-browser.tsx`

A dialog/overlay component that shows search + results + preview:

```
┌──────────────────────────────────────────────────────────────┐
│  Browse Skills                                          [X]  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🔍 Search skills...                                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Results ──────────────────────┐ ┌─ Preview ──────────┐  │
│  │ ┌──────────┐ ┌──────────┐     │ │ skill-name         │  │
│  │ │ skill 1  │ │ skill 2  │     │ │ 182K installs      │  │
│  │ │ 182K ⬇   │ │ 45K ⬇    │     │ │ vercel-labs/...    │  │
│  │ └──────────┘ └──────────┘     │ │                    │  │
│  │ ┌──────────┐ ┌──────────┐     │ │ Content preview... │  │
│  │ │ skill 3  │ │ skill 4  │     │ │                    │  │
│  │ │ 12K ⬇    │ │ 8K ⬇     │     │ │ [CC] [OC]         │  │
│  │ └──────────┘ └──────────┘     │ │ [Install]          │  │
│  └────────────────────────────────┘ └────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

Key behaviors:
- Search input with 300ms debounce
- Results shown in responsive grid (reuse card styling from `SkillCardGrid`)
- Clicking a result shows preview in the right pane
- Preview loads the SKILL.md content from GitHub
- "Installed" badge if a local skill with the same name exists
- Backend checkboxes (both enabled by default)
- "Install" button triggers mutation, shows loading state, then "Installed ✓"
- Escape closes the browser

#### 7b. Registry skill card (inside `skill-registry-browser.tsx`)

A card showing:
- Skill name (bold)
- Install count (formatted: "182K", "1.2K")
- Source repo (e.g. `vercel-labs/agent-skills`)
- Selected state: blue border (same as existing cards)
- "Installed" badge if already local

#### 7c. Registry skill preview (inside `skill-registry-browser.tsx`)

Right pane showing:
- Name, description, install count
- Source repo link
- SKILL.md content in a scrollable `<pre>` (same styling as `SkillDetails`)
- Backend checkboxes (CC / OC)
- Install button with loading/success states
- Toast on install error

### Step 8: Wire into SkillsSettings (`index.tsx`)

Add a "Browse" button next to the existing "Add" button in the header:

```tsx
<button onClick={() => setShowBrowser(true)} className="...">
  <Search className="h-4 w-4" />
  Browse
</button>
```

Add state and render the browser dialog:

```tsx
const [showBrowser, setShowBrowser] = useState(false);

{showBrowser && (
  <SkillRegistryBrowser onClose={() => setShowBrowser(false)} />
)}
```

## Files Modified/Created

| File | Action | Description |
|------|--------|-------------|
| `shared/skill-types.ts` | Modify | Add `RegistrySkill`, `RegistrySearchResult`, `RegistrySkillContent` types |
| `electron/services/skill-registry-service.ts` | **Create** | Search API, content fetch, git clone + install |
| `electron/ipc/handlers.ts` | Modify | Add 3 new `skills:registry*` handlers |
| `electron/preload.ts` | Modify | Add 3 new methods to `skillManagement` |
| `src/lib/api.ts` | Modify | Add 3 new method types + fallback stubs |
| `src/hooks/use-managed-skills.ts` | Modify | Add `useRegistrySearch`, `useRegistrySkillContent`, `useInstallRegistrySkill` |
| `src/features/settings/ui-skills-settings/skill-registry-browser.tsx` | **Create** | Browse dialog with search, results grid, preview pane |
| `src/features/settings/ui-skills-settings/index.tsx` | Modify | Add "Browse" button and dialog state |

## Design Decisions

1. **Dialog over inline**: The browser is a dialog overlay rather than replacing the main view, so users can still see their installed skills and easily return.

2. **GitHub raw content for preview**: Instead of cloning the repo for preview, we fetch the raw `SKILL.md` via `raw.githubusercontent.com` which is fast and lightweight. Only the install action triggers a `git clone`.

3. **Shallow clone for install**: `git clone --depth 1` minimizes download size. We clone the entire repo (since skills.sh sources are usually multi-skill repos like `vercel-labs/agent-skills`) and extract just the requested skill directory.

4. **Reuse canonical storage**: Installed registry skills go to the same `~/.config/jean-claude/skills/user/<name>/` location as manually created skills. They become regular JC-managed skills with full enable/disable/delete support.

5. **No separate lock file**: Unlike the Vercel CLI's `.skill-lock.json`, we don't track source metadata separately. The skills are fully owned by JC after install. This keeps the architecture simpler. We can add update tracking as a future enhancement.

6. **Copy entire skill directory**: Some skills include companion files (`AGENTS.md`, `resources/`, `rules/`). We copy the full skill directory, not just `SKILL.md`.

## Edge Cases & Error Handling

- **Network failures**: Show inline error message in search results area
- **Clone timeout**: 60-second timeout with clear error message
- **Skill not found in repo**: If the SKILL.md can't be found at the expected path, try alternative discovery patterns
- **Name conflict**: If a skill with the same name already exists in canonical storage, show "Already installed" and disable the install button
- **Git not available**: Show error prompting user to install git
- **Private repos**: Currently only public repos supported; git clone will fail with clear error message
- **Temp dir cleanup**: Always clean up in a `finally` block, even on error
