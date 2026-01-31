export interface GlobalPrompt {
  id: string;
  title: string;
  message: string;
  details?: string;
  acceptLabel?: string;
  rejectLabel?: string;
}

export interface GlobalPromptResponse {
  id: string;
  accepted: boolean;
}
