import { X } from 'lucide-react';
import { useState, KeyboardEvent } from 'react';

import { IconButton } from '@/common/ui/icon-button';

export function PortChipInput({
  ports,
  onChange,
}: {
  ports: number[];
  onChange: (ports: number[]) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const addPort = (value: string) => {
    const port = parseInt(value.trim(), 10);
    if (port >= 1 && port <= 65535 && !ports.includes(port)) {
      onChange([...ports, port]);
    }
    setInputValue('');
  };

  const removePort = (port: number) => {
    onChange(ports.filter((p) => p !== port));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addPort(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && ports.length > 0) {
      removePort(ports[ports.length - 1]);
    }
  };

  return (
    <div className="border-glass-border bg-bg-1 flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
      {ports.map((port) => (
        <span
          key={port}
          className="bg-glass-medium text-ink-0 flex items-center gap-1 rounded px-2 py-0.5 text-sm"
        >
          {port}
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => removePort(port)}
            icon={<X />}
            className="!h-4 !w-4"
          />
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={handleKeyDown}
        onBlur={() => inputValue.trim() && addPort(inputValue)}
        placeholder={ports.length === 0 ? 'Add port...' : ''}
        className="text-ink-0 placeholder:text-ink-3 min-w-16 flex-1 border-none bg-transparent text-sm outline-none"
      />
    </div>
  );
}
