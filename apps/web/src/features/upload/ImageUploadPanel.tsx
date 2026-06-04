import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { uploadImages } from "../../lib/api/uploadImages";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_FILES = 20;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");

type UploadStatus = "queued" | "uploading" | "success" | "failed";

interface SelectedImage {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  progress: number;
  statusMessage: string;
}

interface UploadMessage {
  tone: "success" | "error" | "info";
  text: string;
}

function createSelectedImage(file: File): SelectedImage {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    status: "queued",
    progress: 0,
    statusMessage: "Ready",
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeUpload(uploadedCount: number, failedCount: number): UploadMessage {
  if (uploadedCount > 0 && failedCount === 0) {
    return {
      tone: "success",
      text: `${uploadedCount} image${uploadedCount === 1 ? "" : "s"} uploaded.`,
    };
  }

  if (uploadedCount > 0) {
    return {
      tone: "info",
      text: `${uploadedCount} uploaded, ${failedCount} failed.`,
    };
  }

  return {
    tone: "error",
    text: "No images were uploaded.",
  };
}

function statusClassName(status: UploadStatus): string {
  if (status === "success") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "failed") {
    return "bg-rose-50 text-rose-700";
  }

  if (status === "uploading") {
    return "bg-cyan-50 text-cyan-700";
  }

  return "bg-slate-100 text-slate-600";
}

function progressBarClassName(status: UploadStatus): string {
  if (status === "success") {
    return "bg-emerald-500";
  }

  if (status === "failed") {
    return "bg-rose-500";
  }

  return "bg-cyan-600";
}

function messageClassName(tone: UploadMessage["tone"]): string {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-cyan-200 bg-cyan-50 text-cyan-800";
}

