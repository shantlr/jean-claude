import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import {
  decodeRawMessageData,
  encodeRawMessageData,
  RAW_MESSAGE_ENCODING_GZIP_JSON,
} from './raw-message-data';

describe('raw message data encoding', () => {
  it('compresses repetitive raw JSON and decodes it', async () => {
    const rawData = {
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'text',
          text: 'OpenCode raw payload '.repeat(500),
        },
      },
    };

    const encoded = await encodeRawMessageData(rawData);

    expect(encoded.rawData).toBe('');
    expect(encoded.rawDataEncoding).toBe(RAW_MESSAGE_ENCODING_GZIP_JSON);
    expect(encoded.rawDataBlob).toBeInstanceOf(Buffer);
    await expect(decodeRawMessageData(encoded)).resolves.toBe(
      JSON.stringify(rawData),
    );
  });

  it('keeps tiny raw JSON plain when gzip is larger', async () => {
    const rawData = { type: 'session.idle' };

    const encoded = await encodeRawMessageData(rawData);

    expect(encoded.rawData).toBe(JSON.stringify(rawData));
    expect(encoded.rawDataEncoding).toBeNull();
    expect(encoded.rawDataBlob).toBeNull();
    await expect(decodeRawMessageData(encoded)).resolves.toBe(
      JSON.stringify(rawData),
    );
  });

  it('keeps marginally smaller gzip plain after encoding overhead', async () => {
    const rawData = 'a'.repeat(50);

    const encoded = await encodeRawMessageData(rawData);

    expect(encoded.rawData).toBe(JSON.stringify(rawData));
    expect(encoded.rawDataEncoding).toBeNull();
    expect(encoded.rawDataBlob).toBeNull();
  });

  it('throws when compressed rows are missing blob data', async () => {
    await expect(
      decodeRawMessageData({
        rawData: '',
        rawDataBlob: null,
        rawDataEncoding: RAW_MESSAGE_ENCODING_GZIP_JSON,
      }),
    ).rejects.toThrow('Compressed raw message is missing rawDataBlob');
  });
});
