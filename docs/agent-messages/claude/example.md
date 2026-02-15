# Claude

## Basic assistant message

```json
{
  "id": "l0p4THZ0m3wuCTla-doDu",
  "role": "assistant",
  "parts": [
    {
      "type": "text",
      "text": "I now have a comprehensive understanding. Let me design the plan."
    }
  ],
  "timestamp": "2026-02-08T10:37:44.548Z",
  "model": "claude-opus-4-6",
  "metadata": {
    "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
  }
}
```

## Read tool use

```json
[
  {
    "id": "g1Pyfx17yx85G6iRBP9fT",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_01MUSEtaggEZRn25hme6Zcxy",
        "toolName": "Read",
        "input": {
          "file_path": "/src/features/task/ui-task-panel/index.tsx"
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:45.283Z",
    "model": "claude-haiku-4-5-20251001",
    "parentToolUseId": "toolu_01JotUDF2Cdyua1cZ8GApNqY",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  {
    "id": "Kjj8fp0Do_QGzPcokTiZO",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_01N2XMLdihiqKGXo736eMF4C",
        "toolName": "Read",
        "input": {
          "file_path": "/electron/services/agent-service.ts",
          "offset": 150,
          "limit": 200
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:45.274Z",
    "model": "claude-haiku-4-5-20251001",
    "parentToolUseId": "toolu_01PpspPko4FmDB3yi6JCqMGR",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  }
]
```

## Glob tool use

```json
[
    {
    "id": "I-AkNY_bAtSgmD2V7fl8_",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_011wSAsra9MgyGYDtSpSSBmh",
        "toolName": "Glob",
        "input": {
          "pattern": "**/task-service.ts"
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:44.559Z",
    "model": "claude-haiku-4-5-20251001",
    "parentToolUseId": "toolu_016Pk5T3dFrLCJig2nvNPnKV",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  {
    "id": "TpERwlacsWzaDfqPYVfUw",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_011wSAsra9MgyGYDtSpSSBmh",
        "content": "/electron/services/task-service.ts"
      }
    ],
    "timestamp": "2026-02-08T10:37:45.256Z",
    "parentToolUseId": "toolu_016Pk5T3dFrLCJig2nvNPnKV",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  }
]
```

## Grep

```json
[
  {
      "id": "EkynVPr3J05UEKUEXVqwL",
      "role": "assistant",
      "parts": [
          {
              "type": "tool-use",
              "toolId": "toolu_01CyYkgNgeE7vcygJjzNTbwu",
              "toolName": "Grep",
              "input": {
                  "pattern": "createSyntheticUserMessage|normalizeUserMessage",
                  "path": "/project",
                  "output_mode": "files_with_matches"
              }
          }
      ],
      "timestamp": "2026-02-08T11:05:23.824Z",
      "model": "claude-haiku-4-5-20251001",
      "parentToolUseId": "toolu_01DHSSUignKfgD3m4noRHN1M",
      "metadata": {
          "session_id": "f963009b-f963-4b7b-a3a3-c4d7d4a73ab3"
      }
  },
  {
      "id": "WtQDvaY-GYj_Nh6JPP58J",
      "role": "user",
      "parts": [
          {
              "type": "tool-result",
              "toolId": "toolu_01CyYkgNgeE7vcygJjzNTbwu",
              "content": "Found 3 files\nsrc/features/task/ui-task-panel/index.tsx\nelectron/services/agent-service.ts\nCLAUDE.md"
          }
      ],
      "timestamp": "2026-02-08T11:05:23.849Z",
      "parentToolUseId": "toolu_01DHSSUignKfgD3m4noRHN1M",
      "metadata": {
          "session_id": "f963009b-f963-4b7b-a3a3-c4d7d4a73ab3"
      }
  }
]
```

## Mcp usage

```json
[
  {
    "id": "-4mrsNLgJtIOgGH-e8XsH",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_01TpFaTUeMEjKvKcQBe2VcjV",
        "toolName": "mcp__serena__get_symbols_overview",
        "input": {
          "relative_path": "src/lib/api.ts",
          "depth": 1
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:45.114Z",
    "model": "claude-opus-4-6",
    "parentToolUseId": "toolu_01Gu57JcfqGDRE8iRMTKGm6S",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  {
    "id": "-upvlJwWU8iemL8zpqavD",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_01TpFaTUeMEjKvKcQBe2VcjV",
        "content": "{\"result\":\"[]\"}"
      }
    ],
    "timestamp": "2026-02-08T10:37:44.206Z",
    "parentToolUseId": "toolu_01Gu57JcfqGDRE8iRMTKGm6S",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  }
]
```

