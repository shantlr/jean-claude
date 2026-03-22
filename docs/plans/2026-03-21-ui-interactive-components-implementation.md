# UI Interactive Components Uniformization - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a unified design system for interactive UI components (Button, IconButton, Input, Textarea, Checkbox, Select) with consistent sizing and migrate all ~75 files to use them.

**Architecture:** Rework existing `src/common/ui/button/` and `src/common/ui/select/`, create new `icon-button/`, `input/`, `textarea/`, `checkbox/` components. All share a 3-tier sizing system (sm/md/lg). Then migrate all feature files from inline Tailwind to the new component props.

**Tech Stack:** React, TypeScript, Tailwind CSS, clsx

---

### Task 1: Create shared size/variant constants

**Files:**
- Create: `src/common/ui/styles.ts`

Shared sizing and variant definitions used by all interactive components.

---

### Task 2: Rework Button component

**Files:**
- Modify: `src/common/ui/button/index.tsx`

Add `variant` (primary/secondary/ghost/danger, default: secondary) and `size` (sm/md/lg, default: md) props. Add `icon` prop for left icon. Keep existing async-loading behavior. Apply consistent sizing from the shared table.

---

### Task 3: Create IconButton component

**Files:**
- Create: `src/common/ui/icon-button/index.tsx`

Square icon-only button with same variants as Button. Default variant: ghost. Integrates with Tooltip for optional tooltip prop.

---

### Task 4: Create Input component

**Files:**
- Create: `src/common/ui/input/index.tsx`

Text input with `size`, `icon` (left icon), `error` props. Uses forwardRef. Consistent sizing.

---

### Task 5: Create Textarea component

**Files:**
- Create: `src/common/ui/textarea/index.tsx`

Multiline input with `size`, `error` props. Height via `rows`. Uses forwardRef.

---

### Task 6: Create Checkbox component

**Files:**
- Create: `src/common/ui/checkbox/index.tsx`

Checkbox with `size`, `checked`, `onChange`, `label`, `description`, `disabled` props.

---

### Task 7: Add size prop to Select component

**Files:**
- Modify: `src/common/ui/select/index.tsx`

Add `size` prop (default: md). Scale trigger button and dropdown items according to size table.

---

### Task 8-15: Migrate all feature files

Migrate all ~75 files from inline Tailwind classes to use the new components with variant/size props. Grouped by feature area:

- Task 8: Agent features (~10 files)
- Task 9: Task features (~15 files)
- Task 10: Settings features (~11 files)
- Task 11: Skills settings features (~6 files)
- Task 12: MCP settings + tokens features (~6 files)
- Task 13: Project features (~7 files)
- Task 14: Layout, routes, new-task, pull-request features (~10 files)
- Task 15: Remaining features (pipelines, notifications, feed, command-palette, common)

---

### Task 16: Lint and type-check

Run `pnpm lint --fix` and `pnpm ts-check` to verify everything compiles.
