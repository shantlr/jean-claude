// Azure DevOps Pull Request types

// Policy evaluation types (PR checks / build validation)
export interface AzureDevOpsPolicyEvaluation {
  evaluationId: string;
  status:
    | 'approved'
    | 'rejected'
    | 'running'
    | 'queued'
    | 'notApplicable'
    | 'broken';
  isBlocking: boolean;
  configuration: {
    id: number;
    isEnabled: boolean;
    isBlocking: boolean;
    type: {
      id: string;
      displayName: string;
    };
    settings: {
      buildDefinitionId?: number;
      displayName?: string;
      minimumApproverCount?: number;
      [key: string]: unknown;
    };
  };
  context?: {
    buildId?: number;
    buildDefinitionId?: number;
    isExpired?: boolean;
  };
}

export type ReviewerVoteStatus =
  | 'approved'
  | 'approved-with-suggestions'
  | 'waiting'
  | 'rejected'
  | 'none';

export interface AzureDevOpsPullRequest {
  id: number;
  title: string;
  status: 'active' | 'completed' | 'abandoned';
  isDraft: boolean;
  createdBy: {
    id: string;
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  creationDate: string;
  sourceRefName: string; // refs/heads/feature-branch
  targetRefName: string; // refs/heads/main
  url: string; // Web URL to PR
  mergeStatus?: 'succeeded' | 'conflicts' | 'failure' | 'notSet';
  reviewers: Array<{
    id: string;
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
    voteStatus: ReviewerVoteStatus;
    isContainer?: boolean; // true if this is a group, false/undefined if user
  }>;
}

export interface AzureDevOpsPullRequestDetails extends AzureDevOpsPullRequest {
  description: string;
  autoCompleteSetBy?: {
    displayName: string;
    id: string;
  };
  completionOptions?: {
    mergeStrategy: 'noFastForward' | 'squash' | 'rebase' | 'rebaseMerge';
    deleteSourceBranch: boolean;
    transitionWorkItems: boolean;
    mergeCommitMessage?: string;
    autoCompleteIgnoreConfigIds?: number[];
  };
}

export interface AzureDevOpsCommit {
  commitId: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  comment: string;
  url: string;
}

export interface AzureDevOpsFileChange {
  path: string;
  changeType: 'add' | 'edit' | 'delete' | 'rename';
  originalPath?: string; // For renames
}

export interface AzureDevOpsIdentity {
  id: string;
  displayName: string;
  uniqueName?: string;
}

export interface AzureDevOpsComment {
  id: number;
  parentCommentId?: number;
  content: string;
  commentType: 'text' | 'codeChange' | 'system' | 'unknown';
  author: {
    id?: string;
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  publishedDate: string;
  lastUpdatedDate: string;
}

export interface AzureDevOpsCommentThread {
  id: number;
  status:
    | 'active'
    | 'fixed'
    | 'wontFix'
    | 'closed'
    | 'byDesign'
    | 'pending'
    | 'unknown';
  threadContext?: {
    filePath: string;
    rightFileStart?: { line: number };
    rightFileEnd?: { line: number };
  };
  comments: AzureDevOpsComment[];
  isDeleted: boolean;
}