## Bash tool

```json
[
  {
    "id": "c2AB4RXyaPADnUElLBI6s",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_01KMWH9yn178RvARxc9FqwHN",
        "toolName": "Bash",
        "input": {
          "command": "pnpm lint --fix 2>&1 | tail -30",
          "description": "Run ESLint with auto-fix",
          "timeout": 60000
        }
      }
    ],
    "timestamp": "2026-02-09T19:25:34.874Z",
    "model": "claude-opus-4-6",
    "metadata": {
      "session_id": "d40bd5bc-62f3-4b54-b667-b96353734633"
    }
  },
  {
    "id": "zo9wVDBgENp7bRmAG_xZJ",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_01KMWH9yn178RvARxc9FqwHN",
        "content": "> myapp@1.0.0 lint /project\n> eslint . --fix\n\nError: Cannot find package '@eslint/js'\nCommand failed with exit code 2.",
        "isError": false
      }
    ],
    "timestamp": "2026-02-09T19:25:35.417Z",
    "metadata": {
      "session_id": "d40bd5bc-62f3-4b54-b667-b96353734633",
      "tool_use_result": {
        "stdout": "> myapp@1.0.0 lint /project\n> eslint . --fix\n\nError: Cannot find package '@eslint/js'\nCommand failed with exit code 2.",
        "stderr": "",
        "interrupted": false,
        "isImage": false
      }
    }
  }
]
```

## Ask user question tool

```json
[
  {
    "id": "7suHkixO6lcIUp8UoAdtU",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_011cM8TRYgUbPw4CAbsjsyAF",
        "toolName": "AskUserQuestion",
        "input": {
          "questions": [
            {
              "question": "Should follow-up messages create a new session tab or continue in the same session?",
              "header": "Follow-ups",
              "multiSelect": false,
              "options": [
                {
                  "label": "New session tab",
                  "description": "Every follow-up creates a new session."
                },
                {
                  "label": "Same session",
                  "description": "Follow-ups stay in the same session tab."
                }
              ]
            },
            {
              "question": "Should sessionId be removed from the tasks table?",
              "header": "sessionId",
              "multiSelect": false,
              "options": [
                {
                  "label": "Remove from tasks",
                  "description": "Clean break: sessionId lives only on task_sessions."
                },
                {
                  "label": "Keep on tasks",
                  "description": "Keep sessionId on tasks for backward compat."
                }
              ]
            }
          ]
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:44.832Z",
    "model": "claude-opus-4-6",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  {
    "id": "tvM_o05HDbTH3mltPV5Fd",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_011cM8TRYgUbPw4CAbsjsyAF",
        "content": "User answered: \"Follow-ups?\"=\"Same session\", \"Remove sessionId?\"=\"Remove from tasks\"."
      }
    ],
    "timestamp": "2026-02-08T10:37:44.813Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "tool_use_result": {
        "questions": [
          {
            "question": "Should follow-up messages create a new session tab or continue in the same session?",
            "header": "Follow-ups",
            "options": [
              {
                "label": "New session tab",
                "description": "Every follow-up creates a new session."
              },
              {
                "label": "Same session",
                "description": "Follow-ups stay in the same session tab."
              }
            ],
            "multiSelect": false
          },
          {
            "question": "Should sessionId be removed from the tasks table?",
            "header": "sessionId",
            "options": [
              {
                "label": "Remove from tasks",
                "description": "Clean break: sessionId lives only on task_sessions."
              },
              {
                "label": "Keep on tasks",
                "description": "Keep sessionId on tasks for backward compat."
              }
            ],
            "multiSelect": false
          }
        ],
        "answers": {
          "Should follow-up messages create a new session tab or continue in the same session?": "Same session",
          "Should sessionId be removed from the tasks table?": "Remove from tasks"
        }
      }
    }
  }
]
```

## Write tool use

