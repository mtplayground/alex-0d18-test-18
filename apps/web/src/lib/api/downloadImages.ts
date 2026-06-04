interface DownloadImagesAsZipOptions {
  imageIds: string[];
  signal?: AbortSignal;
}

interface DownloadImagesAsZipResponse {
  blob: Blob;
  filename: string;
}

const DEFAULT_ZIP_FILENAME = "images.zip";

function parseErrorMessage(body: unknown): string {
  if (
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }

  return "Selected images could not be downloaded";
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as unknown;
  }

  return await response.text();
}

function parseContentDispositionFilename(value: string | null): string {
  if (value === null) {
    return DEFAULT_ZIP_FILENAME;
  }

  const quotedFilename = /filename="([^"]+)"/i.exec(value);
  const quotedFilenameValue = quotedFilename?.[1];

  if (quotedFilenameValue !== undefined && quotedFilenameValue.trim() !== "") {
    return quotedFilenameValue;
  }

  const plainFilename = /filename=([^;]+)/i.exec(value);
  const plainFilenameValue = plainFilename?.[1];

  if (plainFilenameValue !== undefined && plainFilenameValue.trim() !== "") {
    return plainFilenameValue.trim();
  }

  return DEFAULT_ZIP_FILENAME;
}

export async function downloadImagesAsZip({
  imageIds,
  signal,
}: DownloadImagesAsZipOptions): Promise<DownloadImagesAsZipResponse> {
  const response = await fetch("/api/downloads/zip", {
    body: JSON.stringify({ imageIds }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw new Error(parseErrorMessage(await parseResponseBody(response)));
  }

  const blob = await response.blob();

  if (blob.size === 0) {
    throw new Error("Downloaded zip was empty");
  }

  return {
    blob,
    filename: parseContentDispositionFilename(response.headers.get("content-disposition")),
  };
}
