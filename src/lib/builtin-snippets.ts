import type { PromptSnippet } from '@shared/types';

export const BUILTIN_SNIPPETS: PromptSnippet[] = [
  {
    id: 'builtin-verify-implementation',
    name: 'Verify Implementation',
    description:
      'Assert implementation matches work item requirements and test cases',
    template: `Verify that the current implementation correctly satisfies the requirements described in the following work items.

{{#each workItems}}
<work_item id="{{this.id}}">
  <title>{{this.title}}</title>
{{#if this.description}}
  <expected_behavior>
    {{this.description}}
  </expected_behavior>
{{/if}}
{{#if this.testCases}}
  <test_cases>
{{#each this.testCases}}
    - {{this}}
{{/each}}
  </test_cases>
{{/if}}
</work_item>

{{/each}}
For each work item, produce a recap with:
- MATCH: requirements that are correctly implemented
- MISMATCH: requirements that are missing or incorrectly implemented
- NOT TESTED: test cases that could not be verified

End with a summary table:
| Work Item | Status | Mismatches |
|-----------|--------|------------|`,
    enabled: true,
    contexts: { newTask: true, newTaskStep: true },
    autocomplete: { enabled: false, slugs: [] },
  },
];

export const BUILTIN_SNIPPET_IDS = new Set(BUILTIN_SNIPPETS.map((s) => s.id));

export function isBuiltinSnippet(id: string): boolean {
  return BUILTIN_SNIPPET_IDS.has(id);
}