```json
[
  {
    "id": "Yk2LvM-E7VJtwjwtYH__3",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_01FaWHkSHVnjzX7yqQpRTMvD",
        "toolName": "Write",
        "input": {
          "file_path": ".claude/plans/my-plan.md",
          "content": "# Multi-Session Task Architecture\n\n..."
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:44.307Z",
    "model": "claude-opus-4-6",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  {
    "id": "hV0h6HXGpQfiDX6_x8Bpb",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_01FaWHkSHVnjzX7yqQpRTMvD",
        "content": "File created successfully at: .claude/plans/my-plan.md"
      }
    ],
    "timestamp": "2026-02-08T10:37:44.039Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "tool_use_result": {
        "type": "create",
        "filePath": ".claude/plans/my-plan.md",
        "content": "# Multi-Session Task Architecture\n\n...",
        "structuredPatch": [],
        "originalFile": null
      }
    }
  }
]
```

## Subagent tool use

```json
[
  {
    "id": "BDgc23jT1OET70_fW3w74",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_016Pk5T3dFrLCJig2nvNPnKV",
        "toolName": "Task",
        "input": {
          "description": "Explore agent lifecycle flow",
          "subagent_type": "Explore",
          "prompt": "Explore very thoroughly ..."
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:45.769Z",
    "model": "claude-opus-4-6",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  // ... subagent child messages have parentToolUseId pointing to the Task tool ...
  {
    "id": "I-AkNY_bAtSgmD2V7fl8_",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_011wSAsra9MgyGYDtSpSSBmh",
        "toolName": "Glob",
        "input": {
          "pattern": "**/task-service.ts"
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:44.559Z",
    "model": "claude-haiku-4-5-20251001",
    "parentToolUseId": "toolu_016Pk5T3dFrLCJig2nvNPnKV",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  // ... subagent tool result (final) ...
  {
    "id": "H_K-CnH1CP67MdhDX5pRu",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_016Pk5T3dFrLCJig2nvNPnKV",
        "content": [
          {
            "type": "text",
            "text": "Here is a summary of the agent lifecycle ..."
          },
          {
            "type": "text",
            "text": "agentId: ab16005 (for resuming)\n<usage>total_tokens: 96314\ntool_uses: 26\nduration_ms: 89858</usage>"
          }
        ]
      }
    ],
    "timestamp": "2026-02-08T10:37:44.196Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "tool_use_result": {
        "status": "completed",
        "prompt": "Explore very thoroughly ...",
        "agentId": "ab16005",
        "content": [
          {
            "type": "text",
            "text": "Here is a summary of the agent lifecycle ..."
          }
        ],
        "totalDurationMs": 89858,
        "totalTokens": 96314,
        "totalToolUseCount": 26,
        "usage": {
          "input_tokens": 5,
          "cache_creation_input_tokens": 2363,
          "cache_read_input_tokens": 86201,
          "output_tokens": 7745,
          "server_tool_use": {
            "web_search_requests": 0,
            "web_fetch_requests": 0
          },
          "service_tier": "standard",
          "cache_creation": {
            "ephemeral_1h_input_tokens": 2363,
            "ephemeral_5m_input_tokens": 0
          }
        }
      }
    }
  }
]
```

### Async subagent

```json
[
  {
    "id": "dUPnCyUypbPFbNtrn4nB3",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_019zaGqNX65jFwjsknNviRTB",
        "toolName": "Task",
        "input": {
          "description": "Create task-sessions repository",
          "subagent_type": "general-purpose",
          "prompt": "Create a new repository file ...",
          "run_in_background": true
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:44.860Z",
    "model": "claude-opus-4-6",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  {
    "id": "kZD5NjXEaZfZRrbosfP0X",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_019zaGqNX65jFwjsknNviRTB",
        "content": [
          {
            "type": "text",
            "text": "Async agent launched successfully.\nagentId: a03a84c\noutput_file: /tmp/tasks/a03a84c.output"
          }
        ]
      }
    ],
    "timestamp": "2026-02-08T10:37:44.543Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "tool_use_result": {
        "isAsync": true,
        "status": "async_launched",
        "agentId": "a03a84c",
        "description": "Create task-sessions repository",
        "prompt": "Create a new repository file ...",
        "outputFile": "/tmp/tasks/a03a84c.output"
      }
    }
  }
]
```

### Async subagent output

