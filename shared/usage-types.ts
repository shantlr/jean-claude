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
