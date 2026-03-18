export type TrackedPipelineKind = 'build' | 'release';

export interface TrackedPipeline {
  id: string;
  projectId: string;
  azurePipelineId: number;
  kind: TrackedPipelineKind;
  name: string;
  enabled: boolean;
  visible: boolean;
  lastCheckedRunId: number | null;
  createdAt: string;
}

export interface AzureBuildDefinition {
  id: number;
  name: string;
  path: string;
  type: string;
}

export interface AzureReleaseDefinition {
  id: number;
  name: string;
  path: string;
}

export interface AzureBuildRun {
  id: number;
  buildNumber: string;
  status: string;
  result: string;
  definition: { id: number; name: string };
  sourceBranch: string;
  startTime: string;
  finishTime: string | null;
  url: string;
  _links?: { web?: { href: string } };
}

export interface AzureRelease {
  id: number;
  name: string;
  status: string;
  releaseDefinition: { id: number; name: string };
  environments?: Array<{
    id: number;
    name: string;
    status: string;
  }>;
  createdOn: string;
  _links?: { web?: { href: string } };
}

// --- Build Detail & Timeline ---

export interface AzureBuildDetail {
  id: number;
  buildNumber: string;
  status: string; // notStarted | inProgress | completed | cancelling
  result: string; // succeeded | partiallySucceeded | failed | canceled | none
  definition: { id: number; name: string };
  sourceBranch: string;
  sourceVersion: string;
  startTime: string | null;
  finishTime: string | null;
  requestedFor: { displayName: string; uniqueName: string };
  url: string;
  _links?: { web?: { href: string } };
}

export interface AzureBuildTimelineRecord {
  id: string;
  parentId: string | null;
  type: string; // Stage | Job | Task
  name: string;
  state: string; // pending | inProgress | completed
  result: string | null; // succeeded | failed | canceled | skipped | abandoned
  startTime: string | null;
  finishTime: string | null;
  order: number;
  log?: { id: number; url: string };
  errorCount: number;
  warningCount: number;
  issues?: Array<{ type: string; message: string }>;
}

export interface AzureBuildTimeline {
  records: AzureBuildTimelineRecord[];
}

// --- Release Detail ---

export interface AzureReleaseDetail {
  id: number;
  name: string;
  status: string;
  releaseDefinition: { id: number; name: string };
  createdBy: { displayName: string; uniqueName: string };
  createdOn: string;
  environments: Array<{
    id: number;
    name: string;
    status: string;
    deploySteps: Array<{
      status: string;
      operationStatus: string;
      releaseDeployPhases: Array<{
        name: string;
        status: string;
        deploymentJobs: Array<{
          job: { name: string; status: string };
          tasks: Array<{
            name: string;
            status: string;
            startTime: string | null;
            finishTime: string | null;
            logUrl: string | null;
            issues: Array<{ issueType: string; message: string }>;
          }>;
        }>;
      }>;
    }>;
  }>;
  artifacts: Array<{
    alias: string;
    type: string;
    definitionReference: Record<string, { id: string; name: string }>;
  }>;
  _links?: { web?: { href: string } };
}

// --- Branches ---

export interface AzureGitRef {
  name: string; // refs/heads/main
  objectId: string;
}

// --- Build Definition Parameters ---

export interface AzureBuildDefinitionParameter {
  name: string;
  displayName: string;
  type: 'string' | 'boolean' | 'number';
  defaultValue: string;
  allowedValues?: string[];
}

export interface AzureBuildDefinitionDetail {
  id: number;
  name: string;
  variables?: Record<
    string,
    {
      value: string;
      allowOverride?: boolean;
      isSecret?: boolean;
    }
  >;
  processParameters?: {
    inputs: Array<{
      name: string;
      label: string;
      type: string; // string | boolean | pickList | radio
      defaultValue: string;
      options?: Record<string, string>;
      helpMarkDown?: string;
    }>;
  };
}

// --- Trigger Params ---

export interface QueueBuildParams {
  providerId: string;
  projectId: string;
  definitionId: number;
  sourceBranch: string;
  parameters?: Record<string, string>;
}

export interface CreateReleaseParams {
  providerId: string;
  projectId: string;
  definitionId: number;
  description?: string;
}