```json
[
  {
    "id": "dfmg65tcYw4LgRfgHvGww",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_01TDFwJsaa9WPLYvQUQqvHeR",
        "toolName": "TaskOutput",
        "input": {
          "task_id": "a03a84c",
          "block": false,
          "timeout": 5000
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:44.956Z",
    "model": "claude-opus-4-6",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  {
    "id": "gfP8M7WS2y01jkfZEpL5r",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_01TDFwJsaa9WPLYvQUQqvHeR",
        "content": "<retrieval_status>success</retrieval_status>\n<task_id>a03a84c</task_id>\n<status>completed</status>\n<output>\n[Truncated. Full output: /tmp/tasks/a03a84c.output]\nThe repository file was created successfully with all methods.\n</output>"
      }
    ],
    "timestamp": "2026-02-08T10:37:44.667Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "tool_use_result": {
        "retrieval_status": "success",
        "task": {
          "task_id": "a03a84c",
          "task_type": "local_agent",
          "status": "completed"
        }
      }
    }
  }
]
```

## ExitPlanMode

```json
[
  {
    "id": "QF_DTGA9cllVynX7I23zi",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_0195oS6Smw52zWwixawxmUYF",
        "toolName": "ExitPlanMode",
        "input": {
          "allowedPrompts": [
            {
              "tool": "Bash",
              "prompt": "run pnpm lint --fix"
            },
            {
              "tool": "Bash",
              "prompt": "run pnpm ts-check"
            }
          ],
          "plan": "# Multi-Session Task Architecture\n\n..."
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:45.274Z",
    "model": "claude-opus-4-6",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  {
    "id": "zz5tr0fXdzwEhK7FOuSa0",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_0195oS6Smw52zWwixawxmUYF",
        "content": "User has approved your plan..."
      }
    ],
    "timestamp": "2026-02-08T10:37:45.605Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "tool_use_result": {
        "plan": "# Multi-Session Task Architecture\n\n..."
      }
    }
  }
]
```

## TodoWrite tool use

```json
[
  {
    "id": "C-gydzmC1QsiCb9aMBBRE",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_01VKRt6KAJqC1dW8e8TsSx5U",
        "toolName": "TodoWrite",
        "input": {
          "todos": [
            {
              "content": "Phase 1: Database layer",
              "status": "in_progress",
              "activeForm": "Implementing database layer"
            },
            {
              "content": "Phase 2: Shared types",
              "status": "pending",
              "activeForm": "Updating shared types"
            },
            {
              "content": "Phase 3: Agent service refactor",
              "status": "pending",
              "activeForm": "Refactoring agent service"
            }
          ]
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:44.422Z",
    "model": "claude-opus-4-6",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  {
    "id": "H4jOhNBTeAIaarQ3FUixv",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_01VKRt6KAJqC1dW8e8TsSx5U",
        "content": "Todos have been modified successfully.",
        "structuredResult": {
          "kind": "todo",
          "oldTodos": [],
          "newTodos": [
            {
              "content": "Phase 1: Database layer",
              "status": "in_progress",
              "activeForm": "Implementing database layer"
            },
            {
              "content": "Phase 2: Shared types",
              "status": "pending",
              "activeForm": "Updating shared types"
            },
            {
              "content": "Phase 3: Agent service refactor",
              "status": "pending",
              "activeForm": "Refactoring agent service"
            }
          ]
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:45.451Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "tool_use_result": {
        "oldTodos": [],
        "newTodos": [
          {
            "content": "Phase 1: Database layer",
            "status": "in_progress",
            "activeForm": "Implementing database layer"
          },
          {
            "content": "Phase 2: Shared types",
            "status": "pending",
            "activeForm": "Updating shared types"
          },
          {
            "content": "Phase 3: Agent service refactor",
            "status": "pending",
            "activeForm": "Refactoring agent service"
          }
        ]
      },
      "structuredResult": {
        "kind": "todo",
        "oldTodos": [],
        "newTodos": [
          {
            "content": "Phase 1: Database layer",
            "status": "in_progress",
            "activeForm": "Implementing database layer"
          },
          {
            "content": "Phase 2: Shared types",
            "status": "pending",
            "activeForm": "Updating shared types"
          },
          {
            "content": "Phase 3: Agent service refactor",
            "status": "pending",
            "activeForm": "Refactoring agent service"
          }
        ]
      }
    }
  }
]
```

## Skill

