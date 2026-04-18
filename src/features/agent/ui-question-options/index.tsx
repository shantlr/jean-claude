import { HelpCircle, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { Textarea } from '@/common/ui/textarea';
import type { QuestionResponse, AgentQuestion } from '@shared/agent-types';

function QuestionInput({
  question,
  questionIndex,
  value,
  isOtherOpen,
  isActive,
  activeOptionIndex,
  onActivate,
  onSelectOption,
  onOtherChange,
}: {
  question: AgentQuestion;
  questionIndex: number;
  value: string;
  isOtherOpen: boolean;
  isActive: boolean;
  activeOptionIndex: number;
  onActivate: (params: { questionIndex: number; optionIndex: number }) => void;
  onSelectOption: (params: {
    questionIndex: number;
    optionIndex: number;
  }) => void;
  onOtherChange: (params: { questionIndex: number; value: string }) => void;
}) {
  const selectedLabels = value
    .split(', ')
    .map((label) => label.trim())
    .filter(Boolean);
  const optionCount = question.options.length + (question.multiSelect ? 0 : 1);

  if (question.multiSelect) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {question.options.map((option, index) => {
            return (
              <Button
                key={option.label}
                onFocus={() => {
                  onActivate({ questionIndex, optionIndex: index });
                }}
                onClick={() => {
                  onActivate({ questionIndex, optionIndex: index });
                  onSelectOption({ questionIndex, optionIndex: index });
                }}
                className={`focus-visible:ring-acc rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                  selectedLabels.includes(option.label)
                    ? 'bg-acc text-white'
                    : isActive && activeOptionIndex === index
                      ? 'bg-bg-3 text-ink-0'
                      : 'bg-glass-medium text-ink-1 hover:bg-bg-3'
                }`}
                title={option.description}
              >
                <div className="font-medium">{option.label}</div>
                {option.description ? (
                  <div className="mt-0.5 text-xs leading-tight text-current/80">
                    {option.description}
                  </div>
                ) : null}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {question.options.map((option, index) => (
          <Button
            key={option.label}
            onFocus={() => {
              onActivate({ questionIndex, optionIndex: index });
            }}
            onClick={() => {
              onActivate({ questionIndex, optionIndex: index });
              onSelectOption({ questionIndex, optionIndex: index });
            }}
            className={`focus-visible:ring-acc rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none ${
              value === option.label && !isOtherOpen
                ? 'bg-acc text-white'
                : isActive && activeOptionIndex === index
                  ? 'bg-bg-3 text-ink-0'
                  : 'bg-glass-medium text-ink-1 hover:bg-bg-3'
            }`}
            title={option.description}
          >
            <div className="font-medium">{option.label}</div>
            {option.description ? (
              <div className="mt-0.5 text-xs leading-tight text-current/80">
                {option.description}
              </div>
            ) : null}
          </Button>
        ))}
        <Button
          onFocus={() => {
            onActivate({ questionIndex, optionIndex: optionCount - 1 });
          }}
          onClick={() => {
            onActivate({ questionIndex, optionIndex: optionCount - 1 });
            onSelectOption({ questionIndex, optionIndex: optionCount - 1 });
          }}
          className={`focus-visible:ring-acc rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none ${
            isOtherOpen
              ? 'bg-acc text-white'
              : isActive && activeOptionIndex === optionCount - 1
                ? 'bg-bg-3 text-ink-0'
                : 'bg-glass-medium text-ink-1 hover:bg-bg-3'
          }`}
        >
          <div className="font-medium">Other</div>
          <div className="mt-0.5 text-xs leading-tight text-current/80">
            Enter a custom answer
          </div>
        </Button>
      </div>
      {isOtherOpen && (
        <Textarea
          value={value}
          onFocus={() => {
            onActivate({ questionIndex, optionIndex: optionCount - 1 });
          }}
          onChange={(e) =>
            onOtherChange({ questionIndex, value: e.currentTarget.value })
          }
          placeholder="Enter your answer..."
          size="sm"
          rows={3}
          autoFocus
        />
      )}
    </div>
  );
}

export function QuestionOptions({
  request,
  onRespond,
}: {
  request: {
    taskId: string;
    requestId: string;
    questions: AgentQuestion[];
  };
  onRespond: (
    requestId: string,
    response: QuestionResponse,
  ) => void | Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [otherOpenByQuestion, setOtherOpenByQuestion] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (request.questions.length === 0) {
      setActiveQuestionIndex(0);
      setActiveOptionIndex(0);
      return;
    }

    setActiveQuestionIndex((current) => {
      if (current < request.questions.length) {
        return current;
      }
      return 0;
    });
  }, [request.questions]);

  const getOptionCount = useCallback((question: AgentQuestion) => {
    return question.options.length + (question.multiSelect ? 0 : 1);
  }, []);

  useEffect(() => {
    const question = request.questions[activeQuestionIndex];
    if (!question) return;
    const optionCount = getOptionCount(question);
    setActiveOptionIndex((current) => {
      if (optionCount === 0) return 0;
      if (current < optionCount) return current;
      return 0;
    });
  }, [activeQuestionIndex, getOptionCount, request.questions]);

  const activateOption = useCallback(
    ({
      questionIndex,
      optionIndex,
    }: {
      questionIndex: number;
      optionIndex: number;
    }) => {
      setActiveQuestionIndex(questionIndex);
      setActiveOptionIndex(optionIndex);
    },
    [],
  );

  const selectOption = useCallback(
    ({
      questionIndex,
      optionIndex,
    }: {
      questionIndex: number;
      optionIndex: number;
    }) => {
      const question = request.questions[questionIndex];
      if (!question) return false;

      if (question.multiSelect) {
        const label = question.options[optionIndex]?.label;
        if (!label) return false;
        const current = answers[question.question] ?? '';
        const selected = current
          .split(', ')
          .map((item) => item.trim())
          .filter(Boolean);
        const next = selected.includes(label)
          ? selected.filter((item) => item !== label)
          : [...selected, label];
        setAnswers((prev) => ({
          ...prev,
          [question.question]: next.join(', '),
        }));
        return true;
      }

      const isOther = optionIndex === question.options.length;
      setOtherOpenByQuestion((prev) => ({
        ...prev,
        [question.question]: isOther,
      }));

      if (isOther) {
        const current = answers[question.question] ?? '';
        const matchesOption = question.options.some(
          (option) => option.label === current,
        );
        if (matchesOption) {
          setAnswers((prev) => ({ ...prev, [question.question]: '' }));
        }
        return true;
      }

      const label = question.options[optionIndex]?.label;
      if (!label) return false;
      setAnswers((prev) => ({ ...prev, [question.question]: label }));
      return true;
    },
    [answers, request.questions],
  );

  const updateOtherAnswer = useCallback(
    ({ questionIndex, value }: { questionIndex: number; value: string }) => {
      const question = request.questions[questionIndex];
      if (!question) return;
      setAnswers((prev) => ({ ...prev, [question.question]: value }));
      setOtherOpenByQuestion((prev) => ({
        ...prev,
        [question.question]: true,
      }));
    },
    [request.questions],
  );

  const moveActiveOption = useCallback(
    (offset: 1 | -1) => {
      const question = request.questions[activeQuestionIndex];
      if (!question) return false;
      const optionCount = getOptionCount(question);
      if (optionCount === 0) return false;

      setActiveOptionIndex((current) => {
        return (current + offset + optionCount) % optionCount;
      });
      return true;
    },
    [activeQuestionIndex, getOptionCount, request.questions],
  );

  const activateCurrentOption = useCallback(() => {
    return selectOption({
      questionIndex: activeQuestionIndex,
      optionIndex: activeOptionIndex,
    });
  }, [activeOptionIndex, activeQuestionIndex, selectOption]);

  const allAnswered = request.questions.every((q) =>
    answers[q.question]?.trim(),
  );

  const submitAnswers = useCallback(() => {
    if (!allAnswered) return;
    return onRespond(request.requestId, { answers });
  }, [allAnswered, onRespond, request.requestId, answers]);

  const handleSubmit = useCallback(() => {
    if (!allAnswered) return false;
    void submitAnswers();
    return true;
  }, [allAnswered, submitAnswers]);

  useCommands('question-options', [
    {
      label: 'Select Previous Question Option',
      shortcut: ['left', 'up'],
      hideInCommandPalette: true,
      ignoreIfInput: true,
      handler: () => moveActiveOption(-1),
    },
    {
      label: 'Select Next Question Option',
      shortcut: ['right', 'down'],
      hideInCommandPalette: true,
      ignoreIfInput: true,
      handler: () => moveActiveOption(1),
    },
    {
      label: 'Activate Question Option',
      shortcut: 'enter',
      hideInCommandPalette: true,
      ignoreIfInput: true,
      handler: activateCurrentOption,
    },
    {
      label: 'Submit Question Answers',
      shortcut: 'cmd+enter',
      hideInCommandPalette: true,
      handler: handleSubmit,
    },
  ]);

  return (
    <div className="border border-teal-700/50 bg-teal-900/20 px-4 py-3">
      <div className="space-y-4">
        {request.questions.map((question, index) => (
          <div key={`${index}-${question.question}`} className="space-y-2">
            <div className="flex items-start gap-2">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
              <div className="text-sm font-medium text-teal-300">
                {request.questions.length > 1 ? `${index + 1}. ` : ''}
                {question.question}
              </div>
            </div>
            <div className="pl-6">
              <QuestionInput
                question={question}
                questionIndex={index}
                value={answers[question.question] || ''}
                isOtherOpen={otherOpenByQuestion[question.question] ?? false}
                isActive={activeQuestionIndex === index}
                activeOptionIndex={
                  activeQuestionIndex === index ? activeOptionIndex : 0
                }
                onActivate={activateOption}
                onSelectOption={selectOption}
                onOtherChange={updateOtherAnswer}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          onClick={submitAnswers}
          disabled={!allAnswered}
          variant="primary"
          size="md"
          icon={<Send />}
          className="bg-teal-600 hover:bg-teal-500"
        >
          Submit
          <Kbd shortcut="cmd+enter" />
        </Button>
      </div>
    </div>
  );
}
