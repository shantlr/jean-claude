import { useTokens } from '@/hooks/use-tokens';
import type { Token } from '@shared/types';

import { TokenCard } from './token-card';

export function TokenList({
  selectedTokenId,
  onSelectToken,
}: {
  selectedTokenId: string | null;
  onSelectToken: (token: Token | null) => void;
}) {
  const { data: tokens = [], isLoading } = useTokens();

  if (isLoading) {
    return (
      <div className="text-ink-3 flex items-center justify-center py-8">
        Loading tokens...
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-ink-2">No tokens configured</p>
        <p className="text-ink-3 mt-1 text-sm">
          Add a token to connect to your git providers
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tokens.map((token) => (
        <TokenCard
          key={token.id}
          token={token}
          isSelected={token.id === selectedTokenId}
          onSelect={() =>
            onSelectToken(token.id === selectedTokenId ? null : token)
          }
        />
      ))}
    </div>
  );
}
