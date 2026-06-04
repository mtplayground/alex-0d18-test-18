import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadImages } from "../../lib/api/uploadImages";

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 20;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");

export type UploadStatus = "queued" | "uploading" | "success" | "failed";

export interface SelectedImage {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  progress: number;
  statusMessage: string;
}

export interface UploadMessage {
  tone: "success" | "error" | "info";
  text: string;
}

interface UseUploadQueueOptions {
  onUploadComplete?: () => void;
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

export function useUploadQueue({ onUploadComplete }: UseUploadQueueOptions = {}) {
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
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
  const pendingImages = useMemo(
    () => selectedImages.filter((image) => image.status !== "success"),
    [selectedImages],
  );

  const updateImage = useCallback((imageId: string, patch: Partial<SelectedImage>): void => {
    setSelectedImages((currentImages) =>
      currentImages.map((image) => (image.id === imageId ? { ...image, ...patch } : image)),
    );
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | File[]): void => {
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

        if (file.size === 0) {
          rejectedMessages.push(`${file.name || "File"} is empty.`);
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
            rejectedMessages.push(
              `Upload requests can include at most ${MAX_UPLOAD_FILES} images.`,
            );
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
    },
    [isSubmitting],
  );

  const removeImage = useCallback((imageId: string): void => {
    setSelectedImages((currentImages) => {
      const image = currentImages.find((candidate) => candidate.id === imageId);

      if (image !== undefined) {
        URL.revokeObjectURL(image.previewUrl);
      }

      return currentImages.filter((candidate) => candidate.id !== imageId);
    });
  }, []);

  const clearImages = useCallback((options: { clearMessage?: boolean } = {}): void => {
    setSelectedImages((currentImages) => {
      for (const image of currentImages) {
        URL.revokeObjectURL(image.previewUrl);
      }

      return [];
    });

    if (options.clearMessage ?? true) {
      setMessage(null);
    }
  }, []);

  const submitQueue = useCallback(async (): Promise<void> => {
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
    if (uploadedCount > 0) {
      onUploadComplete?.();
    }
    setIsSubmitting(false);
  }, [isSubmitting, onUploadComplete, pendingImages, updateImage]);

  const retryFailed = useCallback((): void => {
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
  }, []);

  const queuedSelectionCount = useMemo(
    () =>
      selectedImages.filter((image) => image.status === "queued" || image.status === "failed")
        .length,
    [selectedImages],
  );
  const uploadButtonLabel = useMemo(() => {
    if (isSubmitting) {
      return "Uploading";
    }

    if (queuedSelectionCount === 0 && selectedImages.length > 0) {
      return "Uploaded";
    }

    return "Upload selected";
  }, [isSubmitting, queuedSelectionCount, selectedImages.length]);

  return {
    addFiles,
    clearImages,
    isSubmitting,
    message,
    pendingImages,
    removeImage,
    retryFailed,
    selectedImages,
    submitQueue,
    totalSize,
    uploadButtonLabel,
  };
}
