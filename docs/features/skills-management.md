# Skills Management

Unified UI to create, edit, delete, enable, and disable agent skills across backends (Claude Code and OpenCode).

## How It Works

All JC-managed user skills live in a canonical store. Backend-expected paths contain symlinks:

```
~/.config/jean-claude/skills/
  claude-code/user/<skillName>/SKILL.md   ← canonical
  opencode/user/<skillName>/SKILL.md      ← canonical

~/.claude/skills/<skillName>              → symlink = enabled, absent = disabled
~/.config/opencode/skills/<skillName>     → symlink = enabled, absent = disabled

<project>/.claude/skills/<skillName>/     ← project skills, managed in-place
~/.claude/plugins/cache/                  ← plugin skills, read-only
```

**Enable** = create symlink. **Disable** = remove symlink. The canonical skill is never moved or deleted.

**Legacy skills** (real directories already in a backend path, not created by JC) are discovered and shown as enabled — no forced migration.

## UI

**Global settings → Skills tab**
- Backend selector (Claude Code / OpenCode)
- User skills list: toggle enable/disable, two-step delete confirmation, edit via form pane
- Plugin skills: read-only, grouped by plugin name
- Add button opens inline form (name, description, markdown content)

**Project settings → Skills section**
- Project skills: full CRUD for `.claude/skills/` within the project directory
- Inherited skills: read-only view of user + plugin skills

## Key Files

| File | Purpose |
|---|---|
| `electron/services/skill-management-service.ts` | All filesystem operations (CRUD, symlink management, discovery) |
| `shared/skill-types.ts` | `ManagedSkill`, `AgentSkillPathConfig`, `SkillScope` types |
| `electron/ipc/handlers.ts` | IPC handlers: `skills:getAll/getContent/create/update/delete/disable/enable` |
| `src/hooks/use-managed-skills.ts` | React Query hooks for all skill operations |
| `src/features/settings/ui-skills-settings/` | Global settings UI (list, form) |
| `src/features/project/ui-project-skills-settings/` | Per-project skills UI |

## Backend Path Registry

Defined in `SKILL_PATH_CONFIGS` in the service:

| | Claude Code | OpenCode |
|---|---|---|
| Symlinks go in | `~/.claude/skills/` | `~/.config/opencode/skills/` |
| Project skills | `.claude/skills/` (relative) | — |
| Plugins | `~/.claude/plugins/cache/` | — |
| JC canonical | `~/.config/jean-claude/skills/claude-code/user/` | `~/.config/jean-claude/skills/opencode/user/` |

## Skill Format

Each skill is a directory with a `SKILL.md` file:

```markdown
---
name: my-skill
description: What this skill does
---

Markdown body — the instructions the agent reads when this skill is invoked.
```

## Adding a New Backend

Add an entry to `SKILL_PATH_CONFIGS` in `skill-management-service.ts` with `userSkillsDir` (where symlinks go) and optionally `projectSkillsDir` / `pluginSkillsDir`.
