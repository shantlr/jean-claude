import type { AgentBackendType } from './agent-backend-types';
import type { AiSkillSlotsSetting } from './types';

export type VerificationWorkItem = {
  id: number;
  title: string;
  workItemType: string;
  state: string;
  description?: string;
  reproSteps?: string;
};

export type VerificationTestCase = {
  id: number;
  title: string;
  steps?: Array<{ action: string; expectedResult: string }>;
};

export type CreateWorkItemVerificationNoteParams = {
  backend: AgentBackendType;
  model: string;
  projectAiSkillSlots?: AiSkillSlotsSetting | null;
  workItems: VerificationWorkItem[];
  testCasesByWorkItem: Record<number, VerificationTestCase[]>;
};
