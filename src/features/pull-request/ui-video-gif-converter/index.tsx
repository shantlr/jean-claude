import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/common/ui/button';
import type { PromptImagePart } from '@shared/agent-backend-types';

const MAX_VIDEO_SIZE = 80 * 1024 * 1024;
const DEFAULT_FPS = 8;
const DEFAULT_SCALE = 0.5;
const DEFAULT_QUALITY = 128;
const DEFAULT_SPEED = 1;
const SEEK_TIMEOUT_MS = 8_000;
const SCALE_OPTIONS = [
  { label: '100%', value: 1 },
  { label: '75%', value: 0.75 },
  { label: '50%', value: 0.5 },
  { label: '33%', value: 1 / 3 },
  { label: '25%', value: 0.25 },
];

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read video'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function gifFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  return `${withoutExtension || 'video'}.gif`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  const tenths = Math.floor((value % 1) * 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function estimateGifSize({
  width,
  height,
  frames,
  colors,
}: {
  width: number;
  height: number;
  frames: number;
  colors: number;
}) {
  const indexedPixels = width * height * frames;
  const paletteBytes = colors * 3 * frames;
  const compressionFactor = 0.2 + (colors / 256) * 0.45;
  const low = indexedPixels * compressionFactor * 0.6 + paletteBytes;
  const high = indexedPixels * compressionFactor * 1.4 + paletteBytes;
  return `${formatBytes(low)}-${formatBytes(high)}`;
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.01 && video.readyState >= 2) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while seeking video'));
    }, SEEK_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Failed to seek video'));
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = time;
  });
}

