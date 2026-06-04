import type { Pool } from "pg";
import type { ImageDimensions, ImageRecord } from "./image-record.js";
import type { ImageListCursor } from "./pagination.js";

interface ImageRow {
  id: string;
  filename: string;
  storage_key: string;
  content_type: string;
  size: string;
  dimensions: ImageDimensions;
  uploaded_at: Date;
}

export interface CreateImageRecordInput {
  filename: string;
  storageKey: string;
  contentType: string;
  size: number;
  dimensions: ImageDimensions;
}

export interface ListImageRecordsInput {
  limit: number;
  cursor?: ImageListCursor;
}

function mapImageRow(row: ImageRow): ImageRecord {
  return {
    id: row.id,
    filename: row.filename,
    storageKey: row.storage_key,
    contentType: row.content_type,
    size: Number(row.size),
    dimensions: row.dimensions,
    uploadedAt: row.uploaded_at,
  };
}

export async function createImageRecord(
  database: Pool,
  input: CreateImageRecordInput,
): Promise<ImageRecord> {
  const result = await database.query<ImageRow>(
    `
      INSERT INTO images (filename, storage_key, content_type, size, dimensions)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, filename, storage_key, content_type, size, dimensions, uploaded_at
    `,
    [
      input.filename,
      input.storageKey,
      input.contentType,
      input.size,
      JSON.stringify(input.dimensions),
    ],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error("Image metadata insert did not return a row");
  }

  return mapImageRow(row);
}

export async function listImageRecords(
  database: Pool,
  input: ListImageRecordsInput,
): Promise<ImageRecord[]> {
  if (input.cursor === undefined) {
    const result = await database.query<ImageRow>(
      `
        SELECT id, filename, storage_key, content_type, size, dimensions, uploaded_at
        FROM images
        ORDER BY uploaded_at DESC, id DESC
        LIMIT $1
      `,
      [input.limit],
    );

    return result.rows.map(mapImageRow);
  }

  const result = await database.query<ImageRow>(
    `
      SELECT id, filename, storage_key, content_type, size, dimensions, uploaded_at
      FROM images
      WHERE (uploaded_at, id) < ($1::timestamptz, $2::uuid)
      ORDER BY uploaded_at DESC, id DESC
      LIMIT $3
    `,
    [input.cursor.uploadedAt.toISOString(), input.cursor.id, input.limit],
  );

  return result.rows.map(mapImageRow);
}
