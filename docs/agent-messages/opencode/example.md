# OpenCode

## Skill tool use

### Pending state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c62020942001sbTdXhLliBc9GE",
      "sessionID": "ses_39dfe072affenyBfFZvZcqWfb1",
      "messageID": "msg_c6201f907001uBfrpUDpoDOQF9",
      "type": "tool",
      "callID": "call_1Jusox2MF8xhwgEp7MhEVitE",
      "tool": "skill",
      "state": {
        "status": "pending",
        "input": {},
        "raw": ""
      }
    }
  }
}
```

### Running state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c62020942001sbTdXhLliBc9GE",
      "sessionID": "ses_39dfe072affenyBfFZvZcqWfb1",
      "messageID": "msg_c6201f907001uBfrpUDpoDOQF9",
      "type": "tool",
      "callID": "call_1Jusox2MF8xhwgEp7MhEVitE",
      "tool": "skill",
      "state": {
        "status": "running",
        "input": {
          "name": "brainstorming"
        },
        "time": { "start": 1771170826643 }
      },
      "metadata": { "openai": { "itemId": "fc_068a..." } }
    }
  }
}
```

### Completed state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c62020942001sbTdXhLliBc9GE",
      "sessionID": "ses_39dfe072affenyBfFZvZcqWfb1",
      "messageID": "msg_c6201f907001uBfrpUDpoDOQF9",
      "type": "tool",
      "callID": "call_1Jusox2MF8xhwgEp7MhEVitE",
      "tool": "skill",
      "state": {
        "status": "completed",
        "input": {
          "name": "brainstorming"
        },
        "output": "<skill_content name=\"brainstorming\">...</skill_content>",
        "title": "Loaded skill: brainstorming",
        "metadata": {
          "name": "brainstorming",
          "dir": "/Users/user/.config/opencode/skills/superpowers/brainstorming",
          "truncated": false
        },
        "time": { "start": 1771170826643, "end": 1771170826652 }
      },
      "metadata": { "openai": { "itemId": "fc_068a..." } }
    }
  }
}
```

## TodoWrite tool use

### Pending state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c62022874001s1JQb8pYEg9mhY",
      "sessionID": "ses_39dfe072affenyBfFZvZcqWfb1",
      "messageID": "msg_c62021bff001nAB6FjIiIULCX3",
      "type": "tool",
      "callID": "call_BJdCP90DFdzhtaDKuy6QwvpZ",
      "tool": "todowrite",
      "state": {
        "status": "pending",
        "input": {},
        "raw": ""
      }
    }
  }
}
```

### Running state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c62022874001s1JQb8pYEg9mhY",
      "sessionID": "ses_39dfe072affenyBfFZvZcqWfb1",
      "messageID": "msg_c62021bff001nAB6FjIiIULCX3",
      "type": "tool",
      "callID": "call_BJdCP90DFdzhtaDKuy6QwvpZ",
      "tool": "todowrite",
      "state": {
        "status": "running",
        "input": {
          "todos": [
            { "id": "t1", "content": "Locate command palette...", "status": "in_progress", "priority": "high" },
            { "id": "t2", "content": "Add/adjust test...", "status": "pending", "priority": "high" },
            { "id": "t3", "content": "Implement instant scroll...", "status": "pending", "priority": "high" },
            { "id": "t4", "content": "Run targeted tests...", "status": "pending", "priority": "medium" }
          ]
        },
        "time": { "start": 1771170835918 }
      },
      "metadata": { "openai": { "itemId": "fc_0325..." } }
    }
  }
}
```

### Completed state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c62022874001s1JQb8pYEg9mhY",
      "sessionID": "ses_39dfe072affenyBfFZvZcqWfb1",
      "messageID": "msg_c62021bff001nAB6FjIiIULCX3",
      "type": "tool",
      "callID": "call_BJdCP90DFdzhtaDKuy6QwvpZ",
      "tool": "todowrite",
      "state": {
        "status": "completed",
        "input": {
          "todos": [
            { "id": "t1", "content": "Locate command palette...", "status": "in_progress", "priority": "high" },
            { "id": "t2", "content": "Add/adjust test...", "status": "pending", "priority": "high" },
            { "id": "t3", "content": "Implement instant scroll...", "status": "pending", "priority": "high" },
            { "id": "t4", "content": "Run targeted tests...", "status": "pending", "priority": "medium" }
          ]
        },
        "output": "[\n  { \"id\": \"t1\", \"content\": \"Locate command palette...\", \"status\": \"in_progress\", \"priority\": \"high\" },\n  ...\n]",
        "title": "4 todos",
        "metadata": {
          "todos": [
            { "id": "t1", "content": "Locate command palette...", "status": "in_progress", "priority": "high" },
            { "id": "t2", "content": "Add/adjust test...", "status": "pending", "priority": "high" },
            { "id": "t3", "content": "Implement instant scroll...", "status": "pending", "priority": "high" },
            { "id": "t4", "content": "Run targeted tests...", "status": "pending", "priority": "medium" }
          ],
          "truncated": false
        },
        "time": { "start": 1771170835918, "end": 1771170835920 }
      },
      "metadata": { "openai": { "itemId": "fc_0325..." } }
    }
  }
}
```

