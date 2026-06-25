import React, { useMemo, useState, useEffect } from "react";
import { assetUrl } from "../../lib/api";
import { getProductGalleryImages } from "./productDisplayUtils";
import { Shirt } from "lucide-react";

export default function ProductGallery({ product, variation, customization }) {
  const images = useMemo(() => {
    const base = getProductGalleryImages(product, variation);
    if (customization?.preview_image) return [customization.preview_image, ...base];
    return base;
  }, [product, variation, customization]);

  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
  }, [variation?.id, customization?.preview_image, product?.id]);

  const activeImage = images[active] || images[0];

  return (
    <div data-testid="product-gallery">
      <div className="w-full aspect-square bg-[var(--ff-surface-bg)] border border-[var(--ff-card-border)] flex items-center justify-center overflow-hidden">
        {activeImage ? (
          <img
            src={assetUrl(activeImage)}
            alt={product?.title || "Product mockup"}
            className="w-full h-full object-contain"
            data-testid="product-main-image"
          />
        ) : (
          <div className="text-center text-zinc-700">
            <Shirt className="mx-auto mb-4" size={56} />
            <div className="font-display text-5xl">MF</div>
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div
          className="flex sm:grid sm:grid-cols-5 gap-2 mt-3 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0"
          data-testid="product-gallery-thumbs"
        >
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              className={`w-14 h-14 sm:w-auto sm:h-auto sm:aspect-square flex-shrink-0 bg-[var(--ff-surface-bg)] border overflow-hidden ${active === index ? "border-[var(--ff-primary)]" : "border-[var(--ff-card-border)] hover:border-[var(--ff-primary)]"}`}
              data-testid={`product-gallery-thumb-${index}`}
            >
              <img src={assetUrl(image)} alt="" className="w-full h-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
