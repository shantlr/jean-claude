# Skills Editor UX Redesign

## Problem

The current skills settings edit experience is cramped and unfriendly:
- The right pane is fixed at 384px (`w-96`) — too narrow for writing markdown
- The textarea is limited to 16 rows
- No markdown preview while editing
- The same narrow pane is used for both viewing and editing

## Design

### New UX Flow

**Card Grid → Click card → Preview pane (read-only) → Edit button → Full-page editor**

1. **Skills list page** (simplified current view): Card grid remains unchanged. Clicking a card opens a **preview pane** on the right showing rendered markdown content. No inline editing.

2. **Full-page editor** (new): Replaces the entire skills settings content area when editing. Contains:
   - Top bar with back button, skill name, Save/Cancel
   - Metadata fields (name, description, backend checkboxes)
   - Resizable split: markdown textarea (left) + live rendered preview (right)

3. **"Add" button**: Goes straight to the full-page editor in create mode.

### Preview Pane (Right Side)

The existing `w-96` right pane becomes **read-only only**:

- Shows skill name, description, source/backend badges
- Renders skill content as **formatted markdown** using `MarkdownContent` component (replacing the current `<pre>` tag)
- **Edit button** (for editable skills) navigates to the full-page editor
- Delete button with confirmation stays here
- Backend enable/disable toggles stay here

### Full-Page Editor

Replaces the card grid + preview pane entirely when active.

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back    New Skill / Edit "my-skill"       Cancel   Save  │
├─────────────────────────────────────────────────────────────┤
│  Name: [______________]  Description: [________________]    │
│  Backends: [✓ Claude Code] [✓ OpenCode]  (create mode only) │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                   │
│   Markdown Editor        │   Live Preview                    │
│   (textarea, monospace)  │   (MarkdownContent component)     │
│                          │                                   │
│   # My Skill             │   My Skill                        │
│                          │   ─────────                       │
│   Use this when...       │   Use this when...                │
│                          │                                   │
│  (fills remaining height)│  (scrolls independently)          │
│                          │                                   │
└──────────────────────────┴──────────────────────────────────┘
```

- **Resizable split**: Uses existing `useHorizontalResize` hook. Default 50/50, min ~30% each side.
- **Live preview**: Debounced ~300ms, uses existing `MarkdownContent` component with `remark-gfm` and `shiki` highlighting.
- **Textarea**: Full-height, `font-mono`, no row limit.
- **Unsaved changes**: Confirm dialog when clicking Back with unsaved changes.

### Components Affected

| Component | Change |
|-----------|--------|
| `ui-skills-settings/index.tsx` | Add `editingSkillPath` state to toggle between list and editor views |
| `ui-skills-settings/skill-details.tsx` | Replace `<pre>` with `MarkdownContent`, add Edit button |
| `ui-skills-settings/skill-form.tsx` | Remove (replaced by new full-page editor) |
| `ui-skills-settings/skill-editor.tsx` | **New** — full-page editor with split preview |
| `ui-project-skills-settings/index.tsx` | Same pattern: preview pane + full-page editor |

### Reused Infrastructure

- `MarkdownContent` from `src/features/agent/ui-markdown-content/`
- `useHorizontalResize` from `src/hooks/use-horizontal-resize.ts`
- `useSkillContent`, `useCreateSkill`, `useUpdateSkill` from `src/hooks/use-managed-skills.ts`
