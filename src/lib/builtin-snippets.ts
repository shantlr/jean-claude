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
    <test_case id="{{this.id}}" title="{{this.title}}">
{{#if this.steps}}
{{#each this.steps}}
      <step>
        <action>{{this.action}}</action>
        <expected_result>{{this.expectedResult}}</expected_result>
      </step>
{{/each}}
{{/if}}
    </test_case>
{{/each}}
  </test_cases>
{{/if}}
</work_item>

{{/each}}
For each work item, produce a recap with:
- MATCH: requirements that are correctly implemented
- MISMATCH: requirements that are missing or incorrectly implemented
- NOT TESTED: test cases that could not be verified

End with the following summary tables:

**Results per User Story:**
| Work Item | Title | Status | Mismatches |
|-----------|-------|--------|------------|
(one row per work item — Status is ✅ PASS, ⚠️ PARTIAL, or ❌ FAIL)

{{#if (any workItems "testCases")}}
**Results per Test Case:**
| Work Item | Test Case | Status | Notes |
|-----------|-----------|--------|-------|
(one row per test case — Status is ✅ PASS, ❌ FAIL, or ⬚ NOT TESTED. Notes = brief reason when not PASS)
{{/if}}`,
    enabled: true,
    contexts: { newTask: true, newTaskStep: true },
    autocomplete: { enabled: false, slugs: [] },
  },
];

export const BUILTIN_SNIPPET_IDS = new Set(BUILTIN_SNIPPETS.map((s) => s.id));

export function isBuiltinSnippet(id: string): boolean {
  return BUILTIN_SNIPPET_IDS.has(id);
}