```json
[
  {
      "id": "XT7g05luzF-QAWq07p-zc",
      "role": "assistant",
      "parts": [
          {
              "type": "tool-use",
              "toolId": "toolu_01541SSMGPhignk5GKq5hRHp",
              "toolName": "Skill",
              "input": {
                  "skill": "superpowers:brainstorming"
              }
          }
      ],
      "timestamp": "2026-02-10T20:13:28.361Z",
      "model": "claude-opus-4-6",
      "metadata": {
          "session_id": "30fbd226-7003-4aff-b4d0-a42fbc557894"
      }
  },
  {
      "id": "jTcFqJxoh6bnF7Ltu_e7q",
      "role": "user",
      "parts": [
          {
              "type": "tool-result",
              "toolId": "toolu_01541SSMGPhignk5GKq5hRHp",
              "content": "Launching skill: superpowers:brainstorming",
              "structuredResult": {
                  "kind": "skill",
                  "success": true,
                  "commandName": "superpowers:brainstorming"
              }
          }
      ],
      "timestamp": "2026-02-10T20:13:28.379Z",
      "metadata": {
          "session_id": "30fbd226-7003-4aff-b4d0-a42fbc557894",
          "tool_use_result": {
              "success": true,
              "commandName": "superpowers:brainstorming"
          },
          "structuredResult": {
              "kind": "skill",
              "success": true,
              "commandName": "superpowers:brainstorming"
          }
      }
  }
]
```

## WebFetch

```json
[
  {
      "id": "R8r3-IFxTTw8rEq7CwGue",
      "role": "assistant",
      "parts": [
          {
              "type": "tool-use",
              "toolId": "toolu_013LVqFuoByWZkF6oNb7fhRK",
              "toolName": "WebFetch",
              "input": {
                  "url": "https://docs.example.com/api/completions",
                  "prompt": "Extract the API spec: URL, method, request params, and response format."
              }
          }
      ],
      "timestamp": "2026-02-11T21:16:36.988Z",
      "model": "claude-opus-4-6",
      "metadata": {
          "session_id": "30fbd226-7003-4aff-b4d0-a42fbc557894"
      }
  },
  {
      "id": "yfPRMWHDvGB2ItW0uEPgO",
      "role": "user",
      "parts": [
          {
              "type": "tool-result",
              "toolId": "toolu_013LVqFuoByWZkF6oNb7fhRK",
              "content": "# Completions Endpoint\n\n- **URL:** `POST /v1/completions`\n- **Params:** model (string, required), prompt (string, required), max_tokens (int), temperature (number), stream (bool)\n- **Response:** { id, object, model, choices, usage }"
          }
      ],
      "timestamp": "2026-02-11T21:17:58.150Z",
      "metadata": {
          "session_id": "30fbd226-7003-4aff-b4d0-a42fbc557894",
          "tool_use_result": {
              "bytes": 12345,
              "code": 200,
              "codeText": "OK",
              "result": "# Completions Endpoint\n\n- **URL:** `POST /v1/completions`\n- **Params:** model (string, required), prompt (string, required), max_tokens (int), temperature (number), stream (bool)\n- **Response:** { id, object, model, choices, usage }",
              "durationMs": 6044,
              "url": "https://docs.example.com/api/completions"
          }
      }
  }
]
```

## Edit tool use

```json
[
  {
    "id": "A_s_wT7Yqyge5KC-FM7qe",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-use",
        "toolId": "toolu_01ARQYhF2WP8TpvHznaYHqe6",
        "toolName": "Edit",
        "input": {
          "replace_all": false,
          "file_path": "electron/database/schema.ts",
          "old_string": "export interface Database {\n  tokens: TokenTable;\n  tasks: TaskTable;\n  agent_messages: AgentMessageTable;\n}",
          "new_string": "export interface Database {\n  tokens: TokenTable;\n  tasks: TaskTable;\n  task_sessions: TaskSessionTable;\n  agent_messages: AgentMessageTable;\n}"
        }
      }
    ],
    "timestamp": "2026-02-08T10:37:45.156Z",
    "model": "claude-opus-4-6",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
    }
  },
  {
    "id": "v65fR89V4DSn5Dgowy8kh",
    "role": "user",
    "parts": [
      {
        "type": "tool-result",
        "toolId": "toolu_01ARQYhF2WP8TpvHznaYHqe6",
        "content": "The file electron/database/schema.ts has been updated successfully."
      }
    ],
    "timestamp": "2026-02-08T10:37:44.968Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "tool_use_result": {
        "filePath": "electron/database/schema.ts",
        "oldString": "export interface Database {\n  tokens: TokenTable;\n  tasks: TaskTable;\n  agent_messages: AgentMessageTable;\n}",
        "newString": "export interface Database {\n  tokens: TokenTable;\n  tasks: TaskTable;\n  task_sessions: TaskSessionTable;\n  agent_messages: AgentMessageTable;\n}",
        "originalFile": "import { Generated } from 'kysely';\n\nexport interface Database {\n  tokens: TokenTable;\n  tasks: TaskTable;\n  agent_messages: AgentMessageTable;\n}\n\n// ... rest of file ...\n",
        "structuredPatch": [
          {
            "oldStart": 3,
            "oldLines": 4,
            "newStart": 3,
            "newLines": 5,
            "lines": [
              "   tokens: TokenTable;",
              "   tasks: TaskTable;",
              "+  task_sessions: TaskSessionTable;",
              "   agent_messages: AgentMessageTable;"
            ]
          }
        ],
        "userModified": false,
        "replaceAll": false
      }
    }
  }
]
```

