# Unified Agent Skills Management

## Problem

Jean-Claude treated skills as read-only filesystem artifacts. Skills were discovered from three sources (project, user, plugin) but there was no UI to create, edit, delete, enable, or disable them. Each agent backend stores skills in different locations, requiring manual filesystem management.

## Goal

A unified UI to manage skills across agent backends — abstracting backend-specific directory conventions while operating directly on the filesystem so changes are visible to both Jean-Claude and CLI usage.

## Key Design Decisions

- **Symlink-based enable/disable**: All JC-managed user skills live in a Jean-Claude canonical store (`~/.config/jean-claude/skills/<backend>/user/`). Backend-expected paths contain symlinks. Enable = create symlink, Disable = remove symlink. The canonical skill is never moved or lost.
- **Filesystem only, no database**: Skills are inherently filesystem-based. No new database tables.
- **Backend-agnostic path registry**: Each backend registers its skill directory paths in `SKILL_PATH_CONFIGS`. New backends just add a config entry.
- **Plugin skills are read-only**: Displayed but not editable — managed by external tooling.
- **Two UI surfaces**: Global settings for user-level skills, per-project section for project-level skills.
- **Legacy skill detection**: Skills directly in a backend path that are not JC-managed symlinks are discovered and shown as enabled/editable — no forced migration.

## Architecture

### Storage Layout

```
~/.config/jean-claude/skills/          ← JC canonical store
  claude-code/user/<skillName>/
    SKILL.md
  opencode/user/<skillName>/
    SKILL.md

~/.claude/skills/<skillName>           ← symlink (enabled)  → JC canonical
                                       ← absent (disabled)

~/.config/opencode/skills/<skillName>  ← symlink (enabled)  → JC canonical
                                       ← absent (disabled)

<project>/.claude/skills/<skillName>/  ← project skills, in-place (no symlinks)
~/.claude/plugins/cache/               ← plugin skills, read-only
```

### Backend Path Registry

```typescript
// electron/services/skill-management-service.ts
const SKILL_PATH_CONFIGS: Record<AgentBackendType, AgentSkillPathConfig> = {
  'claude-code': {
    userSkillsDir: '~/.claude/skills',          // where symlinks go
    projectSkillsDir: '.claude/skills',         // relative to project root
    pluginSkillsDir: '~/.claude/plugins/cache',
  },
  opencode: {
    userSkillsDir: '~/.config/opencode/skills', // where symlinks go
    projectSkillsDir: undefined,
    pluginSkillsDir: undefined,
  },
};
```

### Data Types

```typescript
// shared/skill-types.ts
interface ManagedSkill {
  name: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
  skillPath: string;          // canonical JC path for user skills; project dir for project skills
  enabled: boolean;           // symlink present for user skills; always true for project/plugin
  backendType: AgentBackendType;
  editable: boolean;          // false for plugin skills
}
```

### Service API (`electron/services/skill-management-service.ts`)

```
getAllManagedSkills(backendType, projectPath?) → ManagedSkill[]
  - Scans JC canonical dir (enabled = symlink exists in backend path)
  - Also discovers legacy skills (real dirs in backend path, not symlinks)
  - Discovers project skills (in-place) and plugin skills (read-only)

createSkill(backendType, scope, name, description, content) → ManagedSkill
  - user scope: creates in JC canonical dir + creates symlink; rolls back on symlink failure
  - project scope: creates directly in project dir

updateSkill(skillPath, backendType, name?, description?, content?) → ManagedSkill

deleteSkill(skillPath, backendType) → void
  - Removes symlink if JC-managed, then removes canonical dir

disableSkill(skillPath, backendType) → void
  - Removes symlink from backend path; canonical dir untouched

enableSkill(skillPath, backendType) → void
  - Creates symlink in backend path pointing to canonical dir

getSkillContent(skillPath) → { name, description, content }
```

### IPC Channels

```
skills:getAll(backendType, projectPath?)
skills:getContent(skillPath)
skills:create({ backendType, scope, projectPath?, name, description, content })
skills:update({ skillPath, backendType, name?, description?, content? })
skills:delete(skillPath, backendType)
skills:disable(skillPath, backendType)
skills:enable(skillPath, backendType)
```

## UI

### Global Settings (`/settings → Skills`)

- Backend selector (Claude Code / OpenCode)
- **User Skills**: list with inline enable/disable toggle, two-step delete confirmation, edit via form pane
- **Plugin Skills**: read-only list grouped by plugin
- **Add** button opens form pane for creating a new user skill

### Per-Project Skills

In project settings, before MCP overrides:

- **Project Skills**: full CRUD for `.claude/skills/` in the project dir
- **Inherited**: read-only view of user + plugin skills

### Skill Form

Fields: Name (kebab-cased into dir name), Description, Content (markdown body). Errors shown via toast notification.

## Edge Cases

| Case | Handling |
|---|---|
| Symlink creation fails after canonical dir written | Roll back with `fs.rm` |
| Skill already exists at target path | Reject with descriptive error |
| Backend skills dir missing | Create with `fs.mkdir({ recursive: true })` |
| Skill already enabled/disabled | No-op (EEXIST / symlink-absent checks) |
| Legacy skill (real dir in backend path) | Shown as enabled; cannot enable/disable until imported |

## Out of Scope

- No marketplace / URL-based skill installation
- No skill versioning or rollback
- No sharing between users
- No changes to agent runtime skill discovery
