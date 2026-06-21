import { gunzip, gzip } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const RAW_MESSAGE_ENCODING_GZIP_JSON = 'gzip-json-v1';
const RAW_MESSAGE_COMPRESSION_MIN_SAVINGS_BYTES = 32;

export async function encodeRawMessageData(rawData: unknown): Promise<{
  rawData: string;
  rawDataBlob: Buffer | null;
  rawDataEncoding: string | null;
}> {
  const json = JSON.stringify(rawData) ?? 'null';
  const jsonBytes = Buffer.byteLength(json, 'utf8');
  const compressed = await gzipAsync(Buffer.from(json, 'utf8'));
  const compressedBytes =
    compressed.length +
    Buffer.byteLength(RAW_MESSAGE_ENCODING_GZIP_JSON, 'utf8');

  if (jsonBytes - compressedBytes < RAW_MESSAGE_COMPRESSION_MIN_SAVINGS_BYTES) {
    return {
      rawData: json,
      rawDataBlob: null,
      rawDataEncoding: null,
    };
  }

  return {
    rawData: '',
    rawDataBlob: compressed,
    rawDataEncoding: RAW_MESSAGE_ENCODING_GZIP_JSON,
  };
}

export async function decodeRawMessageData(row: {
  rawData: string | null;
  rawDataBlob?: Buffer | Uint8Array | null;
  rawDataEncoding?: string | null;
}): Promise<string> {
  if (
    row.rawDataEncoding === RAW_MESSAGE_ENCODING_GZIP_JSON &&
    row.rawDataBlob
  ) {
    return (await gunzipAsync(Buffer.from(row.rawDataBlob))).toString('utf8');
  }

  if (row.rawDataEncoding === RAW_MESSAGE_ENCODING_GZIP_JSON) {
    throw new Error('Compressed raw message is missing rawDataBlob');
  }

  if (row.rawDataEncoding) {
    throw new Error(`Unknown raw message encoding: ${row.rawDataEncoding}`);
  }

  return row.rawData ?? '';
}
