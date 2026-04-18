import clsx from 'clsx';
import type { MouseEvent, ReactNode } from 'react';

type ChipSize = 'xs' | 'sm';
type ChipColor =
  | 'neutral'
  | 'green'
  | 'blue'
  | 'orange'
  | 'red'
  | 'purple'
  | 'yellow'
  | 'amber';

const sizeClasses = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
} as const;

const colorClasses: Record<
  ChipColor,
  { bg: string; text: string; hover: string }
> = {
  neutral: {
    bg: 'bg-bg-1',
    text: 'text-ink-2',
    hover: 'hover:bg-glass-medium hover:text-ink-1',
  },
  green: {
    bg: 'bg-green-900/30',
    text: 'text-green-400',
    hover: 'hover:bg-green-900/50 hover:text-green-300',
  },
  blue: {
    bg: 'bg-blue-900/30',
    text: 'text-blue-400',
    hover: 'hover:bg-blue-900/50 hover:text-blue-300',
  },
  orange: {
    bg: 'bg-orange-900/30',
    text: 'text-orange-400',
    hover: 'hover:bg-orange-900/50 hover:text-orange-300',
  },
  red: {
    bg: 'bg-red-900/30',
    text: 'text-red-400',
    hover: 'hover:bg-red-900/50 hover:text-red-300',
  },
  purple: {
    bg: 'bg-purple-900/30',
    text: 'text-purple-400',
    hover: 'hover:bg-purple-900/50 hover:text-purple-300',
  },
  yellow: {
    bg: 'bg-yellow-900/30',
    text: 'text-yellow-400',
    hover: 'hover:bg-yellow-900/50 hover:text-yellow-300',
  },
  amber: {
    bg: 'bg-amber-900/30',
    text: 'text-amber-400',
    hover: 'hover:bg-amber-900/50 hover:text-amber-300',
  },
} as const;

const iconSizeClasses = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3 w-3',
} as const;

export function Chip({
  size = 'sm',
  color = 'neutral',
  pill = false,
  icon,
  onClick,
  disabled,
  title,
  className,
  children,
}: {
  size?: ChipSize;
  color?: ChipColor;
  pill?: boolean;
  icon?: ReactNode;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const c = colorClasses[color];
  const classes = clsx(
    'inline-flex max-w-full items-center gap-1 font-medium',
    sizeClasses[size],
    c.bg,
    c.text,
    pill ? 'rounded-full' : 'rounded',
    onClick && !disabled && c.hover,
    onClick && 'transition-colors',
    disabled && 'cursor-default opacity-50',
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={classes}
      >
        {icon && (
          <span
            className={clsx(
              iconSizeClasses[size],
              'shrink-0 [&>svg]:h-full [&>svg]:w-full',
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 truncate">{children}</span>
      </button>
    );
  }

  return (
    <span title={title} className={classes}>
      {icon && (
        <span
          className={clsx(
            iconSizeClasses[size],
            'shrink-0 [&>svg]:h-full [&>svg]:w-full',
          )}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
