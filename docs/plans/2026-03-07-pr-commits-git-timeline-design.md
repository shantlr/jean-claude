# PR Commits Tab — Git Timeline Redesign

## Summary

Replace the current card-based commit list in the PR commits tab with a classical vertical git timeline (line + dots).

## Current State

Simple vertical stack of `bg-neutral-800/50` cards, each showing a GitCommit icon, message, hash, author, and time. Flat, no visual connection between commits.

## Design

### Layout

Vertical timeline with a continuous line on the left and commit nodes:

```
  ●  Fix login redirect bug
  │  abc1234 · Patrick · 2 hours ago
  │
  ●  Add user avatar component
  │  def5678 · Patrick · 5 hours ago
  │
  ●  Refactor auth service
     789abcd · Patrick · 1 day ago
```

### Visual Details

- **Timeline line**: 2px vertical line in `neutral-700`, connecting commit dots
- **Commit dots**: 8×8px filled circles in `blue-400`, centered on the line. The top commit (latest) gets a ring/glow to indicate HEAD
- **Commit message**: First line, truncated, `neutral-100`
- **Metadata row**: Short hash (monospace, `neutral-400`) · author name · relative time — all `text-xs text-neutral-500`
- **Clickable hash**: Opens commit URL in external browser
- **Hover**: Subtle `neutral-800` background highlight on the commit row
- **No trailing line**: The bottom commit has no line segment below it
- **No date grouping**: Flat continuous timeline

### Data

No changes to data layer. Same `usePullRequestCommits` hook, same `AzureDevOpsCommit` type.

### Scope

Single file: `src/features/pull-request/ui-pr-commits/index.tsx`. Pure CSS/JSX rework.
