# Idling

Personal productivity GUI to manage coding agents across multiple projects.

Primary agent: Claude Code (via Agent SDK) with extensibility for other agents later.

**MVP: Phase 0-2** — Core app with project management, agent sessions, and worktrees.

## Roadmap

---

### Phase 1: Foundation

#### 1.1 Project Setup

- [x] Initialize project
  - Stack: Electron, React, TypeScript, TailwindCSS, Zustand, ESLint, Prettier
  - TanStack Router for navigation (see [routing design](docs/plans/2026-01-18-routing-design.md))
  - Claude Code Agent SDK integration
- [x] Define data model
  - Tasks: id, name, status, timestamps, sessionId, worktreePath, startCommitHash
  - Projects: id, name, path, type (local/git-provider)
  - Sessions: managed by Agent SDK, referenced by sessionId
- [x] Set up persistence layer (SQLite + Kysely)
  - Store task metadata + session IDs (Agent SDK handles message history)
  - Use `better-sqlite3` for synchronous SQLite access
  - Use Kysely for type-safe queries and migrations

#### 1.2 Main Layout

- [x] Sidebar (left)
  - [x] Discord-style project tiles (auto-generated icon from name)
  - [x] "Add project" button at bottom
  - [x] Settings gear icon at bottom
- [x] Header (top)
  - [x] macOS traffic lights (close/minimize/maximize) on left
  - [x] Usage/rate limits display on right (Phase 4)
- [x] Content area
  - [x] Dynamic based on selection (project view, settings, etc.)

#### 1.3 Add Project (Local Folder)

- [x] Folder picker dialog
- [x] Extract project name from folder name or package.json
- [x] Store path in local config

---

### Phase 2: Core Agent Features

Note: Multiple agents can run simultaneously across different projects. UI must handle concurrent "running" states and multiple notifications.

#### 2.1 Project View Layout

- [ ] Project sidebar (secondary, inside content area)
  - [ ] Project name/icon at top (links to project details)
  - [ ] "New task" button
  - [ ] Task list (title, status indicator, timestamp per task)
  - [ ] Unread badge on task (waiting for input, completed, errored)
