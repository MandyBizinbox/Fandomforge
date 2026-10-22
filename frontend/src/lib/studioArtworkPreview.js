// Apply an editor-only preview without ever changing a production original.
// A slow preview must not resurrect a deleted layer or overwrite a replacement.
export function applyStudioArtworkPreview(groups, groupId, slotId, originalUrl, previewUrl) {
  if (!groupId || !slotId || !originalUrl || !previewUrl) return groups;
  let matched = false;
  const next = (groups || []).map((group) => {
    if (group.id !== groupId) return group;
    const artworks = (group.artworks || []).map((slot) => {
      if (slot.id !== slotId || slot.original_url !== originalUrl) return slot;
      matched = true;
      return { ...slot, preview_asset_url: previewUrl };
    });
    return matched ? { ...group, artworks } : group;
  });
  return matched ? next : groups;
}


// Preview failures are deliberately non-fatal: the original has already been
// uploaded and applied. The callback reads current groups after the upload.
export function attachStudioArtworkPreviewAfterUpload({
  previewPreparation, uploadPreview, getGroups, setGroups,
  groupId, slotId, originalUrl,
}) {
  return Promise.resolve(previewPreparation).then(async (preview) => {
    if (!preview) return false;
    const previewUrl = await uploadPreview(preview);
    if (!previewUrl) return false;
    const currentGroups = getGroups();
    const updatedGroups = applyStudioArtworkPreview(
      currentGroups, groupId, slotId, originalUrl, previewUrl
    );
    if (updatedGroups === currentGroups) return false;
    setGroups(updatedGroups);
    return true;
  }).catch(() => false);
}
