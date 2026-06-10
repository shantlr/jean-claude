import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { dbg } from '../lib/debug';
import { buildSkillMd } from '../lib/skill-frontmatter';

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
- Every node must include name, summary, key_files, and children.
- Leaf nodes must use an empty children array.
- Write valid YAML only to requested output file. Do not write markdown around YAML.
- If existing feature map context is available, improve it rather than starting from scratch. Follow the iteration workflow below.

Iteration workflow (when existing feature map provided):
- Read the existing feature map YAML first. Understand current tree structure and depth.
- Determine iteration intent from user prompt:
  - "go deeper" / "expand" / "improve" with no target → scan entire tree for shallow nodes (leaves or single-child nodes whose key_files suggest more children exist). Expand those.
  - "expand X" / "go deeper on X" → locate node X in tree, spawn focused subagent to explore only that subtree deeper.
  - "find missing" / "audit" / "what's missing" → run coverage checklist against existing tree, report gaps, then fill them.
  - "update" / "refresh" → diff current codebase against existing map. Find new routes/components/features not in map. Add them without disturbing existing accurate nodes.
- Shallow node detection: A node is "shallow" when it has 0-1 children BUT its key_files reference components/routes/stores that contain multiple user-facing concepts. Flag these for expansion.
- Preserve existing accurate nodes. Only modify nodes that need deeper children, updated key_files, or corrected summaries.
- When expanding a node, read its key_files to discover concrete children before guessing. Code is ground truth.
- After expansion, verify no duplicate nodes were created (same user concept at different tree locations).
- Output the complete updated YAML, not just the changed subtree.

Subagent prompt pattern (fresh mapping):
- "Map only <root feature>. Return exhaustive user-facing subtree with name, summary, key_files, children. Search routes/components/stores/hooks/services tied to this feature. Include variants, states, actions, rails, menus, tabs, badges, and workflow branches. Avoid implementation-only nodes."

Subagent prompt pattern (expanding existing node):
- "Here is the current subtree for <node name>: <paste YAML>. Expand it deeper. Read the key_files to find concrete children this node is missing. Add variants, states, actions, tabs, menus, badges, and workflow branches found in code. Preserve existing accurate children. Return updated subtree YAML."

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
