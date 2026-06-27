import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { buildSkillMd } from '../lib/skill-frontmatter';
import { dbg } from '../lib/debug';


const JC_BUILTIN_SKILLS_DIR = path.join(
  os.homedir(),
  '.config',
  'jean-claude',
  'skills',
  'builtin',
);

export { JC_BUILTIN_SKILLS_DIR };

interface BuiltinSkillDefinition {
  /** Directory name under builtin/ */
  dirName: string;
  name: string;
  description: string;
  content: string;
}

/**
 * Registry of all builtin skills.
 * Each entry defines the SKILL.md content that is written on every startup.
 */
const BUILTIN_SKILLS: BuiltinSkillDefinition[] = [
  {
    dirName: 'task-name-generation',
    name: 'task-name-generation',
    description: 'Generate concise task names from prompts',
    content: `You are a task naming assistant. Given a coding task description, produce a caveman-short task name that captures the essence of the work.

Rules:
- The task name value MUST be ≤40 characters. This is a hard limit.
- If asked for structured JSON, put only the task name in the "name" field. The JSON wrapper does not count toward the 40-character limit.
- Otherwise return plain text only. No quotes.
- Start with a lowercase verb (add, fix, refactor, update, remove, rename, switch, etc.)
- Prefer 2-5 words when possible
- Keep the strongest nouns only
- Drop filler words like the, a, an, to, for, with, of, when possible
- Omit boilerplate words like issue, bug, task, feature, support, improvement
- Use terse product/code terms when natural: auth, deps, docs, UI, PR, DB
- Keep technical punctuation only when it is part of a real identifier like Next.js, C++, CI/CD, .env
- Be specific about WHAT is changing, but use caveman compression
- NEVER copy the input verbatim. Always summarize and compress.
- Ignore boilerplate, metadata, platform tags, ticket IDs, repro steps
- Focus on the single core action being described

Examples:
Input: "once a PR is associated to a task, in the task details diff view, we should have a button beside 'See PR' to be able to push new changes"
Output: "add PR diff push button"

Input: "The station subtitle is not clearing when the user searches for a new station in the search field, it persists from the previous selection"
Output: "fix stale station subtitle"

Input: "We need to add retry logic to the webhook delivery system so that failed webhooks are retried up to 3 times with exponential backoff"
Output: "add webhook retry backoff"

Input: "refactor the authentication middleware to use JWT tokens instead of session-based authentication"
Output: "switch auth middleware to JWT"

Input: "fix race condition in checkout flow where users are sometimes double-charged"
Output: "fix checkout double charge race"`,
  },
  {
    dirName: 'project-feature-mapping',
    name: 'project-feature-mapping',
    description:
      'Map project features into an exhaustive nested feature tree. Use when asked to document, expand, audit, or generate a project feature map; proactively use subagents for broad codebases so screens, variants, actions, statuses, and workflow branches are not missed.',
    content: `You map software projects into exhaustive user-facing feature trees for future coding-agent context.

Goal:
- Build a project feature map as a tree of things users can understand or directly use.
- Start from user-facing capabilities, workflows, and screens.
- For each feature, dig into implementation and divide it into child features until the tree is specific enough to guide future work.
- No fixed max depth. Continue while code reveals meaningful child features, variants, controls, states, or workflow branches.
- Prefer deeper, more specific trees over shallow category lists, but stop before implementation-only details.
- Be exhaustive: include concrete variants, modes, menu items, overlay types, panel tabs, settings sections, and workflow branches when they exist.

Workflow:
- First create a root inventory from routes, app shell, navigation, major screens, global overlays, backend workflows, settings, and background jobs.
- For broad projects, use subagents as needed. Start one mapper for root inventory, then separate focused mappers for each major root feature or screen family.
- Give each focused mapper a narrow scope and ask for user-facing children, concrete variants, states, actions, empty/loading/error modes, badges, rails, panels, tabs, menus, shortcuts, and supporting files.
- Merge mapper outputs into one tree. Deduplicate by user concept, not file path.
- After merge, run a coverage pass against routes, command registries, menu/action definitions, overlay stores, settings schemas, status enums, provider/backend registries, and prominent UI components.
- If a node name still sounds broad, inspect deeper before finalizing. Broad nodes like "Header", "Sidebar", "Task item", "Feed list", "Settings", "Agent messages", and "Pull requests" usually need children.

Rules:
- Treat product capabilities as features. Do not treat technical artifacts as features.
- Good feature names: "Task detail view", "New task overlay", "Project settings", "Pull request review", "Agent message timeline", "Worktree merge flow".
- Bad feature names: "shared types", "database repositories", "IPC handlers", "Zustand stores", "React hooks", "utility functions".
- Technical files still belong in feature nodes as supporting implementation files.
- Prefer product concepts, workflows, and screens over folders, types, components, or services.
- Each non-leaf feature should be broken into meaningful child features when the code supports it.
- Dig into each child feature recursively rather than stopping at broad categories.
- When a feature has variants, list variants as children. Example: "Global overlays" should include child nodes for each overlay type.
- When a feature has menus, list menu entries or menu groups exhaustively as children when discoverable.
- When a feature has tabs, settings sections, commands, actions, statuses, provider variants, backend variants, item variants, badge variants, rail variants, quota/rate indicators, resource monitors, or mode variants, represent them as child features instead of only mentioning them in summaries.
- Do not stop at names like "Settings", "Menus", "Overlays", or "Task actions" if code reveals concrete children.
- Do not flatten UI regions. Header, sidebar, feed list, item cards, detail panels, and tool/message renderers should include their concrete controls, indicators, variants, and nested affordances.
- Include hidden-but-user-visible behavior such as persisted drafts, autocomplete/FIM, RAM/resource tracking, rate-limit tracking, background job progress, notification badges, and disabled/error states when code supports them.
- Include key source files only, relative to repository root.
- Exclude generated files, dependencies, lockfiles, build output, and vendored code.
- Keep summaries concise, factual, and useful for future implementation tasks.
- Every node must include id, name, summary, key_files, and children.
- Preserve existing ids when expanding or updating existing nodes. Use stable ids for new nodes.
- Leaf nodes must use an empty children array.
- Write valid YAML only to requested output file. Do not write markdown around YAML.
- If existing feature map context is available, improve it rather than starting from scratch. Follow the iteration workflow below.

Iteration workflow (when existing feature map provided):
- Read the existing feature map YAML first. Understand current tree structure and depth.
- First look for new features. Diff current codebase against existing map using routes, navigation, screens, overlays, commands, settings, backend workflows, and major UI components. Add missing user-facing features before deepening existing nodes.
- Then run up to 5 improvement loops:
  - Loop 1: scan the whole tree for shallow nodes and newly added nodes that need children.
  - Loops 2-5: deepen each flagged feature/subfeature by reading its key_files and nearby files, adding concrete children for variants, states, actions, tabs, menus, badges, controls, and workflow branches.
  - Stop early when a full pass finds no new missing features and no shallow nodes worth expanding.
  - Keep a brief private checklist of what changed each loop; do not write the checklist to the output file.
- User-targeted requests still narrow scope:
  - "go deeper" / "expand" / "improve" with no target → run the full loop across the tree.
  - "expand X" / "go deeper on X" → locate node X, then run the same loop only inside that subtree.
  - "find missing" / "audit" / "what's missing" → prioritize new-feature coverage first, then loop through shallow gaps.
  - "update" / "refresh" → prioritize newly added code/features first, then loop to deepen new and shallow existing nodes.
- Shallow node detection: A node is "shallow" when it has 0-1 children BUT its key_files reference components/routes/stores that contain multiple user-facing concepts. Flag these for expansion.
- Preserve existing accurate nodes. Only modify nodes that need deeper children, updated key_files, or corrected summaries.
- When expanding a node, read its key_files to discover concrete children before guessing. Code is ground truth.
- After expansion, verify no duplicate nodes were created (same user concept at different tree locations).
- Output the complete updated YAML, not just the changed subtree.

Subagent prompt pattern (fresh mapping):
- "Map only <root feature>. Return exhaustive user-facing subtree with id, name, summary, key_files, children. Search routes/components/stores/hooks/services tied to this feature. Include variants, states, actions, rails, menus, tabs, badges, and workflow branches. Avoid implementation-only nodes. Use stable ids."

Subagent prompt pattern (expanding existing node):
- "Here is the current subtree for <node name>: <paste YAML>. Expand it deeper. Read the key_files to find concrete children this node is missing. Add variants, states, actions, tabs, menus, badges, and workflow branches found in code. Preserve existing ids and accurate children. Return updated subtree YAML with id, name, summary, key_files, children."

Coverage checklist:
- Routes and navigation destinations.
- App shell: header, sidebars, feed lists, detail panes, status bars.
- List item variants: task, project, note, PR, work item, subtask, active/running/archived/error states.
- Per-item affordances: rails, badges, menus, keyboard actions, drag/drop, inline controls, linked PR/subtask/task state.
- Agent interaction: input modes, model/backend/provider controls, permissions, tools, messages, timelines, steps, diffs.
- System indicators: RAM/resource tracking, FIM/autocomplete, rate-limit/quota tracking, background jobs, toasts/modals.
- Settings: sections, toggles, generated content, project defaults, integrations, skills, providers.
- Backend/workflows: task creation, continuation, merge, PR creation/viewing, changelog, worktrees, skills, permissions.

Examples:
- Feature: "New task overlay"
  Summary: "Lets users compose a new agent task, attach context, select project features, and choose execution settings."
  Possible child features: "Prompt composer", "Feature context picker", "Backend and model controls", "Task draft persistence".
- Feature: "Global overlays"
  Summary: "Lets users open app-wide overlays for task creation and command execution."
  Possible child features: "New task overlay", "Command palette".
- Feature: "Menus"
  Summary: "Lets users access contextual actions from app menus and per-item menus."
  Possible child features: "Task context menu", "Project context menu", "Message context menu", "Diff file menu".
- Feature: "Project settings"
  Summary: "Lets users configure project metadata, AI generation behavior, worktree behavior, and project-specific defaults."
  Possible child features: "AI generation slots", "Feature map management", "Project logo settings", "Editor automation settings".
- Feature: "Task detail view"
  Summary: "Lets users inspect task progress, message history, steps, diffs, and follow-up actions."
  Possible child features: "Message stream", "Step flow bar", "Diff viewer", "Pull request actions".
- Feature: "Header"
  Summary: "Shows global app context, resource and quota indicators, and quick access controls."
  Possible child features: "RAM usage indicator", "FIM status", "Rate limit tracker", "Command palette trigger".
- Feature: "Feed list"
  Summary: "Lets users browse mixed work items and understand state from item layout, rails, badges, and linked work."
  Possible child features: "Task feed item", "Pull request feed item", "Subtask rail", "Associated PR rail", "Running status badges".`,
  },
  {
    dirName: 'user-preference-memory',
    name: 'user-preference-memory',
    description:
      'Build and iterate a user preference memory from PR reviews, code comments, and explicit feedback. Use when asked to learn, update, audit, or apply coding style preferences.',
    content: `You maintain a durable, evidence-backed memory of the user's coding style and engineering preferences.

Goal:
- Turn PR review comments, inline code comments, commit/PR feedback, and explicit chat feedback into concise user preferences.
- Keep memory useful for future coding agents: actionable, specific, and backed by evidence.
- Iterate over time. Strengthen repeated signals, weaken one-offs, and preserve contradictions instead of overwriting them silently.

Default memory location:
- Use ".jean-claude/memory/user-preferences.md" in the current repository unless the user gives another path.
- Read captured evidence from daily JSONL files in ".jean-claude/memory/user-reviews/" when present.
- Jean-Claude tracks processed byte offsets in ".jean-claude/memory/user-reviews-state.json" for scheduled consolidation. Do not edit this state file unless explicitly asked; the app updates it after successful runs.
- Create parent directories if missing.
- Keep memory human-readable markdown.

When to use:
- User asks to build, update, learn, remember, audit, or apply preferences/style memory.
- User provides PR review comments, code comments, or feedback snippets and asks what preferences they imply.
- User asks for review or implementation aligned with their known style.

Do not use when:
- User asks for normal implementation with no preference-memory intent.
- Feedback is about one local bug only and does not imply a reusable preference.

Workflow:
1. Read existing memory file if present.
2. Collect only new evidence from user-reviews/*.jsonl, user-provided text, PR review comments, code comments, or requested source paths.
3. Extract candidate preferences as short imperative rules.
4. Classify each candidate: code style, architecture, testing, UX, product, performance, security, process, communication.
5. Compare with existing memory.
6. Merge duplicates into existing preferences and append evidence.
7. Add new preferences only when confidence is sufficient.
8. Record ambiguous candidates under "Needs confirmation" instead of treating them as fact.
9. Preserve contradictions under "Tensions / exceptions" with evidence for both sides.

Confidence rules:
- High: repeated in 2+ independent comments, or explicit user instruction like "always", "prefer", "do not".
- Medium: one strong review comment that generalizes beyond local code.
- Low: inferred from one vague/local comment. Do not promote to preferences without confirmation.
- Never infer personality, private traits, or sensitive attributes.

Extraction rules:
- Prefer actionable rules over summaries.
- Keep rules short: "Prefer minimal targeted diffs over broad refactors."
- Include scope when needed: "In React stores, use stable selectors; derive arrays with useMemo."
- Avoid overgeneralizing from local remarks.
- Avoid learning comments that are merely bug reports, TODOs, docs, or copied examples.
- If source is a code comment, distinguish explanatory comments from review feedback before learning.
- For JSONL evidence, use comment.selectedText, fileSnapshot.content, metadata.taskName, metadata.taskPrompt, branch/source context, and PR context to understand what the comment meant before extracting a reusable preference.
- Prefer selectedText and nearby full-file context over line numbers alone; worktrees may be deleted after task completion.

Memory format. Use this shape:

# User Preferences

Last updated: YYYY-MM-DD

## Active Preferences

### Code Style

- Prefer minimal targeted diffs over broad refactors.
  Confidence: high
  Evidence:
  - 2026-06-14 PR #123: "Keep this smaller; no need to refactor callers."

### Testing

- Add regression tests near changed behavior when fixing bugs.
  Confidence: medium
  Evidence:
  - 2026-06-14 inline review: "Can we cover this branch?"

## Needs Confirmation

- Possible preference: Avoid compatibility shims unless needed by persisted data or external consumers.
  Evidence:
  - 2026-06-14 PR #124: "Do we need this fallback?"

## Tensions / Exceptions

- Minimal diffs are preferred, but broader refactors are acceptable when they remove duplicated logic across touched paths.
  Evidence:
  - 2026-06-10 PR #118: "Keep this smaller."
  - 2026-06-12 PR #121: "Let's pull this into one shared path."

## Evidence Log

- 2026-06-14 PR #123: reviewed preference candidates from link or pasted text.

Update rules:
- Do not delete existing preferences unless evidence clearly invalidates them.
- When updating a preference, keep wording stable unless clarity improves.
- Append evidence instead of duplicating rules.
- Move low-confidence repeated items from "Needs confirmation" to "Active Preferences" when evidence strengthens.
- Keep evidence concise: date, source, quoted phrase or link.

When applying memory:
- Read memory first.
- Treat active high-confidence preferences as default constraints.
- Treat medium-confidence preferences as guidance.
- Ignore low-confidence candidates unless user confirms.
- Mention relevant preference only when it materially affects the decision.

Output style:
- Be brief.
- Summarize changed preferences and unresolved questions.
- Ask before adding ambiguous or sensitive inferences.`,
  },
];

