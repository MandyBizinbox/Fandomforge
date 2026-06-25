import React from "react";
import { Link } from "react-router-dom";
import { assetUrl } from "../lib/api";
import { getProductPrimaryImage } from "./product/productDisplayUtils";

export default function ProductCard({ product }) {
  const img = getProductPrimaryImage(product);
  const creatorName = product.creator_name || product.band_name || product.creatorName;
  const hasGroupedArtwork = (product.artwork_groups || []).length > 0;

  return (
    <Link
      to={`/product/${product.id}`}
      className="card card-interactive block group"
      data-testid={`product-card-${product.id}`}
    >
      <div className="aspect-square overflow-hidden mb-4 border bg-[var(--ff-surface-bg)] border-[var(--ff-card-border)]">
        {img ? (
          <img
            src={assetUrl(img)}
            alt={product.title}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--ff-muted-text)] font-display text-4xl">
            MF
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="overline">{product.category || "Merch"}</div>
        {creatorName && (
          <div className="text-[10px] uppercase tracking-widest text-[var(--ff-muted-text)] truncate max-w-[120px]">
            {creatorName}
          </div>
        )}
      </div>

      <h3 className="font-display text-xl uppercase leading-none mb-2 group-hover:text-[var(--ff-primary)]">
        {product.title}
      </h3>

      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">
          R {Number(product.selling_price || 0).toFixed(2)}
        </span>

        <div className="flex items-center gap-2">
          {hasGroupedArtwork && (
            <span className="text-[10px] uppercase tracking-widest text-[var(--ff-muted-text)] font-bold">
              Multi-view
            </span>
          )}

          {product.customization_enabled && (
            <span className="text-[10px] uppercase tracking-widest text-[var(--ff-primary)] font-bold">
              Customize
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
