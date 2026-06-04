import { useCallback, useState } from "react";
import { downloadImagesAsZip } from "../../lib/api/downloadImages";

export function useGalleryDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const clearDownloadError = useCallback(() => {
    setDownloadError(null);
  }, []);

  const downloadSelectedImages = useCallback(
    async (selectedLoadedImageIds: string[]) => {
      if (isDownloading) {
        return;
      }

      if (selectedLoadedImageIds.length === 0) {
        setDownloadError("Select at least one image from the current gallery before downloading.");
        return;
      }

      setIsDownloading(true);
      setDownloadError(null);

      try {
        const { blob, filename } = await downloadImagesAsZip({
          imageIds: selectedLoadedImageIds,
        });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = objectUrl;
        link.download = filename;
        link.rel = "noopener";
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        setDownloadError(
          error instanceof Error ? error.message : "Selected images could not be downloaded",
        );
      } finally {
        setIsDownloading(false);
      }
    },
    [isDownloading],
  );

  return {
    clearDownloadError,
    downloadError,
    downloadSelectedImages,
    isDownloading,
  };
}