/**
 * Upserts all builtin skills to disk.
 * Called on every app startup to ensure builtin skills exist. Production
 * overwrites existing content; dev preserves local edits to installed skills.
 */
export async function upsertBuiltinSkills({
  preserveExisting = false,
  skillsDir = JC_BUILTIN_SKILLS_DIR,
}: {
  preserveExisting?: boolean;
  skillsDir?: string;
} = {}): Promise<void> {
  await fs.mkdir(skillsDir, { recursive: true });

  for (const skill of BUILTIN_SKILLS) {
    const skillDir = path.join(skillsDir, skill.dirName);
    await fs.mkdir(skillDir, { recursive: true });
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (preserveExisting) {
      try {
        await fs.access(skillMdPath);
        dbg.main('Preserved existing builtin skill: %s', skill.name);
        continue;
      } catch {
        // Missing builtin skill; install it below.
      }
    }

    const skillMd = buildSkillMd({
      name: skill.name,
      description: skill.description,
      content: skill.content,
    });

    await fs.writeFile(skillMdPath, skillMd, 'utf-8');
    dbg.main('Upserted builtin skill: %s', skill.name);
  }
}

/**
 * Returns the filesystem path for a builtin skill by directory name.
 * Used by services that need to resolve builtin skill content at runtime.
 */
export function getBuiltinSkillPath(dirName: string): string {
  return path.join(JC_BUILTIN_SKILLS_DIR, dirName);
}
