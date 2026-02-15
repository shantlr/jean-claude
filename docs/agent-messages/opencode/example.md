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
          "dir": "/Users/patrick.lin/.config/opencode/skills/superpowers/brainstorming",
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
