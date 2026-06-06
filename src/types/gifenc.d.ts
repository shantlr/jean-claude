declare module 'gifenc' {
  export type GifPalette = number[];

  export function GIFEncoder(): {
    writeFrame: (
      indexedPixels: Uint8Array,
      width: number,
      height: number,
      options: { palette: GifPalette; delay: number },
    ) => void;
    finish: () => void;
    bytesView: () => Uint8Array;
  };

  export function quantize(
    pixels: Uint8ClampedArray,
    maxColors: number,
  ): GifPalette;

  export function applyPalette(
    pixels: Uint8ClampedArray,
    palette: GifPalette,
  ): Uint8Array;
}
