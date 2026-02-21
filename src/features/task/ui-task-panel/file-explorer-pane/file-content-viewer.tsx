import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { codeToHtml } from 'shiki';

const api = window.api;

export function FileContentViewer({ filePath }: { filePath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');

  const { data: fileData, isLoading } = useQuery({
    queryKey: ['file-content', filePath],
    queryFn: () => api.fs.readFile(filePath),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!fileData) {
      setHighlightedHtml('');
      return;
    }

    let cancelled = false;
    const highlight = async () => {
      try {
        let html: string;
        try {
          html = await codeToHtml(fileData.content, {
            lang: fileData.language || 'text',
            theme: 'github-dark',
          });
        } catch {
          html = await codeToHtml(fileData.content, {
            lang: 'text',
            theme: 'github-dark',
          });
        }
        if (!cancelled) setHighlightedHtml(html);
      } catch {
        if (!cancelled) setHighlightedHtml('');
      }
    };
    highlight();
    return () => {
      cancelled = true;
    };
  }, [fileData]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!fileData) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Unable to read file
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-xs">
      {/* Content */}
      <div ref={containerRef} className="relative flex-1 overflow-auto">
        {highlightedHtml ? (
          <div
            className="min-w-fit [&_pre]:!bg-transparent [&_pre]:p-4"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="p-4 text-neutral-300">{fileData.content}</pre>
        )}
      </div>
    </div>
  );
}
