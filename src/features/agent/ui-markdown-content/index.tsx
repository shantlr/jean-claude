import clsx from 'clsx';
import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { codeToHtml } from 'shiki';

import { Modal } from '@/common/ui/modal';
import {
  extractImagesFromMarkdown,
  type ExtractedMarkdownContent,
} from '@/lib/markdown-images';
import { sanitizeMarkdownUrl } from '@/lib/markdown-urls';

// Pattern to match file paths like src/foo.ts:42-50 or just src/foo.ts:42 or src/foo.ts
const FILE_PATH_PATTERN =
  /([\w\-./]+\.(ts|tsx|js|jsx|py|go|rs|md|json|yaml|yml|toml|sql|sh|css|html|rb|java|kt|swift|c|cpp|h|hpp|cs|php|scss|less|xml|ini|dockerfile))(?::(\d+)(?:-(\d+))?)?/g;

function parseFilePath(match: string): {
  path: string;
  lineStart?: number;
  lineEnd?: number;
} {
  const parts = match.match(/([\w\-./]+\.\w+)(?::(\d+)(?:-(\d+))?)?/);
  if (!parts) return { path: match };
  return {
    path: parts[1],
    lineStart: parts[2] ? parseInt(parts[2], 10) : undefined,
    lineEnd: parts[3] ? parseInt(parts[3], 10) : undefined,
  };
}

