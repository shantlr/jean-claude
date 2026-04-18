import clsx from 'clsx';
import { Bug, BookOpen, CheckSquare, FileText, Check } from 'lucide-react';

const ICON_SIZE = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
} as const;

const CHECKBOX_SIZE = {
  sm: { box: 'h-3.5 w-3.5', check: 'h-2.5 w-2.5' },
  md: { box: 'h-4 w-4', check: 'h-3 w-3' },
} as const;

export function WorkItemTypeIcon({
  type,
  size = 'md',
}: {
  type: string;
  size?: 'sm' | 'md';
}) {
  const s = ICON_SIZE[size];
  switch (type) {
    case 'Bug':
      return <Bug className={clsx(s, 'text-status-fail shrink-0')} />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className={clsx(s, 'text-acc-ink shrink-0')} />;
    case 'Task':
      return <CheckSquare className={clsx(s, 'text-status-done shrink-0')} />;
    default:
      return <FileText className={clsx(s, 'text-ink-2 shrink-0')} />;
  }
}

export function SelectionCheckbox({
  checked,
  size = 'md',
}: {
  checked: boolean;
  size?: 'sm' | 'md';
}) {
  const s = CHECKBOX_SIZE[size];
  return (
    <div
      className={clsx(
        'flex shrink-0 items-center justify-center rounded border',
        s.box,
        checked
          ? 'border-acc bg-acc text-ink-0'
          : 'border-glass-border-strong bg-transparent',
      )}
    >
      {checked ? <Check className={s.check} /> : null}
    </div>
  );
}
