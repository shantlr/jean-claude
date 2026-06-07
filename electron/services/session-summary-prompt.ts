export const SESSION_SUMMARY_PROMPT = [
  'Summarize the prior step context for continuation.',
  'Return concise markdown with:',
  '- What was done',
  '- Key decisions',
  '- Files/components touched (if known)',
  '- Open risks or TODOs',
  '',
  'Keep it short and focused for an engineer continuing the task.',
].join('\n');

export const SESSION_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
  },
  required: ['summary'],
} as const;
