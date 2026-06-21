import { useCallback, useRef, useState } from 'react';

import type { MutationResult } from './cache-types';

type Rollback = (() => void) | void;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function useCacheMutation<TVariables, TResult>({
  mutationFn,
  onMutate,
  onSuccess,
  onError,
}: {
  mutationFn: (variables: TVariables) => Promise<TResult>;
  onMutate?: (variables: TVariables) => Rollback | Promise<Rollback>;
  onSuccess?: (result: TResult, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}): MutationResult<TVariables, TResult> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pendingCountRef = useRef(0);

  const startPending = useCallback(() => {
    pendingCountRef.current += 1;
    setIsPending(true);
  }, []);

  const stopPending = useCallback(() => {
    pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
    setIsPending(pendingCountRef.current > 0);
  }, []);

  const mutateAsync = useCallback(
    async (variables: TVariables) => {
      startPending();
      setError(null);
      let rollback: Rollback = undefined;

      try {
        rollback = await onMutate?.(variables);
        const result = await mutationFn(variables);
        onSuccess?.(result, variables);
        return result;
      } catch (rawError) {
        const nextError = toError(rawError);
        rollback?.();
        onError?.(nextError, variables);
        setError(nextError);
        throw nextError;
      } finally {
        stopPending();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutationFn, onError, onMutate, onSuccess, startPending],
  );

  const mutate = useCallback(
    (
      variables: TVariables,
      options?: {
        onSuccess?: (result: TResult) => void;
        onError?: (error: Error) => void;
      },
    ) => {
      void mutateAsync(variables)
        .then((result) => options?.onSuccess?.(result))
        .catch((nextError: Error) => options?.onError?.(nextError));
    },
    [mutateAsync],
  );

  return {
    mutate,
    mutateAsync,
    isPending,
    error,
  };
}
