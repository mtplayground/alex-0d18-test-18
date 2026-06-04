import type { Pool } from "pg";
import type { ImageDimensions, ImageRecord } from "./image-record.js";

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
