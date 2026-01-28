# Timeline Message Stream Design

## Overview

Rework the message stream from a chat-style layout to a compact vertical timeline. Each entry shows a brief summary with expandable details on click.

## Visual Structure

**Layout:**

- Left side: vertical line (thin, neutral-700) with dots at each entry
- Dots: small circles (8px) - purple for agent, blue for user
- Right side: compact content with action summary + expandable details

**Entry anatomy:**

```
● Read src/components/Button.tsx (142 lines)        [collapsed]
│
● Edited src/config.json (+3/-1 lines)              [collapsed]
│
● Let me check the configuration...                 [collapsed, agent text]
│
● You: Add error handling to the form               [user, blue dot, subtle bg]
```

**Spacing:** Tight vertical rhythm (8-12px between entries).

**Expanded state:** Clicking an entry expands it inline, pushing entries below down. Shows full content (file contents, markdown, tool results).

## Entry Types & Summaries

**Tool entries:**

- `Read` → "Read `filename.tsx` (142 lines)"
- `Edit` → "Edited `filename.tsx` (+3/-1 lines)"
- `Write` → "Created `filename.tsx` (85 lines)"
- `Bash` → "Ran `npm install`" or "Ran command (exit 0)"
- `Grep` → "Searched for `pattern` (12 matches)"
- `Glob` → "Found files matching `**/*.ts` (24 files)"
- `Task` → "Launched agent: description"
- `WebFetch` → "Fetched `url`"
- Other tools → "Used `ToolName`"

**Text entries (agent thinking/responses):**

- First ~60 chars of text, truncated with "..."
- e.g., "Let me check the configuration file to understand..."

**User entries:**

- Their prompt text, truncated if long
- Blue dot, subtle background tint to distinguish

**Result entry (session complete):**

- "Session complete ($0.0234, 12.3s)"
- Expandable to show full result summary

## Interaction & Expansion

**Collapsed state (default):**

- Single line per entry
- Cursor: pointer to indicate clickable
- Subtle hover state (slightly lighter background)

**Expanded state:**

- Clicking toggles expansion
- Content appears below the summary line, indented to align with text (past the dot/line)
- For tools: shows full input/output (file contents, command output, etc.)
- For text: shows full markdown-rendered content
- For user: shows full prompt

**Visual indicator:**

- Small chevron (right when collapsed, down when expanded) on the right side

**Auto-scroll behavior:**

- Keep existing logic: auto-scroll to bottom when near bottom, respect user scroll position otherwise

## Component Structure

**Files to modify:**

- `src/features/agent/ui-message-stream/index.tsx` - Replace chat layout with timeline layout
- `src/features/agent/ui-agent-message/index.tsx` - Replace with new `ui-timeline-entry/` component

**New structure:**

```
ui-message-stream/
  index.tsx              # Timeline container (vertical line, scroll, auto-scroll logic)

ui-timeline-entry/
  index.tsx              # Single entry (dot, summary, expandable content)
  tool-summary.tsx       # Helper to generate summary text for each tool type
```

**Key changes:**

- Remove avatar circles, "You"/"Claude" labels
- Add vertical line + dots
- Add expand/collapse state per entry
- Add summary text generation for tools
- Tighten spacing significantly
