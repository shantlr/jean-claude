# FIM Context System Design

## Problem

The FIM (Fill-in-the-Middle) autocomplete sends only the text before/after the cursor to Mistral Codestral. Since task prompts are short, the model lacks context about the project and the user's writing patterns, producing generic or irrelevant completions.

## Solution

Add a per-project "completion context" — a freeform text block prepended to the FIM prompt on every completion request. The context describes what the project is about and includes example prompts so the model can match the user's style.

Users can edit the context manually in project settings, or auto-generate it from their task history via a Claude Haiku call.

## Data Flow

### Completion with context

```
User types in prompt textarea
        ↓
useInlineCompletion sends { prompt, suffix, projectId }
        ↓
IPC → completion:complete handler
        ↓
completionService.complete() fetches project.completionContext from DB
        ↓
Prepends context to prompt: `${context}\n\n${prompt}`
        ↓
Sends to Mistral FIM API
        ↓
Returns completion → ghost text in textarea
```

### Context generation

```
User clicks "Generate" in project settings
        ↓
IPC → completion:generateContext handler
        ↓
Fetches last ~30 task prompts from DB for this project
        ↓
Calls Claude Haiku → produces project description + example prompts
        ↓
Returns context string → fills textarea in settings UI
        ↓
User edits if needed, saves with project
```

## Database

Add `completionContext TEXT DEFAULT NULL` to the `projects` table via a new migration. Update `ProjectTable` in `schema.ts` and `Project`/`UpdateProject` in `shared/types.ts`.

## Completion Service Changes

`complete()` signature changes from `{ prompt, suffix }` to `{ prompt, suffix, projectId? }`.

When `projectId` is provided:
1. Fetch the project's `completionContext` from DB
2. If non-empty, prepend it to the prompt separated by `\n\n`
3. Pass the combined prompt to Mistral FIM

## New Service: `completion-context-generation-service.ts`

A new service `generateCompletionContext({ projectId })`:
1. Queries the last ~30 task prompts for the project (ordered by creation date desc)
2. Calls Claude Haiku via `query()` from `@anthropic-ai/claude-agent-sdk` (same pattern as `name-generation-service.ts`)
3. Prompt instructs Haiku to produce:
   - A short project description (what it's used for, not technical details)
   - A curated list of example prompts representative of the user's style
4. Returns the generated text string

## Project Settings UI

New "Autocomplete Context" section in `ui-project-settings/index.tsx`:
- Placed after the existing project details section, before integrations
- A `<textarea>` for the context (persisted via the existing Save Changes flow)
- A "Generate from task history" button that:
  - Calls `api.completion.generateContext({ projectId })`
  - Shows a loading spinner during generation
  - Fills the textarea with the result (user can edit before saving)
- Helper text: "Provides context to the autocomplete model when completing prompts in this project."

## IPC & API Changes

- `completion:complete` — add optional `projectId` parameter
- `completion:generateContext` — new handler, accepts `{ projectId }`, returns `string | null`
- Update `window.api.completion` types in `api.ts` and `preload.ts`

## Hook Changes

- `useInlineCompletion` — accept optional `projectId`, pass through to API
- `PromptTextarea` — accept optional `projectId` prop, forward to `useInlineCompletion`
- Parent components (message input) — pass `projectId` from route params
