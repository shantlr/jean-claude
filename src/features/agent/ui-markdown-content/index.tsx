import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { codeToHtml } from 'shiki';

interface MarkdownContentProps {
  content: string;
  onFilePathClick?: (
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
  ) => void;
}

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
  onFilePathClick?: MarkdownContentProps['onFilePathClick'];
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
        className="text-blue-400 underline hover:text-blue-300"
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

interface CodeBlockProps {
  language: string;
  code: string;
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
    <div className="overflow-x-auto rounded-lg bg-neutral-900 p-3">
      <pre className="font-mono text-[10px] leading-tight text-neutral-300 whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function CodeBlock({ language, code }: CodeBlockProps) {
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
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 whitespace-pre">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded mb-3 border border-neutral-600 [&_pre]:p-2 [&_pre]:whitespace-pre"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MarkdownContent({
  content,
  onFilePathClick,
}: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-3 last:mb-0">
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
                className="rounded bg-neutral-800 border border-neutral-600 px-1 py-0.5"
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
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline hover:text-blue-300"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 list-inside list-disc space-y-1">{children}</ul>
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
          <blockquote className="mb-3 border-l-4 border-neutral-600 pl-4 italic text-neutral-400">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto">
            <table className="min-w-full border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-neutral-700 bg-neutral-800 px-3 py-2 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-neutral-700 px-3 py-2">{children}</td>
        ),
        hr: () => <hr className="my-4 border-neutral-700" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
