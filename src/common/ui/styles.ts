/**
 * Shared sizing and variant definitions for all interactive UI components.
 *
 * Size table:
 * | Property      | xs              | sm              | md              | lg              |
 * |---------------|-----------------|-----------------|-----------------|-----------------|
 * | Height        | auto (~20px)    | h-7 (28px)      | h-8 (32px)      | h-10 (40px)     |
 * | Text          | text-xs         | text-xs         | text-sm         | text-sm         |
 * | Padding-X     | px-2            | px-2            | px-3            | px-4            |
 * | Padding-Y     | py-0.5          | py-1            | py-1.5          | py-2            |
 * | Border radius | rounded         | rounded         | rounded-md      | rounded-lg      |
 * | Icon          | h-3 w-3        | h-3.5 w-3.5     | h-4 w-4         | h-4.5 w-4.5    |
 *
 * Use `xs` for chip-height elements (inline badges, compact header inputs).
 */

export type ComponentSize = 'xs' | 'sm' | 'md' | 'lg';

export const sizeClasses = {
  xs: {
    height: '',
    text: 'text-xs',
    px: 'px-2',
    py: 'py-0.5',
    radius: 'rounded',
    icon: 'h-3 w-3',
    gap: 'gap-1',
    square: 'h-5 w-5',
  },
  sm: {
    height: 'h-7',
    text: 'text-xs',
    px: 'px-2',
    py: 'py-1',
    radius: 'rounded',
    icon: 'h-3.5 w-3.5',
    gap: 'gap-1.5',
    square: 'h-7 w-7',
  },
  md: {
    height: 'h-8',
    text: 'text-sm',
    px: 'px-3',
    py: 'py-1.5',
    radius: 'rounded-md',
    icon: 'h-4 w-4',
    gap: 'gap-2',
    square: 'h-8 w-8',
  },
  lg: {
    height: 'h-10',
    text: 'text-sm',
    px: 'px-4',
    py: 'py-2',
    radius: 'rounded-lg',
    icon: 'h-[18px] w-[18px]',
    gap: 'gap-2',
    square: 'h-10 w-10',
  },
} as const;

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'tab'
  | 'unstyled';

export const buttonVariantClasses: Record<
  ButtonVariant,
  {
    base: string;
    hover: string;
    active: string;
    /** Extra classes applied when the `active` prop is true. */
    selected?: string;
    /** Base classes when NOT selected (only for variants that use `active`). */
    unselected?: string;
  }
> = {
  primary: {
    base: 'bg-acc text-bg-0 border border-transparent',
    hover: 'hover:brightness-110',
    active: 'active:brightness-90',
  },
  secondary: {
    base: 'bg-glass-medium text-ink-1 border border-glass-border',
    hover: 'hover:bg-glass-strong hover:border-glass-border-strong',
    active: 'active:bg-bg-3',
  },
  ghost: {
    base: 'bg-transparent text-ink-2 border border-transparent',
    hover: 'hover:bg-glass-light hover:text-ink-1',
    active: 'active:bg-glass-medium',
  },
  danger: {
    base: 'bg-status-fail text-ink-0 border border-transparent',
    hover: 'hover:brightness-110',
    active: 'active:brightness-90',
  },
  tab: {
    base: 'border border-transparent',
    hover: '',
    active: '',
    selected: 'bg-glass-strong font-medium text-ink-0',
    unselected: 'text-ink-2 hover:bg-glass-light hover:text-ink-1',
  },
  unstyled: {
    base: '',
    hover: '',
    active: '',
  },
} as const;

export const inputBaseClasses =
  'bg-glass-light text-ink-1 placeholder-ink-3 border focus:outline-none transition-colors';

export const inputBorderClasses = {
  normal: 'border-glass-border focus:border-acc-line',
  error: 'border-status-fail focus:border-status-fail',
} as const;

export const checkboxSizeClasses = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
} as const;