export function ImageUploadPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<UploadMessage | null>(null);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    return () => {
      for (const image of selectedImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);

  const totalSize = useMemo(
    () => selectedImages.reduce((sum, image) => sum + image.file.size, 0),
    [selectedImages],
  );
  const pendingImages = selectedImages.filter((image) => image.status !== "success");

  function updateImage(imageId: string, patch: Partial<SelectedImage>): void {
    setSelectedImages((currentImages) =>
      currentImages.map((image) => (image.id === imageId ? { ...image, ...patch } : image)),
    );
  }

  function addFiles(fileList: FileList | File[]): void {
    if (isSubmitting) {
      return;
    }

    const incomingFiles = Array.from(fileList);
    const acceptedFiles: File[] = [];
    const rejectedMessages: string[] = [];

    for (const file of incomingFiles) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        rejectedMessages.push(`${file.name || "File"} is not a supported image type.`);
        continue;
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        rejectedMessages.push(`${file.name || "File"} is larger than 10 MB.`);
        continue;
      }

      acceptedFiles.push(file);
    }

    setSelectedImages((currentImages) => {
      const existingKeys = new Set(
        currentImages.map(
          (image) => `${image.file.name}:${image.file.size}:${image.file.lastModified}`,
        ),
      );
      const nextImages = [...currentImages];

      for (const file of acceptedFiles) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;

        if (existingKeys.has(key)) {
          continue;
        }

        if (nextImages.length >= MAX_UPLOAD_FILES) {
          rejectedMessages.push(`Upload requests can include at most ${MAX_UPLOAD_FILES} images.`);
          break;
        }

        existingKeys.add(key);
        nextImages.push(createSelectedImage(file));
      }

      return nextImages;
    });

    if (rejectedMessages.length > 0) {
      setMessage({
        tone: "error",
        text: rejectedMessages[0] ?? "Some files could not be added.",
      });
      return;
    }

    if (acceptedFiles.length > 0) {
      setMessage(null);
    }
  }

  function removeImage(imageId: string): void {
    setSelectedImages((currentImages) => {
      const image = currentImages.find((candidate) => candidate.id === imageId);

      if (image !== undefined) {
        URL.revokeObjectURL(image.previewUrl);
      }

      return currentImages.filter((candidate) => candidate.id !== imageId);
    });
  }

  function clearImages(options: { clearMessage?: boolean } = {}): void {
    setSelectedImages((currentImages) => {
      for (const image of currentImages) {
        URL.revokeObjectURL(image.previewUrl);
      }

      return [];
    });

    if (options.clearMessage ?? true) {
      setMessage(null);
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.files !== null) {
      addFiles(event.target.files);
    }

    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function handleSubmit(): Promise<void> {
    if (pendingImages.length === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const uploadTargets = pendingImages;
    let uploadedCount = 0;
    let failedCount = 0;

    await Promise.all(
      uploadTargets.map(async (image) => {
        updateImage(image.id, {
          status: "uploading",
          progress: 0,
          statusMessage: "Uploading",
        });

        try {
          const result = await uploadImages([image.file], {
            onProgress: (progress) => {
              updateImage(image.id, {
                progress: Math.min(progress.percent, 99),
                statusMessage: `${Math.min(progress.percent, 99)}%`,
              });
            },
          });
          const failed = result.failed[0];

          if (result.uploaded.length > 0) {
            uploadedCount += 1;
            updateImage(image.id, {
              status: "success",
              progress: 100,
              statusMessage: "Uploaded",
            });
            return;
          }

          failedCount += 1;
          updateImage(image.id, {
            status: "failed",
            progress: 100,
            statusMessage: failed?.error.message ?? "Upload failed",
          });
        } catch (error) {
          failedCount += 1;
          updateImage(image.id, {
            status: "failed",
            progress: 100,
            statusMessage: error instanceof Error ? error.message : "Upload failed",
          });
        }
      }),
    );

    setMessage(summarizeUpload(uploadedCount, failedCount));
    setIsSubmitting(false);
  }

  function retryFailed(): void {
    setSelectedImages((currentImages) =>
      currentImages.map((image) => {
        if (image.status !== "failed") {
          return image;
        }

        return {
          ...image,
          status: "queued",
          progress: 0,
          statusMessage: "Ready",
        };
      }),
    );
    setMessage(null);
  }

  function queuedSelectionCount(): number {
    return selectedImages.filter((image) => image.status === "queued" || image.status === "failed")
      .length;
  }

  function uploadButtonLabel(): string {
    if (isSubmitting) {
      return "Uploading";
    }

    const count = queuedSelectionCount();

    if (count === 0 && selectedImages.length > 0) {
      return "Uploaded";
    }

    return "Upload selected";
  }

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-normal text-cyan-700">
          Image workspace
        </p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              Upload images
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-slate-700">
              Select or drop JPEG, PNG, WebP, and GIF files, then submit them to the image
              workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <span className="rounded border border-slate-200 bg-white px-3 py-2">
              {selectedImages.length}/{MAX_UPLOAD_FILES} selected
            </span>
            <span className="rounded border border-slate-200 bg-white px-3 py-2">
              {formatBytes(totalSize)}
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div
          className={[
            "flex min-h-[320px] flex-col items-center justify-center rounded border-2 border-dashed p-8 text-center transition",
            isDragging
              ? "border-cyan-500 bg-cyan-50"
              : "border-slate-300 bg-white hover:border-cyan-400",
          ].join(" ")}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            multiple
            onChange={handleFileInputChange}
          />
          <div className="flex max-w-md flex-col items-center gap-5">
            <div className="grid h-20 w-20 place-items-center rounded bg-slate-100 text-3xl text-cyan-700">
              +
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-normal text-slate-950">
                Drop images here
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Each file can be up to 10 MB. You can select as many as {MAX_UPLOAD_FILES} images
                per upload.
              </p>
            </div>
            <button
              className="rounded bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              Choose images
            </button>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-normal text-slate-950">Selection</h2>
            <div className="flex gap-2">
              <button
                className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={
                  isSubmitting || !selectedImages.some((image) => image.status === "failed")
                }
                onClick={retryFailed}
              >
                Retry
              </button>
              <button
                className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={selectedImages.length === 0 || isSubmitting}
                onClick={() => {
                  clearImages();
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {message !== null ? (
            <p className={`rounded border px-3 py-2 text-sm ${messageClassName(message.tone)}`}>
              {message.text}
            </p>
          ) : null}

          <div className="grid max-h-[430px] gap-3 overflow-y-auto pr-1">
            {selectedImages.length === 0 ? (
              <div className="rounded border border-slate-200 bg-white px-4 py-6 text-sm leading-6 text-slate-600">
                No images selected.
              </div>
            ) : (
              selectedImages.map((image) => (
                <article
                  key={image.id}
                  className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded border border-slate-200 bg-white p-2"
                >
                  <img
                    className="h-[72px] w-[72px] rounded object-cover"
                    src={image.previewUrl}
                    alt=""
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-950">
                        {image.file.name}
                      </p>
                      <span
                        className={`max-w-[140px] shrink-0 truncate rounded px-2 py-1 text-xs font-medium ${statusClassName(
                          image.status,
                        )}`}
                        title={image.statusMessage}
                      >
                        {image.statusMessage}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{formatBytes(image.file.size)}</p>
                    <div
                      className="mt-2 h-2 overflow-hidden rounded bg-slate-100"
                      aria-label={`${image.file.name} upload progress`}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={image.progress}
                      role="progressbar"
                    >
                      <div
                        className={`h-full transition-all ${progressBarClassName(image.status)}`}
                        style={{ width: `${image.progress}%` }}
                      />
                    </div>
                  </div>
                  <button
                    className="grid h-8 w-8 place-items-center rounded border border-slate-300 text-lg leading-none text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    aria-label={`Remove ${image.file.name}`}
                    disabled={isSubmitting}
                    onClick={() => removeImage(image.id)}
                  >
                    x
                  </button>
                </article>
              ))
            )}
          </div>

          <button
            className="mt-auto rounded bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={pendingImages.length === 0 || isSubmitting}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {uploadButtonLabel()}
          </button>
        </aside>
      </div>
    </section>
  );
}
