export type TrackedPipelineKind = 'build' | 'release';

export interface TrackedPipeline {
  id: string;
  projectId: string;
  azurePipelineId: number;
  kind: TrackedPipelineKind;
  name: string;
  enabled: boolean;
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
  environments: Array<{
    id: number;
    name: string;
    status: string;
  }>;
  createdOn: string;
  _links?: { web?: { href: string } };
}
