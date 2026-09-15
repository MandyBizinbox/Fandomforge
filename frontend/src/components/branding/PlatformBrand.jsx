import React from "react";
import { assetUrl } from "../../lib/api";
import { usePlatformConfig } from "../../lib/platform";

export default function PlatformBrand({
  className = "",
  textClassName = "font-display uppercase tracking-tight",
  compact = false,
  showTagline = false,
}) {
  const { platform } = usePlatformConfig();
  const platformName = String(platform?.platform_name || "Fandom Forge").trim() || "Fandom Forge";
  const logoUrl = platform?.logo_primary_url || platform?.logo_url || "";
  const altText = platform?.brand_alt_text || platformName;

  return (
    <span className="inline-flex min-w-0 flex-col justify-center">
      {logoUrl ? (
        <img
          src={assetUrl(logoUrl)}
          alt={altText}
          className={`block object-contain object-left ${compact ? "max-h-9 max-w-10" : "max-h-12 max-w-full"} ${className}`}
        />
      ) : (
        <span className={`${textClassName} ${className}`}>{platformName}</span>
      )}
      {showTagline && platform?.platform_tagline && (
        <span className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--ff-muted-text)]">
          {platform.platform_tagline}
        </span>
      )}
    </span>
  );
}