- [ ] Task panel (interactive session, similar to Claude Code CLI)
  - [ ] Chat-like message history (prompts, agent responses, tool outputs)
    - [ ] Render code diffs with syntax highlighting
    - [ ] Render markdown, code blocks, etc.
    - [ ] Clickable file paths (e.g., src/foo.ts:42-50)
    - [ ] Right pane to preview file content when path is clicked
  - [ ] Input box at bottom to send follow-up prompts
    - [ ] Enter to send, Shift+Enter for new line
    - [ ] @ triggers file path autocomplete
  - [ ] Shortcut to open project folder in external editor (uses task's worktree if applicable)
- [ ] Unread badge on project tile in main sidebar (when any task needs attention)
- [ ] Mark as read when task is viewed

#### 2.2 Task Creation

- [ ] Prompt input (multiline textarea)
- [ ] Use worktree checkbox (default: on)
- [ ] Submit creates agent session and adds to task list

#### 2.3 Agent Output & Controls

- [ ] Real-time streaming output from agent
- [ ] Status indicators (running, waiting, completed, errored)
- [ ] Permission request handling (approve/deny buttons)
- [ ] Agent question handling (text input to respond)
- [ ] Stop button to terminate agent
- [ ] Desktop notifications (waiting for input, task completed)

#### 2.4 Worktree Management

- [ ] Auto-create worktree when task starts (if enabled)
- [ ] Track worktree path per task
- [ ] Show active worktrees per project
- [ ] Manual cleanup via UI (merge branch or delete worktree)

---

### Phase 3: Git Provider Integration & Settings

Note: All git provider features use a provider abstraction layer. ADO is the first implementation, but the interface supports GitHub/GitLab later.

#### 3.1 Settings Page

- [ ] Accessible from sidebar gear icon
- [ ] External editor selection (VS Code, Cursor, etc.)
- [ ] Keybindings section (customizable shortcuts)
- [ ] Azure DevOps section
  - [ ] Add/remove API keys (PAT tokens)
  - [ ] Label per key (e.g., "Work org", "Personal")
  - [ ] Auto-fetch organization info on add (org name, avatar)
  - [ ] Connection status indicator

#### 3.2 Azure DevOps Projects

- [ ] "Add project" supports ADO repo URL
- [ ] Fetch repo details via API (name, description, default branch)
- [ ] Clone repo locally on add (or link to existing clone)
- [ ] Work item picker in task creation
  - [ ] Searchable combobox
  - [ ] Shows work item ID, title, type
  - [ ] Checkbox to include work item context in prompt (default: on)

---

### Phase 4: Power Features

#### 4.1 Model Selection

- [ ] Per-task model dropdown (Opus, Sonnet, Haiku)
- [ ] Default model setting per project
- [ ] Global default in settings

#### 4.2 Usage & Rate Limits

- [ ] Display in header (e.g., "Claude Code: 72% of 5h limit")
- [ ] Fetch from Claude Code API/CLI if available
- [ ] Visual warning when approaching limit

#### 4.3 Custom MCP Tools

- [ ] Per-project MCP tool configuration
- [ ] Add tool via JSON definition or path to tool script
- [ ] Enable/disable tools per task

#### 4.4 Hook Configuration

- [ ] Pre-task hooks (run before agent starts)
- [ ] Post-task hooks (run after agent completes)
- [ ] Event hooks (on file edit, on bash command, etc.)
- [ ] Configure via settings UI or project config file

#### 4.5 Git Diff Tab

- [ ] Add Git Diff tab to task panel (horizontal tab bar: Chat, Git Diff)
- [ ] Top bar with comparison dropdown (HEAD, main, Task start) and refresh button
- [ ] Left panel: changed files tree
  - [ ] Files organized in folder hierarchy
  - [ ] Status icons (added/modified/deleted)
  - [ ] File count badge
- [ ] Right panel: diff viewer
  - [ ] Unified diff format
  - [ ] Syntax highlighting
  - [ ] Line numbers
- [ ] "Task start" comparison logic
  - [ ] Worktree tasks: compare against branch point (merge-base)
  - [ ] Non-worktree tasks: compare against commit hash saved at task creation
- [ ] Empty state: "No changes" message
- [ ] Binary files: show "Binary file changed"

#### 4.6 PR Creation

- [ ] "Create PR" action on completed tasks (only for worktree tasks)
  - [ ] Pre-fill PR title from task name or first prompt line
  - [ ] Pre-fill PR description with task summary (agent-generated or manual)
  - [ ] Target branch selector (default: main/master)
  - [ ] Draft PR toggle (default: on)
  - [ ] Link work item if task was created from one
- [ ] PR creation flow
  - [ ] Commit uncommitted changes prompt (if any)
  - [ ] Push branch to remote
  - [ ] Create PR via Azure DevOps API
  - [ ] Show PR link on success
- [ ] Post-PR options
  - [ ] Keep worktree (for iterations)
  - [ ] Delete worktree after PR merge

#### 4.7 PR Review (Low Priority)

- [ ] PR picker in project view
  - [ ] Fetch open PRs from Azure DevOps API
  - [ ] Searchable list (PR number, title, author)
  - [ ] Show PR status, reviewers, comments count
- [ ] Start review action
  - [ ] Create worktree on PR branch
  - [ ] Auto-generate review prompt with PR context (description, linked work items)
- [ ] Review workflow
  - [ ] Agent analyzes diff against target branch
  - [ ] Suggests inline comments on specific files/lines
  - [ ] Preview comments before posting
- [ ] Post comments to Azure DevOps
  - [ ] Map agent suggestions to PR comment threads
  - [ ] Support for general comments and inline comments
  - [ ] Option to approve/request changes with review submission

---

### Phase 5: Polish

#### 5.1 Quality of Life

- [ ] Task search/filter
- [ ] Export task logs
- [ ] Keyboard shortcuts
  - [ ] next task
  - [ ] previous task
- [ ] Notification preferences (enable/disable, sound, etc.)
