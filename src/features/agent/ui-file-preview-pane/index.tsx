import { X, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

import { api } from '@/lib/api';

export function FilePreviewPane({
  filePath,
  projectPath,
  lineStart,
  lineEnd,
  onClose,
}: {
  filePath: string;
  projectPath: string;
  lineStart?: number;
  lineEnd?: number;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [html, setHtml] = useState<string>('');
  const [language, setLanguage] = useState<string>('text');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Resolve full path
  const fullPath = filePath.startsWith('/')
    ? filePath
    : `${projectPath}/${filePath}`;

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    api.fs
      .readFile(fullPath)
      .then((result) => {
        if (result) {
          setContent(result.content);
          setLanguage(result.language);
        } else {
          setError('File not found');
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to read file');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [fullPath]);

  // Syntax highlighting
  useEffect(() => {
    if (!content) return;

    codeToHtml(content, {
      lang: language,
      theme: 'github-dark',
    })
      .then(setHtml)
      .catch(() => {
        // Fallback for unsupported languages
        codeToHtml(content, {
          lang: 'text',
          theme: 'github-dark',
        }).then(setHtml);
      });
  }, [content, language]);

  // Scroll to highlighted line
  useEffect(() => {
    if (html && lineStart) {
      const lineElement = document.querySelector(
        `[data-line="${lineStart}"]`,
      ) as HTMLElement;
      if (lineElement) {
        lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [html, lineStart]);

  const handleOpenInEditor = () => {
    // TODO: Open in external editor (VS Code, Cursor, etc.)
    console.log('Open in editor:', fullPath);
  };

  // Add line numbers and highlighting to HTML
  const processedHtml = html
    ? html.replace(
        /<pre([^>]*)><code([^>]*)>/g,
        '<pre$1><code$2 class="block">',
      )
    : '';

  return (
    <div className="flex h-full w-[450px] flex-col border-l border-neutral-700 bg-neutral-900">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-neutral-700 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-sm font-medium text-neutral-200"
            title={fullPath}
          >
            {filePath}
          </div>
          {lineStart && (
            <div className="text-xs text-neutral-500">
              Line {lineStart}
              {lineEnd && lineEnd !== lineStart && `-${lineEnd}`}
            </div>
          )}
        </div>
        <button
          onClick={handleOpenInEditor}
          className="rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          title="Open in editor"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          className="rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex h-full items-center justify-center text-neutral-500">
            Loading...
          </div>
        )}
        {error && (
          <div className="flex h-full items-center justify-center text-red-400">
            {error}
          </div>
        )}
        {!isLoading && !error && content && (
          <div className="relative">
            {/* Line numbers */}
            <div className="absolute left-0 top-0 flex flex-col border-r border-neutral-700 bg-neutral-900 px-2 py-4 text-right text-xs text-neutral-600 select-none">
              {content.split('\n').map((_, index) => {
                const lineNum = index + 1;
                const isHighlighted =
                  lineStart !== undefined &&
                  lineNum >= lineStart &&
                  (lineEnd === undefined || lineNum <= lineEnd);
                return (
                  <div
                    key={lineNum}
                    data-line={lineNum}
                    className={`leading-6 ${isHighlighted ? 'bg-yellow-900/30 text-yellow-400' : ''}`}
                  >
                    {lineNum}
                  </div>
                );
              })}
            </div>
            {/* Code content */}
            <div
              className="overflow-x-auto pl-12 text-sm [&_pre]:!bg-transparent [&_pre]:py-4 [&_code_.line]:leading-6"
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
            {/* Highlight overlay */}
            {lineStart && (
              <div
                className="pointer-events-none absolute left-0 right-0 bg-yellow-500/10"
                style={{
                  top: `${(lineStart - 1) * 24 + 16}px`,
                  height: `${((lineEnd || lineStart) - lineStart + 1) * 24}px`,
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