## Compacting

```json
[
  {
    "id": "3OceOdaqdCqHxgy_fiP8i",
    "role": "system",
    "parts": [
      {
        "type": "system-status",
        "subtype": "status",
        "status": "compacting"
      }
    ],
    "timestamp": "2026-02-08T10:37:45.064Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "subtype": "status",
      "status": "compacting"
    }
  },
  {
    "id": "hQic0kuMEbG9hzw5HNQRp",
    "role": "system",
    "parts": [
      {
        "type": "system-status",
        "subtype": "status",
        "status": null
      }
    ],
    "timestamp": "2026-02-08T10:37:45.188Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "subtype": "status"
    }
  },
  {
    "id": "0GFpFx2lDphnYBP7UaF5T",
    "role": "system",
    "parts": [
      {
        "type": "compact",
        "trigger": "auto",
        "preTokens": 180333
      }
    ],
    "timestamp": "2026-02-08T10:37:45.758Z",
    "metadata": {
      "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01",
      "subtype": "compact_boundary",
      "compact_metadata": {
        "trigger": "auto",
        "pre_tokens": 180333
      }
    }
  }
]
```

### Compacting follow-up synthetic message

```json
{
  "id": "znm0MpwsPRscZp4TqzrRh",
  "role": "user",
  "parts": [
    {
      "type": "text",
      "text": "Continued from previous conversation.\n\nSummary:\n1. User requested feature X.\n2. Phases 1-3 done. Remaining: Phase 4-6.\n\nPlease continue."
    }
  ],
  "timestamp": "2026-02-08T10:37:45.484Z",
  "isSynthetic": true,
  "metadata": {
    "session_id": "9d9f07e1-2696-40b4-87af-eab2d03b4e01"
  }
}
```

## Result

```json
{
  "id": "nq7cMV87uxk1sX6qYuXt2",
  "role": "result",
  "parts": [
    {
      "type": "text",
      "text": "All tests pass. Feature implemented successfully."
    }
  ],
  "timestamp": "2026-02-10T20:12:58.148Z",
  "isError": false,
  "result": "All tests pass. Feature implemented successfully.",
  "durationMs": 50129,
  "totalCost": {
    "costUsd": 0.92239575
  },
  "usage": {
    "inputTokens": 6,
    "outputTokens": 2562,
    "cacheReadTokens": 326548,
    "cacheCreationTokens": 111031
  },
  "modelUsage": {
    "claude-opus-4-6": {
      "inputTokens": 6,
      "outputTokens": 2562,
      "cacheReadTokens": 326548,
      "cacheCreationTokens": 111031,
      "contextWindow": 200000,
      "costUsd": 0.9212977499999999
    },
    "claude-haiku-4-5-20251001": {
      "inputTokens": 778,
      "outputTokens": 64,
      "cacheReadTokens": 0,
      "cacheCreationTokens": 0,
      "contextWindow": 200000,
      "costUsd": 0.001098
    }
  },
  "metadata": {
    "session_id": "d40bd5bc-62f3-4b54-b667-b96353734633",
    "subtype": "success",
    "duration_api_ms": 39042,
    "cache_creation": {
      "ephemeral_1h_input_tokens": 111031,
      "ephemeral_5m_input_tokens": 0
    },
    "server_tool_use": {
      "web_search_requests": 0,
      "web_fetch_requests": 0
    }
  }
}
```

## Error

### User Interruption

```json
{
  "id": "uqLKLNOv211EvNWPotFv1",
  "role": "result",
  "parts": [
    {
      "type": "text",
      "text": "Task interrupted by user"
    }
  ],
  "timestamp": "2026-02-08T10:37:44.071Z",
  "isError": true,
  "result": "Task interrupted by user"
}
```
