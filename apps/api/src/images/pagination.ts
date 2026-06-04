import { HttpError } from "../errors/http-error.js";
import type { ImageRecord } from "./image-record.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ImageListCursor {
  uploadedAt: Date;
  id: string;
}

interface EncodedImageListCursor {
  uploadedAt: string;
  id: string;
}

function isEncodedCursor(value: unknown): value is EncodedImageListCursor {
  if (value === null || typeof value !== "object") {
    return false;
  }

  return (
    "uploadedAt" in value &&
    typeof value.uploadedAt === "string" &&
    "id" in value &&
    typeof value.id === "string"
  );
}

export function encodeImageListCursor(record: ImageRecord): string {
  const cursor: EncodedImageListCursor = {
    uploadedAt: record.uploadedAt.toISOString(),
    id: record.id,
  };

  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeImageListCursor(cursor: string): ImageListCursor {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;

    if (!isEncodedCursor(parsed)) {
      throw new Error("Cursor shape is invalid");
    }

    const uploadedAt = new Date(parsed.uploadedAt);

    if (Number.isNaN(uploadedAt.getTime()) || !UUID_PATTERN.test(parsed.id)) {
      throw new Error("Cursor values are invalid");
    }

    return {
      uploadedAt,
      id: parsed.id,
    };
  } catch {
    throw new HttpError(400, "invalid_cursor", "Pagination cursor is invalid");
  }
}
