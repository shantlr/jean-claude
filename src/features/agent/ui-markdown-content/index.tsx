import clsx from 'clsx';
import {
  decompressFrame,
  decompressFrames,
  parseGIF,
  type ParsedFrame,
} from 'gifuct-js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

function getTextContent(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextContent).join('');
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getTextContent(node.props.children);
  }

  return '';
}

function isStrongElement(node: React.ReactNode): node is React.ReactElement<{
  children?: React.ReactNode;
  className?: string;
}> {
  return React.isValidElement(node) && node.type === 'strong';
}

function startsWithSectionLabel(children: React.ReactNode): boolean {
  const nodes = React.Children.toArray(children);
  const firstContentNode = nodes.find((node) => getTextContent(node).trim());

  return (
    isStrongElement(firstContentNode) &&
    getTextContent(firstContentNode).trim().endsWith(':')
  );
}

function promoteSectionLabel(children: React.ReactNode): React.ReactNode {
  let promoted = false;

  return React.Children.map(children, (child) => {
    if (promoted || !isStrongElement(child)) {
      return child;
    }

    const text = getTextContent(child).trim();
    if (!text.endsWith(':')) {
      return child;
    }

    promoted = true;
    return React.cloneElement(child, {
      className: clsx(child.props.className, 'text-acc-ink'),
    });
  });
}

function getCollapsedUrlLabel(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.replace(/^www\./, '');
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

    if (pathSegments.length === 0) {
      return `${host}/`;
    }

    if (pathSegments.length === 1) {
      return `${host}/${pathSegments[0]}/`;
    }

    const firstPathSegment = pathSegments[0];
    const lastPathSegment = pathSegments.at(-1);
    return `${host}/${firstPathSegment}/…/${lastPathSegment}${parsedUrl.search ? '?' : ''}`;
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 32);
  }
}

function isBareUrlLink(href: string | undefined, children: React.ReactNode) {
  if (!href?.startsWith('http')) {
    return false;
  }

  const label = getTextContent(children).trim();
  return label === href || /^https?:\/\//.test(label);
}

function getCalloutKind(children: React.ReactNode): 'note' | 'warning' | null {
  const text = getTextContent(children).trim();
  const match = text.match(/^(note|tip|warning|caution|important)\s*:/i);

  if (!match) {
    return null;
  }

  const label = match[1].toLowerCase();
  return label === 'warning' || label === 'caution' || label === 'important'
    ? 'warning'
    : 'note';
}

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
      className="border-glass-border mb-3 overflow-x-auto rounded border [&_pre]:w-max [&_pre]:min-w-full [&_pre]:p-2 [&_pre]:whitespace-pre"
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

function decodeAzureProxyParts(
  src: string,
): { providerId: string; imageUrl: string } | null {
  if (!src.startsWith('azure-image-proxy://')) {
    return null;
  }

  try {
    const proxyUrl = new URL(src);
    const encodedUrl = proxyUrl.pathname.slice(1);
    if (!encodedUrl) {
      return null;
    }

    const padded = encodedUrl.padEnd(
      encodedUrl.length + ((4 - (encodedUrl.length % 4)) % 4),
      '=',
    );
    return {
      providerId: proxyUrl.hostname,
      imageUrl: atob(padded.replace(/-/g, '+').replace(/_/g, '/')),
    };
  } catch {
    return null;
  }
}

function decodeAzureProxyUrl(src: string): string | null {
  return decodeAzureProxyParts(src)?.imageUrl ?? null;
}

function isGifSource(src: string): boolean {
  if (src.startsWith('data:image/gif')) {
    return true;
  }

  const inspectedSrc = decodeAzureProxyUrl(src) ?? src;

  try {
    const url = new URL(inspectedSrc, window.location.href);
    return (
      url.pathname.toLowerCase().endsWith('.gif') ||
      url.searchParams.get('fileName')?.toLowerCase().endsWith('.gif') === true
    );
  } catch {
    return inspectedSrc.toLowerCase().includes('.gif');
  }
}

