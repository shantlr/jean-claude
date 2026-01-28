import { X } from 'lucide-react';
import { useState, KeyboardEvent } from 'react';

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
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5">
      {ports.map((port) => (
        <span
          key={port}
          className="flex items-center gap-1 rounded bg-neutral-700 px-2 py-0.5 text-sm"
        >
          {port}
          <button
            type="button"
            onClick={() => removePort(port)}
            className="text-neutral-400 hover:text-neutral-200"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={handleKeyDown}
        onBlur={() => inputValue.trim() && addPort(inputValue)}
        placeholder={ports.length === 0 ? 'Add port...' : ''}
        className="min-w-16 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-neutral-500"
      />
    </div>
  );
}