### Key differences from Claude's TodoWrite

- OpenCode todos have `id` and `priority` fields (not present in Claude)
- OpenCode todos lack `activeForm` field (present in Claude)
- Tool name is lowercase `"todowrite"` (Claude uses `"TodoWrite"`)
- Completed state has `metadata.todos` array with the same data as `input.todos`

## Read tool use

**Note:** OpenCode uses camelCase `filePath` in its input (not snake_case `file_path`).
The pending state has an empty `input: {}` — the `filePath` only appears in the running/completed states.

### Pending state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c62dff6c1001lZ3JMdkuStoPBL",
      "sessionID": "ses_39d204e49ffe35va87N9z2RBbs",
      "messageID": "msg_c62dfefc4001ljVRKHjzhPsfwM",
      "type": "tool",
      "callID": "call_DmmuMle1kuwXYEKJDcGYDSFs",
      "tool": "read",
      "state": {
        "status": "pending",
        "input": {},
        "raw": ""
      }
    }
  }
}
```

### Running state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c62dff6c1001lZ3JMdkuStoPBL",
      "sessionID": "ses_39d204e49ffe35va87N9z2RBbs",
      "messageID": "msg_c62dfefc4001ljVRKHjzhPsfwM",
      "type": "tool",
      "callID": "call_DmmuMle1kuwXYEKJDcGYDSFs",
      "tool": "read",
      "state": {
        "status": "running",
        "input": {
          "filePath": "/home/user/projects/my-app/src/components/example.tsx"
        },
        "time": { "start": 1771185374540 }
      },
      "metadata": { "openai": { "itemId": "fc_0aaf..." } }
    }
  }
}
```

### Completed state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c62dff6c1001lZ3JMdkuStoPBL",
      "sessionID": "ses_39d204e49ffe35va87N9z2RBbs",
      "messageID": "msg_c62dfefc4001ljVRKHjzhPsfwM",
      "type": "tool",
      "callID": "call_DmmuMle1kuwXYEKJDcGYDSFs",
      "tool": "read",
      "state": {
        "status": "completed",
        "input": {
          "filePath": "/home/user/projects/my-app/src/components/example.tsx"
        },
        "output": "<file>\n00001| import React from 'react';\n00002| import { useState } from 'react';\n...\n</file>",
        "title": "src/components/example.tsx",
        "metadata": {
          "preview": "import React from 'react';\nimport { useState } from 'react';\n...",
          "truncated": false
        },
        "time": { "start": 1771185374540, "end": 1771185374549 }
      },
      "metadata": { "openai": { "itemId": "fc_0aaf..." } }
    }
  }
}
```

### Key differences from Claude's Read

- OpenCode uses camelCase `filePath` in input (Claude uses `file_path`)
- Pending state has empty `input: {}` (input only populated in running/completed)
- Completed state includes `title` (short file name) and `metadata.preview` (first few lines)
- Completed state includes `metadata.truncated` boolean

## apply_patch tool use

OpenCode uses `apply_patch` for all file mutations (Claude has separate `Edit` and `Write` tools).
Normalized based on operation: `*** Update File:` → `edit`, `*** Add File:` → `write`, `*** Delete File:` → `edit`.

### Normalization strategy

- **Running**: no metadata yet — extract file path + operation from `patchText` header only (no hunk parsing). Content fields empty.
- **Completed**: use `state.metadata.files[]` for structured `filePath`, `type`, `before`, `after`.

### Update File (completed)

```json
{
  "properties": {
    "part": {
      "type": "tool",
      "tool": "apply_patch",
      "state": {
        "status": "completed",
        "input": {
          "patchText": "*** Begin Patch\n*** Update File: src/utils.ts\n@@\n-export function add(a, b) {\n+export function add(a: number, b: number): number {\n*** End Patch"
        },
        "output": "Success. Updated the following files:\nM src/utils.ts",
        "metadata": {
          "files": [
            {
              "filePath": "/abs/path/src/utils.ts",
              "relativePath": "src/utils.ts",
              "type": "update",
              "diff": "--- src/utils.ts\n+++ src/utils.ts\n@@ -1,1 +1,1 @@\n-export function add(a, b) {\n+export function add(a: number, b: number): number {\n",
              "before": "export function add(a, b) {\n  return a + b;\n}\n",
              "after": "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
              "additions": 1,
              "deletions": 1
            }
          ]
        }
      }
    }
  }
}
```

→ `{ name: 'edit', input: { filePath: '…/utils.ts', oldString: '<before>', newString: '<after>' } }`

### Add File (completed)

```json
{
  "properties": {
    "part": {
      "type": "tool",
      "tool": "apply_patch",
      "state": {
        "status": "completed",
        "input": {
          "patchText": "*** Begin Patch\n*** Add File: src/helpers.ts\n+export function greet(name: string) {\n+  return `Hello ${name}`;\n+}\n*** End Patch"
        },
        "output": "Success. Created the following files:\nA src/helpers.ts",
        "metadata": {
          "files": [
            {
              "filePath": "/abs/path/src/helpers.ts",
              "relativePath": "src/helpers.ts",
              "type": "add",
              "before": "",
              "after": "export function greet(name: string) {\n  return `Hello ${name}`;\n}\n",
              "additions": 3,
              "deletions": 0
            }
          ]
        }
      }
    }
  }
}
```

→ `{ name: 'write', input: { filePath: '…/helpers.ts', value: '<after>' } }`

### Key differences from Claude's Edit/Write

- Single `apply_patch` tool covers add/update/delete (Claude has separate `Edit`/`Write`)
- Input: `patchText` string with `*** Begin Patch` / `*** (Update|Add|Delete) File:` / `*** End Patch`
- `state.metadata.files[]`: `filePath`, `relativePath`, `type`, `diff`, `before`/`after`, `additions`/`deletions`
- We normalize from `metadata.files[0]`: `type: "add"` → `write`, otherwise → `edit`
- Running state: file path from patchText header only, content empty until metadata arrives

## Question tool use

OpenCode uses a `question` tool to ask the user questions, similar to Claude's `AskUserQuestion`.
The input structure is the same: a `questions` array with `header`, `question`, and `options` fields.
Normalized to `ask-user-question` — same as Claude's AskUserQuestion — triggering the interactive question dialog.

### Pending state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c8b0e74fa001yk5X7pmYbTn4Hp",
      "sessionID": "ses_39dfe072affenyBfFZvZcqWfb1",
      "messageID": "msg_c8b0e5ee5001Eq4H73654956sE",
      "type": "tool",
      "callID": "call_IXiz402DEoUh0rw0PAtzgzO1",
      "tool": "question",
      "state": {
        "status": "pending",
        "input": {},
        "raw": ""
      }
    }
  }
}
```