function normalizeMarkdownImageSizeSyntax(content: string): string {
  let fence: { marker: '`' | '~'; length: number } | null = null;

  return content
    .split('\n')
    .map((line) => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0] as '`' | '~';
        const length = fenceMatch[1].length;
        if (!fence) {
          fence = { marker, length };
        } else if (fence.marker === marker && length >= fence.length) {
          fence = null;
        }

        return line;
      }

      if (fence) {
        return line;
      }

      let inInlineCode = false;
      return line
        .split(/(`+)/)
        .map((part) => {
          if (/^`+$/.test(part)) {
            inInlineCode = !inInlineCode;
            return part;
          }

          if (inInlineCode) {
            return part;
          }

          return normalizeMarkdownImageSizeText(part);
        })
        .join('');
    })
    .join('\n');
}

function normalizeMarkdownImageSizeText(content: string): string {
  return content.replace(
    /(!\[[^\]]*\]\()([^\s)]+)\s+=(\d+)x(\d*)(\))/g,
    '$1$2 "jc-size=$3x$4"$5',
  );
}

function getMarkdownImageSizeFromTitle(
  title: string | undefined,
): { width: number; height?: number } | undefined {
  const match = title?.match(/^jc-size=(\d+)x(\d*)$/);
  if (!match) {
    return undefined;
  }

  return {
    width: Number(match[1]),
    height: match[2] ? Number(match[2]) : undefined,
  };
}

function getSizedImageStyle(
  requestedSize: { width: number; height?: number } | undefined,
  style?: React.CSSProperties,
): React.CSSProperties | undefined {
  if (!requestedSize) {
    return style;
  }

  return {
    ...style,
    width: requestedSize.width,
    height: requestedSize.height,
    maxWidth: '100%',
  };
}

function getSizedFigureStyle(
  requestedSize: { width: number; height?: number } | undefined,
): React.CSSProperties | undefined {
  if (!requestedSize) {
    return undefined;
  }

  return { width: requestedSize.width, maxWidth: '100%' };
}

type GifFrame = Parameters<typeof decompressFrame>[0];

function composeGifFrameImages({
  frames,
  width,
  height,
}: {
  frames: ParsedFrame[];
  width: number;
  height: number;
}): ImageData[] {
  const canvas = document.createElement('canvas');
  const patchCanvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const patchContext = patchCanvas.getContext('2d');

  if (!context || !patchContext) {
    return [];
  }

  const renderedFrames: ImageData[] = [];

  for (const frame of frames) {
    const previousImage =
      frame.disposalType === 3
        ? context.getImageData(0, 0, width, height)
        : null;

    patchCanvas.width = frame.dims.width;
    patchCanvas.height = frame.dims.height;
    patchContext.clearRect(0, 0, frame.dims.width, frame.dims.height);
    const patch = new Uint8ClampedArray(frame.patch.length);
    patch.set(frame.patch);
    patchContext.putImageData(
      new ImageData(patch, frame.dims.width, frame.dims.height),
      0,
      0,
    );
    context.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
    renderedFrames.push(context.getImageData(0, 0, width, height));

    if (frame.disposalType === 2) {
      context.clearRect(
        frame.dims.left,
        frame.dims.top,
        frame.dims.width,
        frame.dims.height,
      );
    } else if (previousImage) {
      context.putImageData(previousImage, 0, 0);
    }
  }

  return renderedFrames;
}

