export function isPromiseLike(
  value: unknown,
): value is PromiseLike<unknown> | Promise<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}
