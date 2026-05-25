import { describe, expect, it } from 'vitest';

import { parseUnifiedPatchToStrings } from './diff-utils';

describe('parseUnifiedPatchToStrings', () => {
  it('parses opencode Index-style deletion patches', () => {
    expect(
      parseUnifiedPatchToStrings(`Index: /tmp/example.md
===================================================================
--- /tmp/example.md
+++ /tmp/example.md
@@ -1,3 +0,0 @@
-- [fix] [settings]
-  - Fixed dropdown positioning
-<<<<<<< Updated upstream`),
    ).toEqual({
      oldString:
        '- [fix] [settings]\n  - Fixed dropdown positioning\n<<<<<<< Updated upstream',
      newString: '',
    });
  });

  it('parses opencode Index-style addition patches', () => {
    expect(
      parseUnifiedPatchToStrings(`Index: /tmp/example.md
===================================================================
--- /tmp/example.md
+++ /tmp/example.md
@@ -0,0 +1,2 @@
+- [feature] [meetings]
+  - Added Open Teams Call button`),
    ).toEqual({
      oldString: '',
      newString: '- [feature] [meetings]\n  - Added Open Teams Call button',
    });
  });

  it('ignores file headers in standard git patches', () => {
    expect(
      parseUnifiedPatchToStrings(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;`),
    ).toEqual({
      oldString: 'const a = 1;\nconst b = 2;',
      newString: 'const a = 1;\nconst b = 3;',
    });
  });

  it('parses repeated patch blocks joined by the message stream separator', () => {
    expect(
      parseUnifiedPatchToStrings(`Index: /tmp/example.md
===================================================================
--- /tmp/example.md
+++ /tmp/example.md
@@ -1 +0,0 @@
-old

⋯

Index: /tmp/example.md
===================================================================
--- /tmp/example.md
+++ /tmp/example.md
@@ -0,0 +1 @@
+new`),
    ).toEqual({
      oldString: 'old',
      newString: 'new',
    });
  });

  it('pairs full-file deletion and addition blocks without separators', () => {
    expect(
      parseUnifiedPatchToStrings(`Index: /tmp/diff-utils.test.ts
===================================================================
--- /tmp/diff-utils.test.ts
+++ /tmp/diff-utils.test.ts
@@ -1,4 +0,0 @@
-import { describe, expect, it } from 'vitest';
-describe('parseUnifiedPatchToStrings', () => {
-  it('old test', () => {});
-});

⋯

Index: /tmp/diff-utils.test.ts
===================================================================
--- /tmp/diff-utils.test.ts
+++ /tmp/diff-utils.test.ts
@@ -0,0 +1,5 @@
+import { describe, expect, it } from 'vitest';
+describe('parseUnifiedPatchToStrings', () => {
+  it('old test', () => {});
+  it('new test', () => {});
+});`),
    ).toEqual({
      oldString:
        "import { describe, expect, it } from 'vitest';\ndescribe('parseUnifiedPatchToStrings', () => {\n  it('old test', () => {});\n});",
      newString:
        "import { describe, expect, it } from 'vitest';\ndescribe('parseUnifiedPatchToStrings', () => {\n  it('old test', () => {});\n  it('new test', () => {});\n});",
    });
  });

  it('applies add-file then edit-file patch history as one final file', () => {
    expect(
      parseUnifiedPatchToStrings(`Index: /tmp/diff-utils.test.ts
===================================================================
--- /tmp/diff-utils.test.ts
+++ /tmp/diff-utils.test.ts
@@ -0,0 +1,3 @@
+import { describe, expect, it } from 'vitest';
+describe('parseUnifiedPatchToStrings', () => {
+});

⋯

Index: /tmp/diff-utils.test.ts
===================================================================
--- /tmp/diff-utils.test.ts
+++ /tmp/diff-utils.test.ts
@@ -1,3 +1,4 @@
 import { describe, expect, it } from 'vitest';
 describe('parseUnifiedPatchToStrings', () => {
+  it('parses nested diff samples', () => {});
 });`),
    ).toEqual({
      oldString: '',
      newString:
        "import { describe, expect, it } from 'vitest';\ndescribe('parseUnifiedPatchToStrings', () => {\n  it('parses nested diff samples', () => {});\n});",
    });
  });

  it('does not add a leading separator after add-only first hunks', () => {
    expect(
      parseUnifiedPatchToStrings(`Index: /tmp/example.ts
===================================================================
--- /tmp/example.ts
+++ /tmp/example.ts
@@ -0,0 +1 @@
+first

⋯

Index: /tmp/example.ts
===================================================================
--- /tmp/example.ts
+++ /tmp/example.ts
@@ -10,0 +11 @@
+second`),
    ).toEqual({
      oldString: '',
      newString: 'first\nsecond',
    });
  });

  it('keeps nested patch samples as added content', () => {
    expect(
      parseUnifiedPatchToStrings(`Index: /tmp/diff-utils.test.ts
===================================================================
--- /tmp/diff-utils.test.ts
+++ /tmp/diff-utils.test.ts
@@ -0,0 +1,5 @@
+      parseUnifiedPatchToStrings(\`Index: /tmp/example.md
+--- /tmp/example.md
++++ /tmp/example.md
+@@ -0,0 +1,1 @@
++new\`),`),
    ).toEqual({
      oldString: '',
      newString:
        '      parseUnifiedPatchToStrings(`Index: /tmp/example.md\n--- /tmp/example.md\n+++ /tmp/example.md\n@@ -0,0 +1,1 @@\n+new`),',
    });
  });
});