async function loadGifArrayBuffer(src: string): Promise<ArrayBuffer> {
  const proxyParts = decodeAzureProxyParts(src);

  if (proxyParts) {
    const data = await window.api.azureDevOps.fetchImageAsBase64(proxyParts);
    if (!data) {
      throw new Error('Failed to load proxied GIF');
    }

    return Uint8Array.from(atob(data.data), (char) => char.charCodeAt(0))
      .buffer;
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to load GIF: ${response.status}`);
  }

  return response.arrayBuffer();
}

async function decodeGifFrameImages(src: string): Promise<{
  images: ImageData[];
  width: number;
  height: number;
}> {
  const gif = parseGIF(await loadGifArrayBuffer(src));
  const imageFrames = gif.frames.filter(
    (frame): frame is GifFrame => 'image' in frame && 'gce' in frame,
  );
  const frameCount = imageFrames.length;
  if (frameCount > MAX_GIF_SCRUB_FRAMES) {
    throw new Error(`GIF has too many frames (${frameCount})`);
  }

  if (gif.lsd.width * gif.lsd.height > MAX_GIF_CANVAS_PIXELS) {
    throw new Error('GIF is too large to scrub safely');
  }

  for (const frame of imageFrames) {
    const framePixels =
      frame.image.descriptor.width * frame.image.descriptor.height;
    if (framePixels > MAX_GIF_FRAME_PATCH_PIXELS) {
      throw new Error('GIF frame is too large to scrub safely');
    }
  }

  const frames = decompressFrames(gif, true);
  const images = composeGifFrameImages({
    frames,
    width: gif.lsd.width,
    height: gif.lsd.height,
  });

  return { images, width: gif.lsd.width, height: gif.lsd.height };
}

const MAX_GIF_SCRUB_FRAMES = 240;
const MAX_GIF_CANVAS_PIXELS = 10_000_000;
const MAX_GIF_FRAME_PATCH_PIXELS = 4_000_000;
const MAX_GIF_FRAME_CACHE_ENTRIES = 1;

const gifFrameCache = new Map<
  string,
  Promise<{ images: ImageData[]; width: number; height: number }>
>();

function getCachedGifFrameImages(src: string) {
  const cached = gifFrameCache.get(src);
  if (cached) {
    return cached;
  }

  const decoded = decodeGifFrameImages(src).catch((error: unknown) => {
    gifFrameCache.delete(src);
    throw error;
  });
  gifFrameCache.set(src, decoded);

  while (gifFrameCache.size > MAX_GIF_FRAME_CACHE_ENTRIES) {
    const oldestKey = gifFrameCache.keys().next().value;
    if (!oldestKey) break;
    gifFrameCache.delete(oldestKey);
  }

  return decoded;
}

function GifFrameScrubber({
  src,
  alt,
  imageClassName,
  interactive,
  requestedSize,
  onOpen,
}: {
  src: string;
  alt: string;
  imageClassName?: string;
  interactive: boolean;
  requestedSize?: { width: number; height?: number };
  onOpen: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frameImages, setFrameImages] = useState<ImageData[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFrameImages([]);
    setFrameIndex(0);
    setSize(null);
    setFailed(false);
    setIsDecoding(false);

    if (!isScrubbing) {
      return () => {
        cancelled = true;
      };
    }

    setIsDecoding(true);
    getCachedGifFrameImages(src)
      .then(({ images, width, height }) => {
        if (cancelled) {
          return;
        }

        if (images.length === 0) {
          throw new Error('GIF had no decodable frames');
        }

        setSize({ width, height });
        setFrameImages(images);
        setIsDecoding(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn('[MarkdownContent] Failed to decode GIF frames', error);
          setFailed(true);
          setIsDecoding(false);
        }
      });

    return () => {
      cancelled = true;
      gifFrameCache.delete(src);
    };
  }, [src, isScrubbing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = frameImages[frameIndex];
    const context = canvas?.getContext('2d');

    if (!canvas || !image || !context) {
      return;
    }

    context.putImageData(image, 0, 0);
  }, [frameImages, frameIndex]);

  if (!isScrubbing || failed || !size || frameImages.length <= 1) {
    return (
      <span className="my-2 block w-fit max-w-full">
        <img
          src={src}
          alt={alt}
          className={clsx(
            'block max-w-full rounded',
            interactive && 'cursor-zoom-in',
            imageClassName,
          )}
          style={getSizedImageStyle(requestedSize)}
          aria-label={interactive ? alt || 'Open image preview' : undefined}
          role={interactive ? 'button' : undefined}
          tabIndex={interactive ? 0 : undefined}
          onClick={
            interactive
              ? (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpen();
                }
              : undefined
          }
          onKeyDown={
            interactive
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpen();
                  }
                }
              : undefined
          }
        />
        <span className="mt-1.5 block">
          <span
            role="button"
            tabIndex={isDecoding ? undefined : 0}
            aria-disabled={isDecoding}
            className={clsx(
              'border-line-soft bg-bg-1/80 text-ink-2 hover:text-ink-0 hover:border-line inline-flex rounded-md border px-2 py-1 text-[10.5px] transition-colors',
              isDecoding && 'cursor-wait opacity-70',
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!isDecoding) {
                setIsScrubbing(true);
              }
            }}
            onKeyDown={(event) => {
              if (!isDecoding && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                event.stopPropagation();
                setIsScrubbing(true);
              }
            }}
          >
            {isDecoding ? 'Loading frames...' : 'Scrub frames'}
          </span>
        </span>
      </span>
    );
  }

  return (
    <span
      className="my-2 block w-fit max-w-full"
      style={getSizedFigureStyle(requestedSize)}
    >
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        className={clsx(
          'block max-w-full rounded',
          interactive && 'cursor-zoom-in',
          imageClassName,
        )}
        style={getSizedImageStyle(requestedSize)}
        aria-label={interactive ? alt || 'Open image preview' : alt}
        role={interactive ? 'button' : 'img'}
        tabIndex={interactive ? 0 : undefined}
        onClick={
          interactive
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpen();
              }
            : undefined
        }
        onKeyDown={
          interactive
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpen();
                }
              }
            : undefined
        }
      />
      <span className="border-line-soft bg-bg-1/80 mt-1.5 flex items-center gap-2 rounded-md border px-2 py-1.5 text-[10.5px]">
        <span className="text-ink-3 shrink-0 font-mono">
          {frameIndex + 1}/{frameImages.length}
        </span>
        <input
          type="range"
          min={0}
          max={frameImages.length - 1}
          value={frameIndex}
          aria-label="GIF frame"
          className="accent-acc h-1.5 min-w-32 flex-1"
          onChange={(event) => setFrameIndex(Number(event.target.value))}
        />
      </span>
    </span>
  );
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
  const normalizedContent = useMemo(
    () => normalizeMarkdownImageSizeSyntax(content),
    [content],
  );
  const resolvedExtractedContent = useMemo(
    () =>
      extractedContent ??
      (imagePresentation === 'footer-thumbnails'
        ? extractImagesFromMarkdown(normalizedContent)
        : { contentWithoutImages: normalizedContent, images: [] }),
    [normalizedContent, extractedContent, imagePresentation],
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
      <div className="jc-markdown text-ink-1 w-fit max-w-full min-w-0 text-[12.5px] leading-[1.66] break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={customUrlTransform}
          components={{
            p: ({ children }) => {
              const hasLabel = startsWithSectionLabel(children);
              const renderedChildren = hasLabel
                ? promoteSectionLabel(children)
                : children;

              return (
                <p
                  className={clsx(
                    'mb-[13px] text-pretty whitespace-pre-line last:mb-0',
                    hasLabel && 'mt-[22px] first:mt-0',
                  )}
                >
                  {typeof renderedChildren === 'string' ? (
                    <TextWithFilePaths
                      text={renderedChildren}
                      onFilePathClick={onFilePathClick}
                    />
                  ) : (
                    renderedChildren
                  )}
                </p>
              );
            },
            code: ({ className, children, ...props }) => {
              const matchLang = /language-(\w+)/.exec(className || '');
              const isInline =
                !matchLang &&
                (typeof children !== 'string' || !children.includes('\n'));

              if (isInline) {
                return (
                  <code
                    className="border-line-soft bg-bg-2 text-acc-ink rounded border px-1.5 py-0.5 font-mono text-[11.5px]"
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

              if (href && isBareUrlLink(href, children)) {
                const url = href;

                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={url}
                    title={url}
                    className="bg-acc-soft border-acc-line text-acc-ink hover:text-ink-0 inline-flex items-center gap-1 rounded-full border px-2 py-1 align-baseline font-mono text-[11.5px] leading-none no-underline transition-colors hover:bg-[oklch(0.72_0.2_295_/_0.26)]"
                  >
                    {getCollapsedUrlLabel(url)}
                    <span className="text-[10px] opacity-70">↗</span>
                  </a>
                );
              }

              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-acc-ink border-acc-line hover:text-ink-0 hover:border-acc-ink border-b no-underline transition-colors"
                >
                  {children}
                </a>
              );
            },
            ul: ({ children }) => (
              <ul className="jc-markdown-ul mb-3 list-none space-y-1.5 pl-0">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="jc-markdown-ol mb-3 list-none space-y-1.5 pl-0">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="jc-markdown-li relative ml-0 leading-[1.6] [&>*:first-child]:inline [&>ol]:mt-1.5 [&>ul]:mt-1.5">
                {children}
              </li>
            ),
            h1: ({ children }) => (
              <h1 className="border-line text-acc-ink mb-3.5 border-b pb-2.5 text-lg leading-[1.3] font-semibold tracking-[-0.015em]">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="border-line-soft text-acc-ink mt-[26px] mb-2.5 border-b pb-2 text-[14.5px] leading-[1.3] font-semibold tracking-[-0.015em]">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-acc-ink mt-5 mb-2 text-[12.5px] leading-[1.3] font-semibold tracking-[0.7px] uppercase">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-ink-0 mt-4 mb-1.5 text-[13px] leading-[1.3] font-semibold tracking-[-0.015em]">
                {children}
              </h4>
            ),
            strong: ({ children }) => (
              <strong className="text-ink-0 font-semibold">{children}</strong>
            ),
            blockquote: ({ children }) => {
              const calloutKind = getCalloutKind(children);
              const isWarning = calloutKind === 'warning';

              return (
                <blockquote
                  className={clsx(
                    'mb-4 rounded-lg border border-l-2 px-3.5 py-3 not-italic',
                    isWarning
                      ? 'bg-status-run-soft border-status-run/40'
                      : 'bg-acc-soft border-acc-line',
                  )}
                >
                  {calloutKind && (
                    <span
                      className={clsx(
                        'mb-1.5 inline-flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.7px] uppercase',
                        isWarning ? 'text-status-run' : 'text-acc-ink',
                      )}
                    >
                      <span
                        className={clsx(
                          'text-bg-0 flex h-3.5 w-3.5 items-center justify-center rounded-full font-serif text-[9px] font-black italic',
                          isWarning ? 'bg-status-run' : 'bg-acc',
                        )}
                      >
                        i
                      </span>
                      {isWarning ? 'Warning' : 'Note'}
                    </span>
                  )}
                  <div className="text-ink-2 [&_strong]:text-acc-ink text-[12.5px] leading-[1.6] [&_p]:mb-0 [&_p+p]:mt-2">
                    {children}
                  </div>
                </blockquote>
              );
            },
            table: ({ children }) => (
              <div className="border-line mb-3 overflow-x-auto rounded-lg border">
                <table className="min-w-full border-collapse text-left">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border-line-soft bg-bg-2 text-ink-0 border px-3 py-2 text-left font-semibold">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-line-soft border px-3 py-2">{children}</td>
            ),
            hr: () => <hr className="border-line my-[22px]" />,
            img: ({ src, alt, title, style, ...props }) => {
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
              const requestedSize = getMarkdownImageSizeFromTitle(title);
              const renderedTitle = requestedSize ? undefined : title;

              if (isGifSource(src)) {
                return (
                  <GifFrameScrubber
                    src={src}
                    alt={resolvedAlt}
                    imageClassName={imageClassName}
                    interactive={interactive}
                    requestedSize={requestedSize}
                    onOpen={() => setSelectedImage({ src, alt: resolvedAlt })}
                  />
                );
              }

              return (
                <img
                  src={src}
                  alt={resolvedAlt}
                  title={renderedTitle}
                  className={clsx(
                    'my-2 block max-w-full rounded',
                    interactive && 'cursor-zoom-in',
                    imageClassName,
                  )}
                  style={getSizedImageStyle(requestedSize, style)}
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
