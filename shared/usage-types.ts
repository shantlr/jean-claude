// API response types matching Anthropic's OAuth usage endpoint
export interface UsageLimitData {
  utilization: number;
  resets_at: string;
}

export interface ClaudeUsageResponse {
  five_hour: UsageLimitData | null;
  seven_day: UsageLimitData | null;
  seven_day_oauth_apps?: UsageLimitData | null;
  seven_day_opus?: UsageLimitData | null;
}

// Internal types for the app
export interface UsageDisplayData {
  fiveHour: {
    utilization: number;
    resetsAt: Date;
    timeUntilReset: string;
    windowDurationMs: number;
  } | null;
  sevenDay: {
    utilization: number;
    resetsAt: Date;
    timeUntilReset: string;
    windowDurationMs: number;
  } | null;
}

export type UsageLevel = 'excellent' | 'low' | 'medium' | 'high' | 'critical';

export type UsageError =
  | { type: 'no_token'; message: string }
  | { type: 'api_error'; message: string; statusCode?: number }
  | { type: 'parse_error'; message: string };

export interface UsageResult {
  data: UsageDisplayData | null;
  error: UsageError | null;
}

// Usage provider types — independent from AgentBackendType.
// Codex (OpenAI) is a usage provider but not an agent backend in this app.
export type UsageProviderType = 'claude-code' | 'codex';

export const USAGE_PROVIDERS: {
  value: UsageProviderType;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    value: 'claude-code',
    label: 'Claude Code',
    shortLabel: 'CC',
    description: 'Anthropic Claude Code OAuth usage',
  },
  {
    value: 'codex',
    label: 'Codex',
    shortLabel: 'CX',
    description: 'OpenAI Codex rate limits',
  },
];

// Per-provider usage results
export type UsageProviderMap = Partial<Record<UsageProviderType, UsageResult>>;
