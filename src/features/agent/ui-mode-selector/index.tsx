import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

import type { InteractionMode } from '../../../../shared/types';

const MODES: { value: InteractionMode; label: string; description: string }[] = [
  { value: 'ask', label: 'Ask', description: 'All tools require approval' },
  { value: 'auto', label: 'Auto', description: 'All tools auto-approved' },
  { value: 'plan', label: 'Plan', description: 'Planning only, no execution' },
];

interface ModeSelectorProps {
  value: InteractionMode;
  onChange: (mode: InteractionMode) => void;
  disabled?: boolean;
}

export function ModeSelector({ value, onChange, disabled }: ModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedMode = MODES.find((m) => m.value === value) ?? MODES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (mode: InteractionMode) => {
    onChange(mode);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-1 rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-300 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{selectedMode.label}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-56 rounded-md border border-neutral-600 bg-neutral-800 py-1 shadow-lg">
          {MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => handleSelect(mode.value)}
              className={`w-full px-3 py-2 text-left hover:bg-neutral-700 ${
                mode.value === value ? 'bg-neutral-700' : ''
              }`}
            >
              <div className="text-sm font-medium text-neutral-200">{mode.label}</div>
              <div className="text-xs text-neutral-400">{mode.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
