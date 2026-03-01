import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';

const DEBOUNCE_MS = 300;
const MIN_INPUT_LENGTH = 10;

export function useInlineCompletion({
  text,
  enabled,
  projectId,
}: {
  text: string;
  enabled: boolean;
  projectId?: string;
}) {
  const [completion, setCompletion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear completion and debounce a new request when text changes
  useEffect(() => {
    setCompletion(null);

    if (!enabled || text.length < MIN_INPUT_LENGTH) {
      // Invalidate any in-flight request
      requestIdRef.current++;
      setIsLoading(false);
      return;
    }

    // Don't trigger if text starts with / (slash command)
    if (text.startsWith('/')) {
      requestIdRef.current++;
      setIsLoading(false);
      return;
    }

    // Increment request ID to invalidate any in-flight request
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);

    debounceTimerRef.current = setTimeout(async () => {
      // Always complete from the end of the text — cursor position is ignored
      const result = await api.completion.complete({
        prompt: text,
        projectId,
      });

      // Only apply if this is still the latest request
      if (requestIdRef.current === currentRequestId) {
        if (result) {
          setCompletion(result);
        }
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [text, enabled, projectId]);

  const accept = useCallback(() => {
    const current = completion;
    setCompletion(null);
    return current;
  }, [completion]);

  const dismiss = useCallback(() => {
    setCompletion(null);
    // Invalidate any in-flight request so a stale result doesn't appear
    requestIdRef.current++;
    setIsLoading(false);
  }, []);

  return { completion, isLoading, accept, dismiss };
}
