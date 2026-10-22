import { applyStudioArtworkPreview, attachStudioArtworkPreviewAfterUpload } from "./studioArtworkPreview";

const groups = () => [
  { id: "front", artworks: [
    { id: "layer-1", original_url: "/original.png", preview_asset_url: "" },
    { id: "layer-2", original_url: "/second.png", preview_asset_url: "" },
  ] },
  { id: "back", artworks: [{ id: "layer-1", original_url: "/other.png" }] },
];

test("attaches a preview only to the matching original in its group", () => {
  const before = groups();
  const after = applyStudioArtworkPreview(before, "front", "layer-1", "/original.png", "/preview.webp");
  expect(after[0].artworks[0].preview_asset_url).toBe("/preview.webp");
  expect(after[0].artworks[0].original_url).toBe("/original.png");
  expect(after[0].artworks[1]).toEqual(before[0].artworks[1]);
  expect(after[1]).toBe(before[1]);
  expect(before[0].artworks[0].preview_asset_url).toBe("");
});

test("ignores stale preview when original was replaced", () => {
  const before = groups();
  before[0].artworks[0].original_url = "/replacement.png";
  expect(applyStudioArtworkPreview(before, "front", "layer-1", "/original.png", "/late.webp")).toBe(before);
});

test("ignores stale preview when layer was removed", () => {
  const before = groups();
  before[0].artworks.splice(0, 1);
  expect(applyStudioArtworkPreview(before, "front", "layer-1", "/original.png", "/late.webp")).toBe(before);
});

test("ignores stale preview when group is removed", () => {
  const before = groups().slice(1);
  expect(applyStudioArtworkPreview(before, "front", "layer-1", "/original.png", "/late.webp")).toBe(before);
});

test("does not attach preview when required URL is absent", () => {
  const before = groups();
  expect(applyStudioArtworkPreview(before, "front", "layer-1", "/original.png", "")).toBe(before);
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("original layer is usable while preview generation is pending", async () => {
  let current = groups();
  const pending = deferred();
  const setGroups = jest.fn((next) => { current = next; });
  const uploadPreview = jest.fn(async () => "/preview.webp");
  const finished = attachStudioArtworkPreviewAfterUpload({
    previewPreparation: pending.promise, uploadPreview,
    getGroups: () => current, setGroups,
    groupId: "front", slotId: "layer-1", originalUrl: "/original.png",
  });
  expect(current[0].artworks[0].original_url).toBe("/original.png");
  expect(setGroups).not.toHaveBeenCalled();
  expect(uploadPreview).not.toHaveBeenCalled();
  pending.resolve({ file: "small.webp" });
  expect(await finished).toBe(true);
  expect(uploadPreview).toHaveBeenCalledWith({ file: "small.webp" });
  expect(current[0].artworks[0].preview_asset_url).toBe("/preview.webp");
});

test("preview generation failure never changes the original", async () => {
  const current = groups();
  const setGroups = jest.fn();
  const pending = deferred();
  const finished = attachStudioArtworkPreviewAfterUpload({
    previewPreparation: pending.promise,
    uploadPreview: jest.fn(),
    getGroups: () => current, setGroups,
    groupId: "front", slotId: "layer-1", originalUrl: "/original.png",
  });
  pending.reject(new Error("canvas failed"));
  expect(await finished).toBe(false);
  expect(setGroups).not.toHaveBeenCalled();
  expect(current[0].artworks[0].original_url).toBe("/original.png");
});

test("failed preview network upload does not change artwork", async () => {
  const current = groups();
  const setGroups = jest.fn();
  const finished = attachStudioArtworkPreviewAfterUpload({
    previewPreparation: Promise.resolve({ file: "small.webp" }),
    uploadPreview: async () => { throw new Error("preview endpoint unavailable"); },
    getGroups: () => current, setGroups,
    groupId: "front", slotId: "layer-1", originalUrl: "/original.png",
  });
  expect(await finished).toBe(false);
  expect(setGroups).not.toHaveBeenCalled();
});

test("late preview after replacement is discarded", async () => {
  let current = groups();
  const pending = deferred();
  const setGroups = jest.fn();
  const finished = attachStudioArtworkPreviewAfterUpload({
    previewPreparation: pending.promise,
    uploadPreview: async () => "/old-preview.webp",
    getGroups: () => current, setGroups,
    groupId: "front", slotId: "layer-1", originalUrl: "/original.png",
  });
  current = groups();
  current[0].artworks[0].original_url = "/replacement.png";
  pending.resolve({ file: "old.webp" });
  expect(await finished).toBe(false);
  expect(setGroups).not.toHaveBeenCalled();
});

test("late preview after deletion is discarded", async () => {
  let current = groups();
  const pending = deferred();
  const setGroups = jest.fn();
  const finished = attachStudioArtworkPreviewAfterUpload({
    previewPreparation: pending.promise,
    uploadPreview: async () => "/orphan.webp",
    getGroups: () => current, setGroups,
    groupId: "front", slotId: "layer-1", originalUrl: "/original.png",
  });
  current = groups();
  current[0].artworks.shift();
  pending.resolve({ file: "orphan.webp" });
  expect(await finished).toBe(false);
  expect(setGroups).not.toHaveBeenCalled();
});