async function convertVideoToGif({
  file,
  fps,
  outputWidth,
  outputHeight,
  colors,
  speed,
  startTime,
  endTime,
  onProgress,
}: {
  file: File;
  fps: number;
  outputWidth: number;
  outputHeight: number;
  colors: number;
  speed: number;
  startTime: number;
  endTime: number;
  onProgress: (progress: number) => void;
}): Promise<PromptImagePart> {
  if (file.size > MAX_VIDEO_SIZE) {
    throw new Error('Video too large. Use a clip under 80 MB.');
  }

  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = sourceUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const safeStart = Math.max(0, Math.min(startTime, duration));
    const safeEnd = Math.max(safeStart + 0.1, Math.min(endTime, duration));
    const width = Math.max(1, Math.round(outputWidth));
    const height = Math.max(1, Math.round(outputHeight));
    const frameCount = Math.max(
      1,
      Math.ceil(((safeEnd - safeStart) * fps) / speed),
    );
    const delay = Math.round(1000 / fps);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Failed to create canvas');

    const gif = GIFEncoder();
    for (let index = 0; index < frameCount; index += 1) {
      const time = Math.min(safeEnd, safeStart + (index * speed) / fps);
      await seekVideo(video, time);
      context.drawImage(video, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const palette = quantize(pixels, colors);
      const indexed = applyPalette(pixels, palette);
      gif.writeFrame(indexed, width, height, { palette, delay });
      onProgress((index + 1) / frameCount);
    }
    gif.finish();

    const gifBytes = gif.bytesView();
    const gifBuffer = new ArrayBuffer(gifBytes.byteLength);
    new Uint8Array(gifBuffer).set(gifBytes);
    const blob = new Blob([gifBuffer], { type: 'image/gif' });
    const dataUrl = await readFileAsDataUrl(
      new File([blob], gifFileName(file.name), { type: 'image/gif' }),
    );
    return {
      type: 'image',
      data: dataUrlToBase64(dataUrl),
      mimeType: 'image/gif',
      filename: gifFileName(file.name),
      storageData: dataUrlToBase64(dataUrl),
      storageMimeType: 'image/gif',
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function isVideoFile(file: File) {
  return file.type.startsWith('video/');
}

export function VideoGifConverter({
  file,
  onAttach,
  onClose,
}: {
  file: File | null;
  onAttach: (image: PromptImagePart) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(6);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [colors, setColors] = useState(DEFAULT_QUALITY);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [file]);

  useEffect(() => {
    setDuration(0);
    setSourceSize({ width: 0, height: 0 });
    setStartTime(0);
    setEndTime(6);
    setScale(DEFAULT_SCALE);
    setColors(DEFAULT_QUALITY);
    setSpeed(DEFAULT_SPEED);
    setProgress(0);
    setError(null);
  }, [file]);

  if (!file || !previewUrl) return null;

  const handleMetadata = () => {
    const video = videoRef.current;
    const nextDuration = video?.duration ?? 0;
    const nextSourceSize = {
      width: video?.videoWidth ?? 0,
      height: video?.videoHeight ?? 0,
    };
    setDuration(nextDuration);
    setEndTime(Math.min(6, nextDuration || 6));
    setSourceSize(nextSourceSize);
  };

  const clipSeconds = Math.max(0.1, endTime - startTime);
  const estimatedFrames = Math.ceil((clipSeconds * fps) / speed);
  const outputWidth = Math.max(1, Math.round(sourceSize.width * scale));
  const outputHeight = Math.max(1, Math.round(sourceSize.height * scale));
  const estimatedSize = estimateGifSize({
    width: outputWidth,
    height: outputHeight,
    frames: estimatedFrames,
    colors,
  });
  const startPercent = duration ? (startTime / duration) * 100 : 0;
  const endPercent = duration ? (endTime / duration) * 100 : 100;

  const setTimelineStart = (value: number) => {
    const nextStart = clamp(value, 0, endTime - 0.1);
    setStartTime(nextStart);
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = nextStart;
  };

  const setTimelineEnd = (value: number) => {
    const nextEnd = clamp(value, startTime + 0.1, duration || 0.1);
    setEndTime(nextEnd);
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = nextEnd;
  };

  const handleConvert = async () => {
    setIsConverting(true);
    setError(null);
    setProgress(0);
    try {
      const image = await convertVideoToGif({
        file,
        fps,
        outputWidth,
        outputHeight,
        colors,
        speed,
        startTime,
        endTime,
        onProgress: setProgress,
      });
      onAttach(image);
      onClose();
    } catch (convertError) {
      setError(
        convertError instanceof Error
          ? convertError.message
          : 'Failed to convert video',
      );
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="border-glass-border bg-bg-1 w-full max-w-2xl rounded-xl border p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-ink-0 text-sm font-medium">
              Convert video to GIF
            </div>
            <div className="text-ink-3 truncate text-xs">{file.name}</div>
          </div>
          <button
            type="button"
            className="text-ink-3 hover:text-ink-1"
            onClick={onClose}
            disabled={isConverting}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <video
          ref={videoRef}
          src={previewUrl}
          controls
          className="bg-bg-0 max-h-[320px] w-full rounded-lg"
          onLoadedMetadata={handleMetadata}
        />

        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-ink-2">Timeline</span>
            <span className="text-ink-4 font-mono">
              {formatSeconds(startTime)} - {formatSeconds(endTime)}
            </span>
          </div>
          <div className="relative h-9">
            <div className="bg-bg-2 absolute top-4 right-0 left-0 h-1.5 rounded-full" />
            <div
              className="bg-acc absolute top-4 h-1.5 rounded-full"
              style={{
                left: `${startPercent}%`,
                right: `${100 - endPercent}%`,
              }}
            />
            <input
              className="pointer-events-none absolute inset-x-0 top-0 h-9 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={startTime}
              onChange={(event) => setTimelineStart(Number(event.target.value))}
              disabled={isConverting}
              aria-label="GIF start time"
            />
            <input
              className="pointer-events-none absolute inset-x-0 top-0 h-9 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={endTime}
              onChange={(event) => setTimelineEnd(Number(event.target.value))}
              disabled={isConverting}
              aria-label="GIF end time"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-ink-2 text-xs">
            FPS {fps}
            <input
              className="mt-1 w-full"
              type="range"
              min={4}
              max={15}
              step={1}
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
              disabled={isConverting}
            />
          </label>
          <label className="text-ink-2 text-xs">
            Quality {colors} colors
            <input
              className="mt-1 w-full"
              type="range"
              min={32}
              max={256}
              step={32}
              value={colors}
              onChange={(event) => setColors(Number(event.target.value))}
              disabled={isConverting}
            />
          </label>
          <label className="text-ink-2 text-xs">
            Speed {speed.toFixed(1)}x
            <input
              className="mt-1 w-full"
              type="range"
              min={0.5}
              max={3}
              step={0.25}
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
              disabled={isConverting}
            />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-ink-2 mb-1.5 text-xs">
              Output scale from original {sourceSize.width}x{sourceSize.height}
            </legend>
            <div className="border-glass-border bg-bg-2/60 inline-flex overflow-hidden rounded-lg border">
              {SCALE_OPTIONS.map((option) => (
                <label key={option.label} className="text-xs">
                  <input
                    type="radio"
                    name="gif-output-scale"
                    value={option.value}
                    checked={scale === option.value}
                    onChange={() => setScale(option.value)}
                    disabled={isConverting}
                    className="peer sr-only"
                  />
                  <span className="text-ink-3 peer-checked:bg-acc peer-checked:text-acc-ink hover:text-ink-1 inline-flex cursor-pointer px-3 py-1.5 transition-colors">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="text-ink-3 mt-3 text-xs">
          {estimatedFrames} frames at {outputWidth}x{outputHeight}. Shorter
          clips, fewer colors, lower FPS, and smaller dimensions upload faster.
          Estimated size: {estimatedSize}.
        </div>
        {isConverting && (
          <div className="bg-bg-2 mt-3 h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-acc h-full"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isConverting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleConvert()}
            disabled={isConverting}
            icon={
              isConverting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : undefined
            }
          >
            {isConverting ? 'Converting...' : 'Convert to GIF'}
          </Button>
        </div>
      </div>
    </div>
  );
}
