import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
} from '@shared/azure-devops-types';
import type { FeedNote, ProjectPriority } from '@shared/feed-types';
import type { Project, Provider, Task, TaskStep, Token } from '@shared/types';

export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

export type ResourceMeta = {
  status: RequestStatus;
  error: string | null;
  lastFetchedAt: number | null;
  stale: boolean;
  observerCount: number;
  lastUnusedAt: number | null;
};

export type IndexResource = ResourceMeta & {
  ids: string[];
};

export type DocumentResource<T = unknown> = ResourceMeta & {
  data: T | undefined;
};

export type CachedPullRequest = AzureDevOpsPullRequest &
  Partial<Omit<AzureDevOpsPullRequestDetails, keyof AzureDevOpsPullRequest>>;

export type CachedTask = Task & {
  projectName?: string;
  projectColor?: string;
  projectPriority?: ProjectPriority;
  projectLogoPath?: string | null;
};

export type CacheState = {
  projects: Record<string, Project>;
  tasks: Record<string, CachedTask>;
  steps: Record<string, TaskStep>;
  providers: Record<string, Provider>;
  tokens: Record<string, Token>;
  pullRequests: Record<string, CachedPullRequest>;
  workItems: Record<string, unknown>;
  feedNotes: Record<string, FeedNote>;
  indexes: Record<string, IndexResource>;
  documents: Record<string, DocumentResource>;
  resources: Record<string, ResourceMeta>;
};

export type ResourceResult<T> = {
  data: T | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export type MutationResult<TVariables, TResult> = {
  mutate: (
    variables: TVariables,
    options?: {
      onSuccess?: (result: TResult) => void;
      onError?: (error: Error) => void;
    },
  ) => void;
  mutateAsync: (variables: TVariables) => Promise<TResult>;
  isPending: boolean;
  error: Error | null;
};
