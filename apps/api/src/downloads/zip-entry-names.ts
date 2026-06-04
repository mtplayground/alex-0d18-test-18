import path from "node:path";
import type { ImageRecord } from "../images/image-record.js";

function sanitizeZipEntryName(filename: string): string {
  const basename = path.basename(filename).replaceAll(/[/\\]/g, "").trim();

  if (basename === "" || basename === "." || basename === "..") {
    return "image";
  }

  return basename.replaceAll(/[\r\n\t]/g, "_");
}

export function uniqueZipEntryName(record: ImageRecord, usedNames: Set<string>): string {
  const sanitizedName = sanitizeZipEntryName(record.filename);
  const extension = path.extname(sanitizedName);
  const nameWithoutExtension =
    extension === "" ? sanitizedName : sanitizedName.slice(0, -extension.length);
  let candidate = sanitizedName;
  let suffix = 2;

  while (usedNames.has(candidate)) {
    candidate = `${nameWithoutExtension}-${suffix}${extension}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}
