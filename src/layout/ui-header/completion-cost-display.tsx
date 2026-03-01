import { Tooltip } from '@/common/ui/tooltip';
import { useCompletionDailyUsage } from '@/hooks/use-settings';

function formatCost(costUsd: number): string {
  if (costUsd < 0.005) return '$0.00';
  if (costUsd < 0.1) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toFixed(2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

function TooltipContent({
  promptTokens,
  completionTokens,
  requests,
  costUsd,
  inputCostUsd,
  outputCostUsd,
}: {
  promptTokens: number;
  completionTokens: number;
  requests: number;
  costUsd: number;
  inputCostUsd: number;
  outputCostUsd: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="font-medium text-neutral-200">
        Autocomplete Usage (Today)
      </div>
      <div className="space-y-0.5 text-neutral-400">
        <div className="flex items-center justify-between gap-6">
          <span>Requests</span>
          <span className="text-neutral-300">{requests.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Input tokens</span>
          <span className="text-neutral-300">
            {formatTokens(promptTokens)} ({formatCost(inputCostUsd)})
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Output tokens</span>
          <span className="text-neutral-300">
            {formatTokens(completionTokens)} ({formatCost(outputCostUsd)})
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-6 border-t border-neutral-700 pt-1">
          <span className="font-medium text-neutral-200">Total</span>
          <span className="font-medium text-neutral-200">
            {formatCost(costUsd)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CompletionCostDisplay() {
  const { data: usage } = useCompletionDailyUsage();

  // Don't render if autocomplete is disabled (hook handles this) or no data yet
  if (!usage || usage.requests === 0) return null;

  return (
    <Tooltip
      content={
        <TooltipContent
          promptTokens={usage.promptTokens}
          completionTokens={usage.completionTokens}
          requests={usage.requests}
          costUsd={usage.costUsd}
          inputCostUsd={usage.inputCostUsd}
          outputCostUsd={usage.outputCostUsd}
        />
      }
      side="bottom"
    >
      <div className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-neutral-400">
        <span className="text-xs">FIM {formatCost(usage.costUsd)}</span>
      </div>
    </Tooltip>
  );
}
