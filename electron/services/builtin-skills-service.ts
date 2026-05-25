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
