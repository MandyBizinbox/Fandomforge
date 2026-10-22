import { applyStudioArtworkPreview } from "./studioArtworkPreview";

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
