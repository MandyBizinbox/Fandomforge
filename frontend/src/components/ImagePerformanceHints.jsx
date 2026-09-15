import { useEffect } from "react";

function tuneImage(image) {
  if (!(image instanceof HTMLImageElement)) return;
  if (!image.decoding) image.decoding = "async";

  window.requestAnimationFrame(() => {
    const bounds = image.getBoundingClientRect();
    const nearViewport = bounds.top < window.innerHeight * 1.25 && bounds.bottom > -200;

    if (nearViewport) {
      image.loading = "eager";
      image.fetchPriority = "high";
    } else {
      image.loading = "lazy";
      image.fetchPriority = "low";
    }
  });
}

function tuneNode(node) {
  if (!(node instanceof Element)) return;
  if (node.tagName === "IMG") tuneImage(node);
  node.querySelectorAll?.("img").forEach(tuneImage);
}

export default function ImagePerformanceHints() {
  useEffect(() => {
    document.querySelectorAll("img").forEach(tuneImage);

    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach(tuneNode);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
