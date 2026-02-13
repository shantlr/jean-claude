# Inline Ghost Text Autocomplete

## Overview

Add inline ghost text completions (like GitHub Copilot) to prompt textareas in Jean-Claude. As the user types, a grayed-out suggestion appears inline that they can Tab to accept. Powered by Mistral's FIM (Fill-in-the-Middle) API via raw `fetch`.

## Approach

- **Opt-in**: Disabled by default. User manually configures provider details in Settings.
- **No presets**: User provides Base URL, API Key, and Model manually.
- **Mistral FIM API**: `POST /v1/fim/completions` — purpose-built for code completion with FIM support.
- **Raw `fetch`**: No SDK dependency. The endpoint is a single POST call (~30 lines of code).
- **Ghost text overlay**: Transparent div overlaid on the textarea to show grayed-out suggestions inline.

## Settings

### Storage

Uses the existing `settings` key-value table. No new migrations needed.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `completionEnabled` | `"true"` / `"false"` | `"false"` | Feature toggle |
| `completionBaseUrl` | string | — | e.g., `https://api.mistral.ai` |
| `completionApiKey` | string (encrypted) | — | Encrypted via `encryption-service.ts` |
| `completionModel` | string | — | e.g., `codestral-2508` |

### Settings UI

New tab: `/settings/autocomplete`

```
┌─────────────────────────────────────────────┐
│  Enable Autocomplete              [toggle]   │
│                                              │
│  Base URL                                    │
│  ┌─────────────────────────────────┐        │
│  │ https://api.mistral.ai          │        │
│  └─────────────────────────────────┘        │
│                                              │
│  API Key                                     │
│  ┌─────────────────────────────────┐        │
│  │ ••••••••••••••••                │        │
│  └─────────────────────────────────┘        │
│                                              │
│  Model                                       │
│  ┌─────────────────────────────────┐        │
│  │ codestral-2508                  │        │
│  └─────────────────────────────────┘        │
│                                              │
│                              [Save]          │
└─────────────────────────────────────────────┘
```

- Toggle off by default. Fields disabled when toggle is off.
- Base URL and Model are required. API Key can be empty (for local servers).
- API Key encrypted before storing.
- Save validates config with a test completion request.

## Completion Service

### File: `electron/services/completion-service.ts`

Responsibilities:
1. Read completion settings from the settings repository.
2. Make `fetch` calls to the FIM endpoint.
3. Support request cancellation via `AbortSignal`.
4. Return completion text or `null` on error.

### API Call

```
POST ${baseUrl}/v1/fim/completions
Authorization: Bearer ${apiKey}
Content-Type: application/json

{
  "model": "<from settings>",
  "prompt": "<text before cursor>",
  "suffix": "<text after cursor, optional>",
  "max_tokens": 64,
  "temperature": 0,
  "stop": ["\n\n"]
}
```

Response: `data.choices[0].message.content` → completion string.

### Error Handling

All errors (network, auth, timeout) are caught silently and return `null`. Autocomplete is a nice-to-have and must never block the user.

### IPC

New handler: `completion:complete({ prompt, suffix })` → `string | null`

## React Hook

### File: `src/hooks/use-inline-completion.ts`

```typescript
const { completion, accept, dismiss } = useInlineCompletion({
  text,           // current textarea value
  cursorPosition, // cursor index
  enabled,        // from settings
});
```

### Behavior

- **Debounce**: 300ms after last keystroke before firing a request.
- **Cancellation**: New keystroke abandons any pending request (response ignored).
- **Minimum input**: No trigger for text shorter than 10 characters.
- **Clear on action**: Ghost text dismissed on cursor move, Escape, or new typing.
- **Tab to accept**: Inserts ghost text at cursor position, clears completion state.

## Ghost Text Rendering

### Technique: Overlay div on textarea

Inside `PromptTextarea`'s existing container div:

```
┌─ container div ──────────────────────────┐
│  ┌─ textarea ──────────────────────────┐ │
│  │ Fix the auth bug in the login flow  │ │
│  └─────────────────────────────────────┘ │
│  ┌─ overlay div (pointer-events: none) ┐ │
│  │ [invisible: real text] [gray: ghost]│ │
│  └─────────────────────────────────────┘ │
│  ┌─ dropdown (existing slash commands) ┐ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

- Overlay mirrors textarea font, padding, and scroll position.
- Real text portion rendered with `visibility: hidden` (takes space but invisible).
- Ghost continuation rendered in gray (`text-zinc-500`).
- Overlay has `pointer-events: none` so clicks pass through to textarea.

### Integration with `PromptTextarea`

- New optional prop: `enableCompletion?: boolean`
- When enabled, the hook is called and the overlay is rendered.
- Mutual exclusion: completions paused while `/` slash command dropdown is open.

### Keyboard Handling (extends existing `onKeyDown`)

| Key | Action |
|-----|--------|
| Tab | Accept completion (prevent default) |
| Escape | Dismiss completion (before slash dropdown handling) |
| Any other key | Dismiss + debounce re-triggers |

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| Create | `electron/services/completion-service.ts` | FIM API client via raw fetch |
| Create | `src/hooks/use-inline-completion.ts` | Debounce, cancel, ghost text state |
| Create | `src/routes/settings/autocomplete.tsx` | Settings page for autocomplete config |
| Modify | `src/features/common/ui-prompt-textarea/index.tsx` | Add overlay div + hook integration |
| Modify | `electron/ipc/handlers.ts` | Add `completion:complete` handler |
| Modify | `electron/preload.ts` | Expose `completion:complete` to renderer |
| Modify | `src/lib/api.ts` | Add completion API type |
| Modify | `src/routes/settings/route.tsx` | Add Autocomplete tab to settings nav |
