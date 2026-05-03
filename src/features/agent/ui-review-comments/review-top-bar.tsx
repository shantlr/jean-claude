import { Check, MessageSquare } from 'lucide-react';

export function ReviewSubmitBar({
  commentCount,
  onSubmit,
}: {
  commentCount: number;
  onSubmit: () => void;
}) {
  if (commentCount === 0) return null;

  return (
    <div className="border-line bg-bg-0 flex h-9 shrink-0 items-center gap-2 border-b px-3">
      <MessageSquare className="text-acc-ink h-3.5 w-3.5" />
      <span className="text-ink-2 text-xs">
        {commentCount} review comment{commentCount !== 1 ? 's' : ''} pending
      </span>
      <div className="flex-1" />
      <button
        onClick={onSubmit}
        className="bg-acc inline-flex items-center gap-1.5 rounded px-3 py-1 text-[11.5px] font-medium text-white"
      >
        Submit review
        <span className="rounded-full bg-white/20 px-1.5 font-mono text-[10px]">
          {commentCount}
        </span>
        <kbd className="ml-0.5 font-mono text-[10px] opacity-70">⌘↵</kbd>
      </button>
    </div>
  );
}

export function AgentWorkingBanner({
  total,
  done,
}: {
  total: number;
  done: number;
}) {
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <div className="bg-status-run-soft border-line flex h-9 shrink-0 items-center gap-2.5 border-b px-4">
      <span className="bg-status-run h-2 w-2 animate-pulse rounded-full" />
      <span className="text-ink-1 text-xs font-medium">
        Agent working on review
      </span>
      <span className="text-ink-3 text-[11.5px]">
        Addressing {total} comments {'\u2014'} {done}/{total} done
      </span>
      <div className="flex-1" />
      <div className="bg-bg-3 h-1 w-40 overflow-hidden rounded-full">
        <div
          className="bg-status-run h-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ResolvedBanner({
  total,
  addressedCount,
  onResolveAllAddressed,
  onSubmitFollowUp,
}: {
  total: number;
  addressedCount: number;
  onResolveAllAddressed: () => void;
  onSubmitFollowUp: () => void;
}) {
  return (
    <div className="bg-bg-1 border-line flex h-9 shrink-0 items-center gap-2.5 border-b px-4">
      <Check className="text-status-done h-3 w-3" strokeWidth={2.5} />
      <span className="text-ink-1 text-xs font-medium">Step complete</span>
      <span className="text-ink-3 text-[11.5px]">
        {addressedCount} of {total} comments addressed {'\u2014'} review the
        changes and resolve each thread.
      </span>
      <div className="flex-1" />
      <button
        onClick={onResolveAllAddressed}
        className="border-line bg-bg-2 text-ink-1 rounded border px-2.5 py-0.5 text-[11.5px]"
      >
        Resolve all addressed
      </button>
      <button
        onClick={onSubmitFollowUp}
        className="border-acc-line bg-acc-soft text-acc-ink rounded border px-2.5 py-0.5 text-[11.5px]"
      >
        Submit follow-up review
      </button>
    </div>
  );
}
