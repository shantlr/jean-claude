import {
  ChevronDown,
  ChevronRight,
  FileText,
  FlaskConical,
  Loader2,
  MessagesSquare,
} from 'lucide-react';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';


import { Dropdown, DropdownItem } from '@/common/ui/dropdown';
import {
  useAddWorkItemComment,
  useRelatedTestCases,
  useUpdateWorkItemState,
  useWorkItemComments,
  useWorkItemStates,
} from '@/hooks/use-work-items';
import type { AzureDevOpsWorkItem } from '@/lib/api';
import { AzureHtmlContent } from '@/features/common/ui-azure-html-content';
import { Kbd } from '@/common/ui/kbd';



import { WorkItemComments } from '../ui-work-item-comments';
type DetailsTab = 'content' | 'comments' | 'test-cases';

export function WorkItemPreview({
  workItem,
  providerId,
  projectName,
  showCommentsAside = false,
  readOnly = false,
}: {
  workItem: AzureDevOpsWorkItem | null;
  providerId?: string;
  projectName?: string;
  showCommentsAside?: boolean;
  readOnly?: boolean;
}) {
  const workItemId = workItem?.id ?? null;
  const {
    data: comments = [],
    isLoading: isLoadingComments,
    error: commentsError,
  } = useWorkItemComments({
    providerId: providerId ?? null,
    projectName: projectName ?? null,
    workItemIds: workItemId ? [workItemId] : [],
  });

  const { data: relatedTestCases = [], isLoading: isLoadingTestCases } =
    useRelatedTestCases({
      providerId: providerId ?? null,
      projectName: projectName ?? null,
      workItemId,
    });
  const { data: availableStates = [], isLoading: isLoadingStates } =
    useWorkItemStates({
      providerId: providerId ?? null,
      projectName: projectName ?? null,
      workItemType: workItem?.fields.workItemType ?? null,
    });
  const addComment = useAddWorkItemComment();
  const updateState = useUpdateWorkItemState();

  const hasTestCases = isLoadingTestCases || relatedTestCases.length > 0;
  const [activeTab, setActiveTab] = useState<DetailsTab>('content');
  const [currentState, setCurrentState] = useState(
    workItem?.fields.state ?? '',
  );
  const workItemIdRef = useRef(workItemId);

  useEffect(() => {
    if (!hasTestCases && activeTab === 'test-cases') {
      startTransition(() => setActiveTab('content'));
    }
    if (showCommentsAside && activeTab === 'comments') {
      startTransition(() => setActiveTab('content'));
    }
  }, [hasTestCases, activeTab, showCommentsAside]);

  useEffect(() => {
    startTransition(() => setCurrentState(workItem?.fields.state ?? ''));
    workItemIdRef.current = workItem?.id ?? null;
  }, [workItem?.id, workItem?.fields.state]);

  if (!workItem) {
    return (
      <div className="flex h-full min-h-37.5 items-center justify-center">
        <p className="text-ink-3 text-sm">Select a work item to see details</p>
      </div>
    );
  }

  const { id, fields } = workItem;
  const { workItemType, assignedTo } = fields;
  const hasReproSteps = workItemType === 'Bug' && !!fields.reproSteps;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-glass-border flex gap-0 border-b">
        <TabButton
          active={activeTab === 'content'}
          onClick={() => setActiveTab('content')}
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Content"
        />
        {!showCommentsAside && (
          <TabButton
            active={activeTab === 'comments'}
            onClick={() => setActiveTab('comments')}
            icon={<MessagesSquare className="h-3.5 w-3.5" />}
            label="Comments"
            count={comments.length}
          />
        )}
        {hasTestCases && (
          <TabButton
            active={activeTab === 'test-cases'}
            onClick={() => setActiveTab('test-cases')}
            icon={<FlaskConical className="h-3.5 w-3.5" />}
            label="Test Cases"
            count={relatedTestCases.length}
          />
        )}
        <span className="text-ink-3 ml-auto flex items-center gap-1 text-xs">
          <Kbd shortcut="cmd+shift+o" /> open
        </span>
      </div>

      <div
        className={`mt-3 grid min-h-0 flex-1 gap-4 overflow-hidden ${
          showCommentsAside
            ? 'xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]'
            : 'grid-cols-1'
        }`}
      >
        <div className="min-h-0 overflow-y-auto">
          {activeTab === 'content' && (
            <div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-ink-3">Assigned:</span>
                  <span className="text-ink-1">
                    {assignedTo ?? 'Unassigned'}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-ink-3">State:</span>
                  {providerId && !readOnly ? (
                    <EditableStateValue
                      state={currentState}
                      states={availableStates.map((s) => s.name)}
                      isPending={updateState.isPending}
                      isLoading={isLoadingStates}
                      onChange={(nextState) => {
                        const previousState = currentState;
                        setCurrentState(nextState);
                        updateState.mutate(
                          { providerId, workItemId: id, state: nextState },
                          {
                            onError: () => {
                              if (workItemIdRef.current === id) {
                                setCurrentState(previousState);
                              }
                            },
                          },
                        );
                      }}
                    />
                  ) : (
                    <span className="text-ink-1">{currentState}</span>
                  )}
                </div>
              </div>

              {(fields.description || hasReproSteps) && (
                <div className="border-glass-border my-3 border-t" />
              )}

              {fields.description && (
                <AzureHtmlContent
                  html={fields.description}
                  providerId={providerId}
                  className="text-ink-2 text-xs"
                  imageClassName="max-h-72 w-auto object-contain"
                  enableImageModal
                />
              )}

              {hasReproSteps && (
                <div className={fields.description ? 'mt-4' : undefined}>
                  <h4 className="text-ink-1 mb-1.5 text-xs font-medium">
                    Repro Steps
                  </h4>
                  <AzureHtmlContent
                    html={fields.reproSteps!}
                    providerId={providerId}
                    className="text-ink-2 text-xs"
                    imageClassName="max-h-72 w-auto object-contain"
                    enableImageModal
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <WorkItemComments
              comments={comments}
              isLoading={isLoadingComments}
              error={
                commentsError instanceof Error ? commentsError.message : null
              }
              providerId={providerId}
              hideHeader
              isAddingComment={addComment.isPending}
              onAddComment={
                providerId && projectName && !readOnly
                  ? (text) =>
                      addComment.mutateAsync({
                        providerId,
                        projectName,
                        workItemId: id,
                        text,
                      })
                  : undefined
              }
            />
          )}

          {activeTab === 'test-cases' && (
            <div className="flex flex-col gap-1 pb-2">
              {isLoadingTestCases ? (
                <p className="text-ink-3 text-xs">Loading test cases...</p>
              ) : (
                relatedTestCases.map((tc) => (
                  <ExpandableTestCase
                    key={tc.id}
                    testCase={tc}
                    providerId={providerId}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {showCommentsAside && (
          <aside className="border-glass-border flex min-h-0 flex-col border-t pt-3 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4">
            <div className="text-ink-1 mb-2 flex shrink-0 items-center gap-1.5 text-xs font-medium">
              <MessagesSquare className="h-3.5 w-3.5" />
              Comments
              <span className="text-ink-3 font-normal">
                ({comments.length})
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <WorkItemComments
                comments={comments}
                isLoading={isLoadingComments}
                error={
                  commentsError instanceof Error ? commentsError.message : null
                }
                providerId={providerId}
                hideHeader
                isAddingComment={addComment.isPending}
                onAddComment={
                  providerId && projectName && !readOnly
                    ? (text) =>
                        addComment.mutateAsync({
                          providerId,
                          projectName,
                          workItemId: id,
                          text,
                        })
                    : undefined
                }
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function EditableStateValue({
  state,
  states: availableStates,
  isPending,
  isLoading,
  onChange,
}: {
  state: string;
  states: string[];
  isPending: boolean;
  isLoading: boolean;
  onChange: (state: string) => void;
}) {
  const dropdownRef = useRef<{ toggle: () => void } | null>(null);
  const states = availableStates.includes(state)
    ? availableStates
    : [state, ...availableStates];

  const handleSelect = useCallback(
    (nextState: string) => {
      dropdownRef.current?.toggle();
      if (nextState !== state) onChange(nextState);
    },
    [onChange, state],
  );

  return (
    <Dropdown
      dropdownRef={dropdownRef}
      trigger={
        <button
          type="button"
          disabled={isPending || states.length <= 1}
          className="text-ink-1 hover:text-acc-ink flex items-center gap-1 rounded px-1 py-0.5 text-xs transition-colors disabled:opacity-60"
        >
          {(isPending || isLoading) && (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          {state}
          {states.length > 1 && <ChevronDown className="h-3 w-3 opacity-60" />}
        </button>
      }
    >
      {states.map((nextState) => (
        <DropdownItem
          key={nextState}
          onClick={() => handleSelect(nextState)}
          checked={nextState === state}
        >
          {nextState}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

function ExpandableTestCase({
  testCase,
  providerId,
}: {
  testCase: AzureDevOpsWorkItem;
  providerId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const description = testCase.fields.description || testCase.fields.reproSteps;
  const hasSteps = testCase.testSteps && testCase.testSteps.length > 0;
  const hasContent = !!description || hasSteps;

  return (
    <div
      className="rounded-md border"
      style={{
        borderColor: 'oklch(1 0 0 / 0.06)',
        background: 'oklch(1 0 0 / 0.02)',
      }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={`text-ink-3 h-3 w-3 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-purple-400" />
        <span className="text-ink-2 text-xs font-medium">#{testCase.id}</span>
        <span className="text-ink-1 min-w-0 truncate text-xs">
          {testCase.fields.title}
        </span>
        <span className="text-ink-3 ml-auto shrink-0 text-[11px]">
          {testCase.fields.state}
        </span>
      </button>
      {expanded && (
        <div
          className="border-t px-3 py-2"
          style={{ borderColor: 'oklch(1 0 0 / 0.06)' }}
        >
          {description && (
            <AzureHtmlContent
              html={description}
              providerId={providerId}
              className="text-ink-2 text-xs"
            />
          )}
          {hasSteps && (
            <div className="mt-1">
              {testCase.testSteps!.map((step, i) => (
                <div
                  key={i}
                  className="border-b py-1.5 last:border-b-0"
                  style={{ borderColor: 'oklch(1 0 0 / 0.04)' }}
                >
                  <div className="flex gap-2">
                    <span className="text-ink-3 w-4 shrink-0 text-[10px]">
                      {i + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <AzureHtmlContent
                        html={step.action}
                        providerId={providerId}
                        className="text-ink-1 text-xs"
                      />
                      {step.expectedResult && (
                        <div className="text-ink-3 mt-0.5">
                          <span className="text-[10px] font-medium">
                            Expected:{' '}
                          </span>
                          <AzureHtmlContent
                            html={step.expectedResult}
                            providerId={providerId}
                            className="text-ink-3 inline text-xs"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!hasContent && (
            <p className="text-ink-3 text-xs italic">No description.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-accent-1 text-ink-1'
          : 'text-ink-3 hover:text-ink-2 border-transparent'
      }`}
    >
      {icon}
      {label}
      {count != null && count > 0 && (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] ${
            active ? 'bg-accent-1/10 text-accent-1' : 'bg-ink-4/20 text-ink-3'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
