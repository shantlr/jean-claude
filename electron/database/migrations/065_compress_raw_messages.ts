import { gunzipSync, gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';


import { Kysely, sql } from 'kysely';

const RAW_MESSAGE_ENCODING_GZIP_JSON = 'gzip-json-v1';
const RAW_MESSAGE_COMPRESSION_MIN_SAVINGS_BYTES = 32;
const BATCH_SIZE = 500;

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('raw_messages')
    .addColumn('rawDataBlob', 'blob')
    .execute();

  await db.schema
    .alterTable('raw_messages')
    .addColumn('rawDataEncoding', 'text')
    .execute();

  let lastId = '';

  while (true) {
    const rows = await sql<{
      id: string;
      rawData: string;
    }>`SELECT id, rawData FROM raw_messages WHERE rawData != '' AND rawDataBlob IS NULL AND id > ${lastId} ORDER BY id LIMIT ${sql.lit(BATCH_SIZE)}`.execute(
      db,
    );

    if (rows.rows.length === 0) break;

    for (const row of rows.rows) {
      const encoded = encodeRawMessageData(row.rawData);
      await sql`UPDATE raw_messages SET rawData = ${encoded.rawData}, rawDataBlob = ${encoded.rawDataBlob}, rawDataEncoding = ${encoded.rawDataEncoding} WHERE id = ${row.id}`.execute(
        db,
      );
    }

    lastId = rows.rows[rows.rows.length - 1]!.id;
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  while (true) {
    const rows = await sql<{
      id: string;
      rawDataBlob: Uint8Array;
      rawDataEncoding: string | null;
    }>`SELECT id, rawDataBlob, rawDataEncoding FROM raw_messages WHERE rawData = '' AND rawDataBlob IS NOT NULL LIMIT ${sql.lit(BATCH_SIZE)}`.execute(
      db,
    );

    if (rows.rows.length === 0) break;

    for (const row of rows.rows) {
      const rawData = decodeRawMessageData(row);
      await sql`UPDATE raw_messages SET rawData = ${rawData}, rawDataBlob = NULL, rawDataEncoding = NULL WHERE id = ${row.id}`.execute(
        db,
      );
    }
  }

  await db.schema
    .alterTable('raw_messages')
    .dropColumn('rawDataEncoding')
    .execute();
  await db.schema
    .alterTable('raw_messages')
    .dropColumn('rawDataBlob')
    .execute();
}

function encodeRawMessageData(json: string): {
  rawData: string;
  rawDataBlob: Buffer | null;
  rawDataEncoding: string | null;
} {
  const jsonBytes = Buffer.byteLength(json, 'utf8');
  const compressed = gzipSync(Buffer.from(json, 'utf8'));
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

function decodeRawMessageData(row: {
  rawDataBlob: Uint8Array;
  rawDataEncoding: string | null;
}): string {
  if (row.rawDataEncoding !== RAW_MESSAGE_ENCODING_GZIP_JSON) {
    throw new Error(`Unknown raw message encoding: ${row.rawDataEncoding}`);
  }

  return gunzipSync(Buffer.from(row.rawDataBlob)).toString('utf8');
}
