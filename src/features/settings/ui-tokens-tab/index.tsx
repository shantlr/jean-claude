import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
import type { Token } from '@shared/types';

import { AddTokenPane } from './add-token-pane';
import { EditTokenPane } from './edit-token-pane';
import { TokenList } from './token-list';

export function TokensTab() {
  const [showAddPane, setShowAddPane] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);

  const showEditPane = selectedToken !== null;

  const handleSelectToken = (token: Token | null) => {
    setSelectedToken(token);
    if (token !== null) {
      setShowAddPane(false);
    }
  };

  const handleShowAddPane = () => {
    setShowAddPane(true);
    setSelectedToken(null);
  };

  return (
    <div className="flex h-full gap-6">
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-200">Tokens</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Manage your Personal Access Tokens for git providers
            </p>
          </div>
          <Button onClick={handleShowAddPane} variant="primary" icon={<Plus />}>
            Add Token
          </Button>
        </div>

        <TokenList
          selectedTokenId={selectedToken?.id ?? null}
          onSelectToken={handleSelectToken}
        />
      </div>

      {showAddPane && <AddTokenPane onClose={() => setShowAddPane(false)} />}

      {showEditPane && (
        <EditTokenPane
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  );
}
