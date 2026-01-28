import { HelpCircle, Send } from 'lucide-react';
import { useState } from 'react';

import type {
  AgentQuestionEvent,
  QuestionResponse,
  AgentQuestion,
} from '../../../../shared/agent-types';

interface QuestionOptionsProps {
  request: AgentQuestionEvent;
  onRespond: (requestId: string, response: QuestionResponse) => void;
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: AgentQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState('');

  const handleOptionClick = (label: string) => {
    setShowOther(false);
    onChange(label);
  };

  const handleOtherClick = () => {
    setShowOther(true);
    onChange(otherText);
  };

  const handleOtherChange = (text: string) => {
    setOtherText(text);
    onChange(text);
  };

  if (question.multiSelect) {
    // For multi-select, we'd need to track multiple selections
    // For simplicity, treating as single select with comma-separated values
    const selectedLabels = value.split(', ').filter(Boolean);

    const toggleOption = (label: string) => {
      const newSelected = selectedLabels.includes(label)
        ? selectedLabels.filter((l) => l !== label)
        : [...selectedLabels, label];
      onChange(newSelected.join(', '));
    };

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <button
              key={option.label}
              onClick={() => toggleOption(option.label)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                selectedLabels.includes(option.label)
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              }`}
              title={option.description}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {question.options.map((option) => (
          <button
            key={option.label}
            onClick={() => handleOptionClick(option.label)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              value === option.label && !showOther
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
        <button
          onClick={handleOtherClick}
          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
            showOther
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
          }`}
        >
          Other
        </button>
      </div>
      {showOther && (
        <textarea
          value={otherText}
          onChange={(e) => handleOtherChange(e.target.value)}
          placeholder="Enter your answer..."
          className="w-full resize-none rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-teal-500 focus:outline-none"
          rows={3}
          autoFocus
        />
      )}
    </div>
  );
}

export function QuestionOptions({ request, onRespond }: QuestionOptionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    onRespond(request.requestId, { answers });
  };

  const allAnswered = request.questions.every((q) =>
    answers[q.question]?.trim(),
  );

  return (
    <div className="border-t border-teal-700/50 bg-teal-900/20 px-4 py-3">
      <div className="mb-3 flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-teal-400" />
        <div className="space-y-2">
          {request.questions.map((q, i) => (
            <div key={i} className="text-sm font-medium text-teal-300">
              {request.questions.length > 1 ? `${i + 1}. ` : ''}
              {q.question}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {request.questions.map((question) => (
          <QuestionInput
            key={question.question}
            question={question}
            value={answers[question.question] || ''}
            onChange={(value) =>
              setAnswers((prev) => ({ ...prev, [question.question]: value }))
            }
          />
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!allAnswered}
          className="flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Submit
        </button>
      </div>
    </div>
  );
}