function TextWithFilePaths({
  text,
  onFilePathClick,
}: {
  text: string;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}) {
  if (!onFilePathClick) {
    return <>{text}</>;
  }

  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(FILE_PATH_PATTERN);
  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const { path, lineStart, lineEnd } = parseFilePath(match[0]);
    parts.push(
      <button
        key={match.index}
        className="text-acc-ink hover:text-acc-ink underline"
        onClick={() => onFilePathClick(path, lineStart, lineEnd)}
      >
        {match[0]}
      </button>,
    );

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

// Detect ASCII art by looking for box-drawing characters or repeated patterns
function isAsciiArt(code: string): boolean {
  // Box-drawing characters (Unicode)
  const boxDrawingChars = /[┌┐└┘├┤┬┴┼─│╔╗╚╝╠╣╦╩╬═║]/;

  // Also detect ASCII box drawing with +, -, |, corners
  const asciiBoxPattern = /[+][-]+[+]|[|].*[|]/;

  // Check if code contains box-drawing characters
  if (boxDrawingChars.test(code)) {
    return true;
  }

  // Check for ASCII-style boxes (multiple lines with | or + patterns)
  const lines = code.split('\n');
  const linesWithBoxChars = lines.filter((line) => asciiBoxPattern.test(line));
  if (linesWithBoxChars.length >= 2) {
    return true;
  }

  return false;
}

// Special rendering for ASCII art - no syntax highlighting, smaller font, no wrap
function AsciiArtBlock({ code }: { code: string }) {
  return (
    <div className="bg-bg-0 overflow-x-auto rounded-lg p-3">
      <pre className="text-ink-1 font-mono text-[10px] leading-tight whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [html, setHtml] = useState<string>('');

  // Check if this is ASCII art
  const asciiArt = isAsciiArt(code);

  useEffect(() => {
    // Skip syntax highlighting for ASCII art
    if (asciiArt) {
      return;
    }

    codeToHtml(code, {
      lang: language || 'text',
      theme: 'github-dark',
    })
      .then(setHtml)
      .catch(() => {
        // Fallback for unsupported languages
        codeToHtml(code, {
          lang: 'text',
          theme: 'github-dark',
        }).then(setHtml);
      });
  }, [code, language, asciiArt]);

  // Render ASCII art with special styling
  if (asciiArt) {
    return <AsciiArtBlock code={code} />;
  }

  if (!html) {
    return (
      <pre className="bg-bg-0 overflow-x-auto rounded-lg p-4 whitespace-pre">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="border-glass-border mb-3 overflow-x-auto rounded border [&_pre]:p-2 [&_pre]:whitespace-pre"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function customUrlTransform(url: string): string {
  const sanitizedUrl = sanitizeMarkdownUrl(url);
  if (!sanitizedUrl) {
    console.log('[MarkdownContent] Blocking URL with unsafe protocol:', url);
  }

  return sanitizedUrl;
}

export function MarkdownContent({
  content,
  onFilePathClick,
  imageClassName,
  enableImageModal = false,
  imagePresentation = 'inline',
  truncateToChars,
  extractedContent,
}: {
  content: string;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
  imageClassName?: string;
  enableImageModal?: boolean;
  imagePresentation?: 'inline' | 'footer-thumbnails';
  truncateToChars?: number;
  extractedContent?: ExtractedMarkdownContent;
}) {
  const [selectedImage, setSelectedImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const resolvedExtractedContent = useMemo(
    () =>
      (extractedContent ?? imagePresentation === 'footer-thumbnails')
        ? extractImagesFromMarkdown(content)
        : { contentWithoutImages: content, images: [] },
    [content, extractedContent, imagePresentation],
  );
  const renderedContent = useMemo(() => {
    if (
      !truncateToChars ||
      resolvedExtractedContent.contentWithoutImages.length <= truncateToChars
    ) {
      return resolvedExtractedContent.contentWithoutImages;
    }

    return resolvedExtractedContent.contentWithoutImages
      .slice(0, truncateToChars)
      .trimEnd();
  }, [resolvedExtractedContent.contentWithoutImages, truncateToChars]);
  const interactiveImages =
    enableImageModal || imagePresentation === 'footer-thumbnails';
  const footerImages = useMemo(
    () =>
      resolvedExtractedContent.images.filter((image) =>
        sanitizeMarkdownUrl(image.src),
      ),
    [resolvedExtractedContent.images],
  );

  return (
    <>
      <div className="break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={customUrlTransform}
          components={{
            p: ({ children }) => (
              <p className="mb-3 whitespace-pre-line last:mb-0">
                {typeof children === 'string' ? (
                  <TextWithFilePaths
                    text={children}
                    onFilePathClick={onFilePathClick}
                  />
                ) : (
                  children
                )}
              </p>
            ),
            code: ({ className, children, ...props }) => {
              const matchLang = /language-(\w+)/.exec(className || '');
              const isInline =
                !matchLang &&
                (typeof children !== 'string' || !children.includes('\n'));

              if (isInline) {
                return (
                  <code
                    className="border-glass-border bg-bg-1 rounded border px-1 py-0.5"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              return (
                <CodeBlock
                  language={matchLang ? matchLang[1] : 'text'}
                  code={String(children).replace(/\n$/, '')}
                />
              );
            },
            pre: ({ children }) => <>{children}</>,
            a: ({ href, children }) => {
              if (href?.startsWith('azure-devops-mention:')) {
                return (
                  <span className="text-acc-ink font-medium">{children}</span>
                );
              }

              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-acc-ink hover:text-acc-ink underline"
                >
                  {children}
                </a>
              );
            },
            ul: ({ children }) => (
              <ul className="mb-3 list-inside list-disc space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-3 list-inside list-decimal space-y-1">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="ml-2 [&>*:first-child]:inline">{children}</li>
            ),
            h1: ({ children }) => (
              <h1 className="mb-3 font-bold" style={{ fontSize: '1.5em' }}>
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mb-3 font-bold" style={{ fontSize: '1.25em' }}>
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mb-2 font-semibold" style={{ fontSize: '1.1em' }}>
                {children}
              </h3>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-glass-border text-ink-2 mb-3 border-l-4 pl-4 italic">
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <div className="mb-3 overflow-x-auto">
                <table className="min-w-full border-collapse">{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border-glass-border bg-bg-1 border px-3 py-2 text-left font-semibold">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-glass-border border px-3 py-2">
                {children}
              </td>
            ),
            hr: () => <hr className="border-glass-border my-4" />,
            img: ({ src, alt, ...props }) => {
              if (imagePresentation === 'footer-thumbnails') {
                return null;
              }

              // Don't render if src is empty or undefined
              if (!src) {
                console.log('[MarkdownContent] Skipping img with empty src');
                return null;
              }

              const resolvedAlt = alt || '';
              const interactive = interactiveImages;

              return (
                <img
                  src={src}
                  alt={resolvedAlt}
                  className={clsx(
                    'my-2 block max-w-full rounded',
                    interactive && 'cursor-zoom-in',
                    imageClassName,
                  )}
                  aria-label={
                    interactive
                      ? resolvedAlt || 'Open image preview'
                      : undefined
                  }
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={
                    interactive
                      ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedImage({ src, alt: resolvedAlt });
                        }
                      : undefined
                  }
                  onKeyDown={
                    interactive
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            setSelectedImage({ src, alt: resolvedAlt });
                          }
                        }
                      : undefined
                  }
                  {...props}
                />
              );
            },
          }}
        >
          {renderedContent}
        </ReactMarkdown>
      </div>

      {imagePresentation === 'footer-thumbnails' && footerImages.length > 0 && (
        <div className="border-glass-border mt-3 flex flex-wrap items-center gap-2 border-t pt-2.5">
          {footerImages.map((image, index) => (
            <button
              key={`${image.src}-${index}`}
              type="button"
              className="group/thumb border-glass-border bg-bg-1 hover:border-glass-border-strong relative h-12 w-12 shrink-0 overflow-hidden rounded border transition-colors"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSelectedImage(image);
              }}
              aria-label={image.alt || `Open image ${index + 1}`}
            >
              <img
                src={image.src}
                alt={image.alt}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <Modal
        isOpen={selectedImage !== null}
        onClose={() => setSelectedImage(null)}
        title={selectedImage?.alt || 'Image preview'}
        size="xl"
      >
        {selectedImage && (
          <div className="flex max-h-[75vh] w-full items-center justify-center">
            <img
              src={selectedImage.src}
              alt={selectedImage.alt}
              className="max-h-[75vh] w-full object-contain"
            />
          </div>
        )}
      </Modal>
    </>
  );
}
