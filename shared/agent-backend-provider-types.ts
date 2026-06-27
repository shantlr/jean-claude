import type {
  AgentBackendConfig,
  AgentBackendType,
  AgentEvent,
  AgentTaskContext,
  NormalizedPermissionResponse,
  PromptPart,
} from './agent-backend-types';
import type { InteractionMode, ThinkingEffort } from './types';
import type { AiUsageContext } from './ai-usage-types';

export type CapabilityValidation =
  | { ok: true }
  | { ok: false; reason: string; severity: 'error' | 'warning' };

export interface ValidatedCapability<Input> {
  validate?: (
    input: Input,
  ) => CapabilityValidation | Promise<CapabilityValidation>;
}

export type Capability<Implementation, Input = unknown> =
  | ({
      supported: true;
      implementation: Implementation;
    } & ValidatedCapability<Input>)
  | {
      supported: false;
      reason: string;
    };

export interface AgentRunInput {
  context: AgentTaskContext;
  config: AgentBackendConfig;
  parts: PromptPart[];
}

export interface AgentRunHandle {
  /**
   * Provider control identifier for this active run. Agent-service may use this
   * to address or track the run through provider capabilities, but it is not
   * necessarily the backend's durable native conversation/session ID.
   */
  runId: string;
  events: AsyncIterable<AgentEvent>;
  rootPid?: number;
  stop: () => Promise<void>;
  dispose: () => Promise<void>;
}

export interface RunAgentCapability {
  start(input: AgentRunInput): Promise<AgentRunHandle>;
}

export type ResumeSessionCapability = RunAgentCapability;

export interface PermissionCapability {
  respond(input: {
    handle: AgentRunHandle;
    requestId: string;
    response: NormalizedPermissionResponse;
  }): Promise<void>;
}

export interface QuestionCapability {
  respond(input: {
    handle: AgentRunHandle;
    requestId: string;
    answer: Record<string, string>;
  }): Promise<void>;
}

export interface RuntimeModeSwitchCapability {
  setMode(input: {
    handle: AgentRunHandle;
    mode: InteractionMode;
  }): Promise<void>;
}

export interface SessionAllowedToolsCapability {
  list(input: { handle: AgentRunHandle }): string[];
}

export interface ResourceTrackingCapability {
  getRootPid(input: { handle: AgentRunHandle }): number | null;
}

export interface TextGenerationInput {
  model: string;
  prompt: string;
  skillName?: string | null;
  thinkingEffort?: ThinkingEffort | null;
  cwd?: string;
  allowedTools?: string[];
  allowedToolPatterns?: Record<string, string[]>;
  abortController: AbortController;
  usageContext?: AiUsageContext;
}

export interface StructuredGenerationInput extends TextGenerationInput {
  outputSchema: Record<string, unknown>;
}

export interface GenerationOutput {
  output: unknown | null;
}

export interface TextGenerationCapability {
  generate(input: TextGenerationInput): Promise<GenerationOutput>;
}

export interface StructuredGenerationCapability {
  generate(input: StructuredGenerationInput): Promise<GenerationOutput>;
  mode: 'native-schema' | 'prompt-json' | 'tool-call' | 'custom';
}

export interface ModelDiscoveryCapability {
  list(input?: unknown): Promise<unknown>;
}

export interface BackendConfigCapability {
  read(input?: unknown): Promise<unknown>;
}

export interface BackendSkillCapability {
  list(input?: unknown): Promise<unknown>;
}

export interface BackendAgentCapability {
  list(input?: unknown): Promise<unknown>;
}

export interface SlashCommandCapability {
  list(input: { cwd?: string }): Promise<unknown>;
}

export interface McpCapability {
  list(input?: unknown): Promise<unknown>;
}

export interface PromptInputCapability {
  normalize(input: unknown): Promise<PromptPart[]> | PromptPart[];
}

export interface AgentCapabilityGroup {
  run: Capability<RunAgentCapability, AgentRunInput>;
  resume: Capability<ResumeSessionCapability, AgentRunInput>;
  permissions: Capability<PermissionCapability>;
  questions: Capability<QuestionCapability>;
  runtimeModeSwitch: Capability<RuntimeModeSwitchCapability>;
  sessionAllowedTools: Capability<SessionAllowedToolsCapability>;
  resourceTracking: Capability<ResourceTrackingCapability>;
}

export interface GenerationCapabilityGroup {
  text: Capability<TextGenerationCapability>;
  structured: Capability<StructuredGenerationCapability>;
}

export interface ConfigurationCapabilityGroup {
  models: Capability<ModelDiscoveryCapability>;
  nativeConfig: Capability<BackendConfigCapability>;
}

export interface ResourcesCapabilityGroup {
  skills: Capability<BackendSkillCapability>;
  agents: Capability<BackendAgentCapability>;
  slashCommands: Capability<SlashCommandCapability>;
  mcp: Capability<McpCapability>;
}

export interface InputCapabilityGroup {
  text: Capability<PromptInputCapability>;
  images: Capability<PromptInputCapability>;
  files: Capability<PromptInputCapability>;
}

export interface AgentBackendCapabilities {
  agent: AgentCapabilityGroup;
  generation: GenerationCapabilityGroup;
  configuration: ConfigurationCapabilityGroup;
  resources: ResourcesCapabilityGroup;
  input: InputCapabilityGroup;
}

export interface AgentBackendProvider {
  id: AgentBackendType;
  label: string;
  description?: string;
  capabilities: AgentBackendCapabilities;
}

export class UnsupportedBackendCapabilityError extends Error {
  readonly backend: AgentBackendType;
  readonly capability: string;
  readonly reason: string;

  constructor(params: {
    backend: AgentBackendType;
    capability: string;
    reason: string;
  }) {
    super(
      `Unsupported backend capability "${params.backend}.${params.capability}": ${params.reason}`,
    );
    this.name = 'UnsupportedBackendCapabilityError';
    this.backend = params.backend;
    this.capability = params.capability;
    this.reason = params.reason;
  }
}

export function requireCapability<Implementation>(
  backend: AgentBackendType,
  capabilityName: string,
  capability: Capability<Implementation>,
): Implementation {
  if (capability.supported) return capability.implementation;

  throw new UnsupportedBackendCapabilityError({
    backend,
    capability: capabilityName,
    reason: capability.reason,
  });
}