### Running state

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_c8b0e74fa001yk5X7pmYbTn4Hp",
      "sessionID": "ses_39dfe072affenyBfFZvZcqWfb1",
      "messageID": "msg_c8b0e5ee5001Eq4H73654956sE",
      "type": "tool",
      "callID": "call_IXiz402DEoUh0rw0PAtzgzO1",
      "tool": "question",
      "state": {
        "status": "running",
        "input": {
          "questions": [
            {
              "header": "Scope",
              "question": "Should `sale createBooking` include only the API mutation + hook/store wiring, or also full typed request/response models?",
              "options": [
                {
                  "label": "Hook + wiring (Recommended)",
                  "description": "Add API call, feature hook, and set booking in store; keep request/response types minimal and pragmatic."
                },
                {
                  "label": "Full typed models",
                  "description": "Add detailed CreateBookingInputDto/BookingOutputDto types and use them end-to-end now."
                }
              ]
            }
          ]
        },
        "time": { "start": 1771250000000 }
      },
      "metadata": { "openai": { "itemId": "fc_09c1..." } }
    }
  }
}
```

### Normalized entry

```json
{
  "id": "msg_c8b0e5ee5001Eq4H73654956sE:prt_c8b0e74fa001yk5X7pmYbTn4Hp",
  "date": "+058117-12-29T02:39:33.000Z",
  "model": "openai/gpt-5.3-codex",
  "type": "tool-use",
  "toolId": "call_IXiz402DEoUh0rw0PAtzgzO1",
  "name": "ask-user-question",
  "input": {
    "questions": [
      {
        "header": "Scope",
        "question": "Should `sale createBooking` include only the API mutation + hook/store wiring, or also full typed request/response models?",
        "options": [
          {
            "label": "Hook + wiring (Recommended)",
            "description": "Add API call, feature hook, and set booking in store; keep request/response types minimal and pragmatic."
          },
          {
            "label": "Full typed models",
            "description": "Add detailed CreateBookingInputDto/BookingOutputDto types and use them end-to-end now."
          }
        ]
      }
    ]
  }
}
```

### Key differences from Claude's AskUserQuestion

- OpenCode raw tool name is `"question"` (Claude uses `"AskUserQuestion"`) — both normalize to `ask-user-question`
- Input structure is identical: `questions` array with `header`, `question`, `options`
- Options have the same `label` + `description` shape
- Response mechanism differs: Claude resolves via SDK's `canUseTool` callback; OpenCode receives the answer as a follow-up `session.prompt()`

## session.error (APIError)

When OpenCode emits `session.error` with an API provider error payload, keep only the actionable detail.

```json
{
  "type": "session.error",
  "properties": {
    "sessionID": "ses_xxx",
    "error": {
      "name": "APIError",
      "data": {
        "message": "Bad Request: {\"detail\":\"The selected model is not supported for this account.\"}",
        "statusCode": 400,
        "responseBody": "{\"detail\":\"The selected model is not supported for this account.\"}"
      }
    }
  }
}
```

Normalized error message should be:

```text
The selected model is not supported for this account.
```
