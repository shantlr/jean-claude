# Enable Managed Skills Per Backend

## Problem

Currently, a `ManagedSkill` has a single `backendType` and single `enabled` field. A skill created for Claude Code cannot be easily enabled for OpenCode without recreating it. In the global skills settings, there is no way to toggle a skill's availability per backend.

The canonical storage (`~/.config/jean-claude/skills/user/<skillName>/`) is already backend-agnostic, and the symlink-based enable/disable mechanism already operates per-backend. The gap is in the data model and UI.

## Design

### Data Model

Replace `enabled: boolean` + `backendType: AgentBackendType` on `ManagedSkill` with a per-backend map:

```typescript
interface ManagedSkill {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
  skillPath: string;
  enabledBackends: Partial<Record<AgentBackendType, boolean>>; // NEW
  editable: boolean;
}
```

Behaviors:
- **JC-managed user skills**: `enabledBackends` has entries for all known backends (e.g., `{ 'claude-code': true, 'opencode': false }`).
- **Legacy/plugin/project skills**: `enabledBackends` has only their native backend (e.g., `{ 'claude-code': true }`).
- A skill is considered "enabled" for display/opacity purposes if at least one backend is enabled.

### Service Layer

**New function: `getAllManagedSkillsUnified({ projectPath? })`**
- Scans canonical storage once, checks symlinks in all backend directories to build `enabledBackends`.
- Discovers legacy, project, and plugin skills per-backend, maps to new type with single-entry `enabledBackends`.
- Deduplication by `skillPath` at the service level.
- Returns sorted `ManagedSkill[]`.

**Updated: `createSkill()`**
- Accepts `enabledBackends: AgentBackendType[]` (array of backends to enable at creation time).
- Creates canonical dir + SKILL.md, then creates symlinks in each selected backend's skills directory.

**Unchanged:**
- `enableSkill({ skillPath, backendType })` and `disableSkill({ skillPath, backendType })` — already per-backend.
- `deleteSkill()` — already removes symlinks from all backends.

**Updated: `updateSkill()`**
- Returns `enabledBackends` map instead of single `enabled`/`backendType`.

**Updated: `getAllManagedSkills({ backendType, projectPath? })`**
- Kept for project-level settings (queries single backend).
- Returns new type with single-entry `enabledBackends`.

### IPC

- New handler: `skills:getAllUnified` calls `getAllManagedSkillsUnified()`.
- Existing `skills:getAll` kept for project-level use.
- `skills:create` updated to accept `enabledBackends` array.

### Hooks

- `useAllManagedSkills()` simplified — calls `api.skillManagement.getAllUnified(projectPath?)`, no merge/dedup logic.
- `useManagedSkills(backendType, projectPath?)` kept for project-level.
- `useCreateSkill()` params updated: `backendType` replaced with `enabledBackends: AgentBackendType[]`.

### UI: Global Skills Settings

**Card grid (`skill-card-grid.tsx`):**
- Replace single `BackendBadge` with per-backend **toggle chips**.
- Each chip shows backend abbreviation + enabled/disabled state.
- Clicking a chip toggles that backend (calls `enableSkill`/`disableSkill`), with `stopPropagation()` to avoid selecting the card.
- Chip styling: enabled = solid background (orange for CC, blue for OC); disabled = outlined/muted.
- Non-toggleable skills (legacy, plugin, project): static badges, no click handler.
- Card opacity: dim (60%) only when no backends are enabled.

**Skill form (create mode):**
- Replace single backend dropdown with backend checkboxes (both shown, at least one required).
- Default: all backends checked.

**Skill details pane:**
- Show per-backend toggle switches for editable user skills.
- Read-only display for legacy/plugin skills.

### UI: Project-Level Skills Settings

- No behavior change — still filters by project's default backend.
- Uses `useManagedSkills(backendType, projectPath)` as before.
- Backend chips shown as static badges (project context is single-backend).

### Error Handling

- If enabling/disabling fails, toast is shown and queries refetch to reflect actual symlink state.
- Each toggle is an independent operation — no partial state.

## Alternatives Considered

1. **Derived type at hook layer**: Keep `ManagedSkill` unchanged, merge per-backend enabled status in `useAllManagedSkills()`. Less invasive but maintains two representations and complex merge logic.
2. **Stop deduplicating**: Show two cards for the same skill when enabled for different backends. Minimal code change but confusing UX.

Chose Approach 1 (extend data model) for cleanest representation matching the domain reality.
