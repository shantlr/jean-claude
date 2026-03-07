# Skill Registry Browser (skills.sh Integration)

## Problem

Users can create skills manually or migrate legacy skills, but there is no way to discover and install community skills from within Jean-Claude. The [skills.sh](https://skills.sh) ecosystem (by Vercel Labs) hosts 86K+ skills that are compatible with Jean-Claude's SKILL.md format. Users must currently use the `npx skills` CLI separately.

## Design

### Integration with skills.sh

The skills.sh registry provides a public search API and hosts skills in GitHub repositories. Each skill is a directory containing a `SKILL.md` file with YAML frontmatter (`name`, `description`) and optional companion files (`AGENTS.md`, `resources/`, `rules/`, etc.).

This is the same format Jean-Claude already uses, making integration natural.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Renderer                                                 │
│                                                           │
│  SkillsSettings (index.tsx)                               │
│    └── "Browse" button → SkillRegistryBrowser dialog      │
│         ├── Search input (debounced 300ms)                │
│         ├── Results grid (RegistrySkillCard)              │
│         └── Preview pane (RegistrySkillPreview)           │
│              ├── Name, description, install count, source │
│              ├── SKILL.md content preview                 │
│              ├── Backend checkboxes (CC + OC)             │
│              └── "Install" button                         │
│                                                           │
│  Hooks: useRegistrySearch(), useRegistrySkillContent(),   │
│         useInstallRegistrySkill()                         │
└──────────────────┬───────────────────────────────────────┘
                   │ IPC
┌──────────────────▼───────────────────────────────────────┐
│  Main Process                                             │
│                                                           │
│  skill-registry-service.ts                                │
│    ├── searchRegistry(query)                              │
│    │     → GET skills.sh/api/search?q=<query>             │
│    ├── fetchRegistrySkillContent(source, skillId)         │
│    │     → GitHub raw content for SKILL.md preview        │
│    └── installFromRegistry(source, skillId, backends)     │
│          → shallow git clone → discover SKILL.md          │
│          → createSkill() → copy companion files           │
└──────────────────────────────────────────────────────────┘
```

### Search API

```
GET https://skills.sh/api/search?q=<query>

Response:
{
  "query": "react",
  "searchType": "fuzzy",
  "skills": [
    {
      "id": "vercel-labs/agent-skills/vercel-react-best-practices",
      "skillId": "vercel-react-best-practices",
      "name": "vercel-react-best-practices",
      "installs": 182001,
      "source": "vercel-labs/agent-skills"
    }
  ],
  "count": 20,
  "duration_ms": 15
}
```

### Content Preview

Before installing, users can preview the SKILL.md content. This is fetched via GitHub raw URLs (`raw.githubusercontent.com`) to avoid cloning the repo for preview. Multiple path conventions are tried:

1. `<source>/main/skills/<skillId>/SKILL.md`
2. `<source>/main/skills/.curated/<skillId>/SKILL.md`
3. `<source>/main/<skillId>/SKILL.md`
4. `<source>/main/SKILL.md` (single-skill repos)

### Installation Flow

1. Shallow clone (`git clone --depth 1`) the source repo to a temp directory (60s timeout)
2. Discover the SKILL.md at expected paths within the cloned repo
3. Parse frontmatter to extract name and description
4. Call `createSkill()` to write SKILL.md to JC canonical storage (`~/.config/jean-claude/skills/user/<name>/`) and create symlinks
5. Copy companion files (AGENTS.md, resources/, rules/, etc.) from the cloned skill directory
6. Clean up temp directory (always, even on error)
7. Invalidate managed skills queries to refresh the UI

### Duplicate Detection

Before install, the UI checks if a local skill with the same name already exists. If so, the card shows an "Installed" badge and the install button is disabled. This uses the existing `useAllManagedSkills()` query.

### Post-Install

Once installed, registry skills become regular JC-managed user skills. They can be:
- Enabled/disabled per backend via the existing toggle mechanism
- Edited (name, description, content) via the existing skill form
- Deleted via the existing delete flow

## Types

```typescript
/** A skill from the skills.sh search API */
interface RegistrySkill {
  id: string;           // e.g. "vercel-labs/agent-skills/react-best-practices"
  skillId: string;      // e.g. "react-best-practices"
  name: string;
  installs: number;
  source: string;       // e.g. "vercel-labs/agent-skills"
}

/** Search results from skills.sh */
interface RegistrySearchResult {
  query: string;
  skills: RegistrySkill[];
  count: number;
}

/** Content fetched for a registry skill preview */
interface RegistrySkillContent {
  name: string;
  description: string;
  content: string;       // markdown body without frontmatter
}
```

## Files

| File | Action | Description |
|------|--------|-------------|
| `shared/skill-types.ts` | Modified | Added `RegistrySkill`, `RegistrySearchResult`, `RegistrySkillContent` |
| `electron/services/skill-registry-service.ts` | Created | Search, preview, and install from skills.sh registry |
| `electron/ipc/handlers.ts` | Modified | Added `skills:registrySearch`, `skills:registryFetchContent`, `skills:registryInstall` |
| `electron/preload.ts` | Modified | Added 3 preload bridge methods |
| `src/lib/api.ts` | Modified | Added API types + fallback stubs |
| `src/hooks/use-managed-skills.ts` | Modified | Added `useRegistrySearch`, `useRegistrySkillContent`, `useInstallRegistrySkill` |
| `src/features/settings/ui-skills-settings/skill-registry-browser.tsx` | Created | Browse dialog with search, results grid, preview pane, install |
| `src/features/settings/ui-skills-settings/index.tsx` | Modified | Added "Browse" button |

## UI

The browser is a full-screen dialog (same pattern as Legacy Skill Migration) accessible via a "Browse" button in the Skills settings header. It contains:

- **Search bar** with auto-focus and debounced input
- **Results grid** with cards showing skill name, install count, source repo, and "Installed" badge
- **Preview pane** (right side, 380px) showing full skill details, content, backend checkboxes, and install button
- **Footer** with skills.sh attribution and close button

## Error Handling

| Scenario | Handling |
|----------|----------|
| Network failure (search) | Shows no results; React Query retry |
| Network failure (preview) | Shows "Could not load skill content" message |
| Git clone failure | Toast error with message (timeout, auth, etc.) |
| Skill not found in repo | Toast error listing paths searched |
| Name conflict | `createSkill()` throws; shown as toast error |
| Git not available | Shell error surfaced as toast |
| Temp dir cleanup failure | Logged, does not affect user |

## Future Enhancements

- **Update checking**: Track source repo + git tree SHA to detect upstream updates
- **Batch install**: Select multiple skills from same repo for bulk installation
- **Skill categories/tags**: Filter by category when the API supports it
- **Project-scope install**: Install skills into project `.claude/skills/` instead of user scope
