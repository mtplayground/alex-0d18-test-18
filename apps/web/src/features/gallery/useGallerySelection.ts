import { useCallback, useMemo, useState } from "react";

export function useGallerySelection(loadedImageIds: string[], onSelectionChange?: () => void) {
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(() => new Set());

  const selectedLoadedImageIds = useMemo(
    () => loadedImageIds.filter((imageId) => selectedImageIds.has(imageId)),
    [loadedImageIds, selectedImageIds],
  );
  const selectedCount = selectedLoadedImageIds.length;
  const hasLoadedImages = loadedImageIds.length > 0;
  const areAllLoadedImagesSelected =
    hasLoadedImages && selectedLoadedImageIds.length === loadedImageIds.length;

  const toggleImageSelection = useCallback(
    (imageId: string) => {
      onSelectionChange?.();
      setSelectedImageIds((currentImageIds) => {
        const nextImageIds = new Set(currentImageIds);

        if (nextImageIds.has(imageId)) {
          nextImageIds.delete(imageId);
        } else {
          nextImageIds.add(imageId);
        }

        return nextImageIds;
      });
    },
    [onSelectionChange],
  );

  const selectAllLoadedImages = useCallback(() => {
    onSelectionChange?.();
    setSelectedImageIds((currentImageIds) => {
      const nextImageIds = new Set(currentImageIds);

      for (const imageId of loadedImageIds) {
        nextImageIds.add(imageId);
      }

      return nextImageIds;
    });
  }, [loadedImageIds, onSelectionChange]);

  const clearSelection = useCallback(() => {
    onSelectionChange?.();
    setSelectedImageIds(new Set());
  }, [onSelectionChange]);

  return {
    areAllLoadedImagesSelected,
    clearSelection,
    hasLoadedImages,
    selectedCount,
    selectedImageIds,
    selectedLoadedImageIds,
    selectAllLoadedImages,
    toggleImageSelection,
  };
}
