import { startTransition, useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';

const DEBOUNCE_MS = 300;
const MIN_INPUT_LENGTH = 10;

// --- FIM completion cache (shared across all hook instances) ---
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  result: string;
  timestamp: number;
}

const completionCache = new Map<string, CacheEntry>();

function makeCacheKey(
  prompt: string,
  suffix: string,
  projectId: string | undefined,
  contextBeforePrompt: string | undefined,
): string {
  // JSON.stringify avoids collisions from inputs containing the separator
  return JSON.stringify([
    projectId ?? '',
    contextBeforePrompt ?? '',
    prompt,
    suffix,
  ]);
}

function getCached(key: string): string | null {
  const entry = completionCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    completionCache.delete(key);
    return null;
  }

  // Move to end (most recently used) by re-inserting
  completionCache.delete(key);
  completionCache.set(key, entry);
  return entry.result;
}

function setCached(key: string, result: string): void {
  // Evict oldest entries if at capacity
  if (completionCache.size >= CACHE_MAX_SIZE) {
    // Map iteration order = insertion order, so first key is oldest
    const oldest = completionCache.keys().next().value;
    if (oldest !== undefined) {
      completionCache.delete(oldest);
    }
  }

  completionCache.set(key, { result, timestamp: Date.now() });
}

// Exported for testing or manual invalidation
export function clearCompletionCache(): void {
  completionCache.clear();
}

export function useInlineCompletion({
  text,
  cursorPosition,
  triggerId,
  enabled,
  projectId,
  getContextBeforePrompt,
}: {
  text: string;
  cursorPosition: number;
  triggerId: number;
  enabled: boolean;
  projectId?: string;
  getContextBeforePrompt?: () => string;
}) {
  const [completion, setCompletion] = useState<string | null>(null);
  const [completionPosition, setCompletionPosition] = useState<number | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getContextBeforePromptRef = useRef(getContextBeforePrompt);
  const textRef = useRef(text);
  const cursorPositionRef = useRef(cursorPosition);

  useEffect(() => {
    getContextBeforePromptRef.current = getContextBeforePrompt;
  }, [getContextBeforePrompt]);

  useEffect(() => {
    textRef.current = text;
    cursorPositionRef.current = cursorPosition;
  }, [text, cursorPosition]);

  // Clear completion and debounce a new request only after typing.
  useEffect(() => {
    startTransition(() => setCompletion(null));
    startTransition(() => setCompletionPosition(null));

    const currentText = textRef.current;
    const currentCursorPosition = cursorPositionRef.current;
    const safeCursorPosition = Math.min(
      Math.max(currentCursorPosition, 0),
      currentText.length,
    );
    const prompt = currentText.slice(0, safeCursorPosition);
    const suffix = currentText.slice(safeCursorPosition);

    if (!enabled || triggerId === 0 || prompt.length < MIN_INPUT_LENGTH) {
      // Invalidate any in-flight request
      requestIdRef.current++;
      setIsLoading(false);
      return;
    }

    // Don't trigger if text starts with / (slash command)
    if (currentText.startsWith('/')) {
      requestIdRef.current++;
      setIsLoading(false);
      return;
    }

    // Increment request ID to invalidate any in-flight request
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);

    debounceTimerRef.current = setTimeout(async () => {
      const contextBeforePrompt = getContextBeforePromptRef.current?.();
      const cacheKey = makeCacheKey(
        prompt,
        suffix,
        projectId,
        contextBeforePrompt,
      );

      // Check cache first — skip IPC + API call entirely
      const cached = getCached(cacheKey);
      if (cached !== null) {
        if (requestIdRef.current === currentRequestId) {
          setCompletion(cached);
          setCompletionPosition(safeCursorPosition);
          setIsLoading(false);
        }
        return;
      }

      const result = await api.completion.complete({
        prompt,
        suffix,
        projectId,
        contextBeforePrompt,
      });

      // Only apply if this is still the latest request
      if (requestIdRef.current === currentRequestId) {
        if (result) {
          setCached(cacheKey, result);
          setCompletion(result);
          setCompletionPosition(safeCursorPosition);
        }
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [triggerId, enabled, projectId]);

  const accept = useCallback(() => {
    const current = completion;
    setCompletion(null);
    setCompletionPosition(null);
    return current;
  }, [completion]);

  const dismiss = useCallback(() => {
    setCompletion(null);
    setCompletionPosition(null);
    // Invalidate any in-flight request so a stale result doesn't appear
    requestIdRef.current++;
    setIsLoading(false);
  }, []);

  return { completion, completionPosition, isLoading, accept, dismiss };
}
