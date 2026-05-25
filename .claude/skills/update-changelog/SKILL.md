---
name: update-changelog
description: Use this skill whenever the user intentionally asks to update, generate, refresh, run, or reconcile Jean-Claude changelogs. This skill is the only approved path for editing changelogs; normal implementation work must not touch changelog files unless the user explicitly requests a changelog update.
---

# Update Changelog

Use this skill to manually update `changelogs/` from git history. The goal is editorial release notes by day, not a mechanical commit log.

## Guardrail

Only edit changelog files when the user explicitly asks for changelog work. Do not run this skill automatically after ordinary features, fixes, refactors, or UI changes.

## Inputs

- Changelog directory: `changelogs/`
- Metadata file: `changelogs/.metadata.json`
- Daily files: `changelogs/YYYY-MM-DD.md`

## Workflow

1. Run `git status -u --short` and note unrelated worktree changes. Do not modify unrelated files.
2. Read `changelogs/.metadata.json` if it exists.
3. Determine the starting commit:
   - Prefer `lastProcessedCommitHash` from metadata.
   - If metadata is missing, inspect the newest changelog files for `Commits:` bullets and use the latest referenced hash.
   - If no hash exists, ask the user which commit or date to start from.
4. Collect commits after the starting commit with dates and subjects:
   - Use `git log --reverse --date=short --pretty=format:'%H%x09%h%x09%ad%x09%s' <start>..HEAD`.
   - Use `git show --stat --oneline <hash>` or inspect diffs when subjects are not enough to understand user impact.
5. Group commits by author date, then write one daily file per date.
6. Within each day, combine related commits into product-facing entries by outcome and scope. Prefer one entry for a feature area over many entries for individual commits.
7. Order entries within each day by product value: `[feature]` entries first, `[improvement]` entries second, `[fix]` entries last.
8. If a feature and its same-day fixes or polish commits belong to one outcome, describe the final polished outcome and include all related hashes in the feature or improvement entry. Do not add separate bug-fix entries for bugs users never experienced independently.
9. Include commit hashes in every top-level entry as final nested bullet: `Commits: abc1234` or `Commits: abc1234, def5678`.
10. Update `changelogs/.metadata.json` only after changelog edits are complete.

## Editorial Rules

- Write for users scanning the in-app changelog.
- Mention visible behavior, location, trigger, or keybinding when useful.
- Skip purely internal commits unless they affect users, releases, stability, install, or visible behavior.
- Avoid implementation details unless they explain user-visible behavior.
- Keep one top-level entry per product outcome per day.
- If several commits form one outcome, merge them and list all hashes.
- Prefer final behavior over chronology. A feature entry can include same-day fixes, refinements, tests, and support work when they are part of the same shipped outcome.
- Reserve `[fix]` entries for standalone user-visible regressions or broken behavior, not cleanup for a feature introduced that same day.
- If a day already has entries, append or merge into existing entries instead of duplicating scope/outcome.

## Format

```md
- [feature] [scope]
  - Added user-visible outcome in clear product language
  - Mentioned where to find it or when it appears, if relevant
  - Commits: abc1234, def5678
- [fix] [scope]
  - Fixed user-visible broken behavior
  - Commits: 901abcd
```

Allowed types:

- `[feature]` for new capabilities
- `[fix]` for corrected behavior
- `[improvement]` for usability, performance, polish, or workflow improvements

Scope should be short and product-facing, for example `[project]`, `[task details]`, `[settings]`, `[pr details]`, `[review]`, `[changelog]`, `[new task]`.

## Metadata Format

Store metadata in `changelogs/.metadata.json`:

```json
{
  "lastProcessedCommitHash": "51a0ab5ea23dbc02181cca37c71de14af92fc035",
  "lastProcessedCommitShortHash": "51a0ab5",
  "lastProcessedCommitDate": "2026-05-25",
  "updatedAt": "2026-05-25"
}
```

Use full commit hash for `lastProcessedCommitHash`. Use `date +%Y-%m-%d` for `updatedAt`; never assume current date.

## Completion Checklist

- Daily files use `changelogs/YYYY-MM-DD.md`.
- Entries are editorial summaries, not one entry per commit.
- Every top-level entry has one `Commits:` bullet with short hashes.
- `changelogs/.metadata.json` points at the latest processed commit.
- Final response lists days updated and latest processed commit.
