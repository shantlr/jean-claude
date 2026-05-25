import { describe, expect, it } from 'vitest';

import { compileForOpenCode } from './permission-settings-service';

describe('compileForOpenCode', () => {
  it('adds an ask baseline before explicit rules', () => {
    expect(
      compileForOpenCode([
        { tool: 'bash', pattern: 'git status*', action: 'allow' },
      ]),
    ).toEqual([
      { permission: '*', pattern: '*', action: 'ask' },
      { permission: 'bash', pattern: 'git status*', action: 'allow' },
    ]);
  });

  it('uses ask baseline when no rules are configured', () => {
    expect(compileForOpenCode([])).toEqual([
      { permission: '*', pattern: '*', action: 'ask' },
    ]);
  });
});
