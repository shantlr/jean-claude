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
    description: 'Map project features into a nested feature tree',
    content: `You map software projects into exhaustive user-facing feature trees for future coding-agent context.

Goal:
- Build a project feature map as a tree of things users can understand or directly use.
- Start from user-facing capabilities, workflows, and screens.
- For each feature, dig into implementation and divide it into child features until the tree is specific enough to guide future work.
- Use up to 4 total levels deep.
- Prefer deeper, more specific trees over shallow category lists.
- Be exhaustive: include concrete variants, modes, menu items, overlay types, panel tabs, settings sections, and workflow branches when they exist.

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
- When a feature has tabs, settings sections, commands, actions, statuses, provider variants, backend variants, or mode variants, represent them as child features instead of only mentioning them in summaries.
- Do not stop at names like "Settings", "Menus", "Overlays", or "Task actions" if code reveals concrete children.
- Include key source files only, relative to repository root.
- Exclude generated files, dependencies, lockfiles, build output, and vendored code.
- Keep summaries concise, factual, and useful for future implementation tasks.
- Every node must include name, summary, key_files, and children.
- Leaf nodes must use an empty children array.
- Write valid YAML only to requested output file. Do not write markdown around YAML.
- If existing feature map context is available, improve it rather than starting from scratch.

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
  Possible child features: "Message stream", "Step flow bar", "Diff viewer", "Pull request actions".`,
  },
];

/**
 * Upserts all builtin skills to disk.
 * Called on every app startup to ensure builtin skills exist and are not
 * modified by the user. Overwrites any existing content.
 */
export async function upsertBuiltinSkills(): Promise<void> {
  await fs.mkdir(JC_BUILTIN_SKILLS_DIR, { recursive: true });

  for (const skill of BUILTIN_SKILLS) {
    const skillDir = path.join(JC_BUILTIN_SKILLS_DIR, skill.dirName);
    await fs.mkdir(skillDir, { recursive: true });

    const skillMd = buildSkillMd({
      name: skill.name,
      description: skill.description,
      content: skill.content,
    });

    await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
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
