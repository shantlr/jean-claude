import clsx from 'clsx';
import { Wand2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function SkillRow({
  label,
  isActive,
  isEnabled = true,
  suffix,
  onClick,
}: {
  label: string;
  isActive: boolean;
  isEnabled?: boolean;
  suffix?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
        isActive
          ? 'border-acc bg-acc-soft text-ink-0 border-l-2 font-medium'
          : 'text-ink-2 hover:bg-glass-light hover:text-ink-1 border-l-2 border-transparent',
      )}
    >
      <Wand2
        size={14}
        className={clsx('shrink-0', isEnabled ? 'text-acc-ink' : 'text-ink-4')}
      />
      <span className="truncate">{label}</span>
      {suffix}
    </button>
  );
}

export function GroupHeader({
  label,
  accent = false,
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={clsx(
        'px-3 pt-3 pb-1 font-mono text-[10px] font-semibold tracking-wider uppercase',
        accent ? 'text-acc' : 'text-ink-3',
      )}
    >
      {label}
    </div>
  );
}
