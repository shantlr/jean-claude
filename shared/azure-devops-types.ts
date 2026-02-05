// Azure DevOps Pull Request types

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
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  creationDate: string;
  sourceRefName: string; // refs/heads/feature-branch
  targetRefName: string; // refs/heads/main
  url: string; // Web URL to PR
  reviewers: Array<{
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
    voteStatus: ReviewerVoteStatus;
    isContainer?: boolean; // true if this is a group, false/undefined if user
  }>;
}

export interface AzureDevOpsPullRequestDetails extends AzureDevOpsPullRequest {
  description: string;
  mergeStatus?: 'succeeded' | 'conflicts' | 'failure' | 'notSet';
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

export interface AzureDevOpsComment {
  id: number;
  parentCommentId?: number;
  content: string;
  commentType: 'text' | 'codeChange' | 'system' | 'unknown';
  author: {
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
