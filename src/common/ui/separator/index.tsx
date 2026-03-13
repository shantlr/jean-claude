import clsx from 'clsx';

export function Separator({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return orientation === 'horizontal' ? (
    <div role="separator" className={clsx('separator-h', className)} />
  ) : (
    <div
      role="separator"
      className={clsx('separator-v self-stretch', className)}
    />
  );
}
