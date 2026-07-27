import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Store } from "lucide-react";
import Navbar from "../components/Navbar";
import ProductCard from "../components/ProductCard";
import { assetUrl, http } from "../lib/api";
import { usePlatformConfig } from "../lib/platform";

function normalise(value) {
  return String(value || "").trim().toLowerCase();
}

function creatorVisibility(creator) {
  return normalise(
    creator?.visibility
    || creator?.store_visibility
    || creator?.storefront_visibility
    || (creator?.is_public === true ? "public" : "")
    || "unlisted"
  );
}

function CreatorCardContent({ creator }) {
  return (
    <>
      <div className="h-36 bg-[var(--ff-surface-bg)] border border-[var(--ff-card-border)] mb-4 flex items-center justify-center overflow-hidden">
        {creator.banner_url ? (
          <img src={assetUrl(creator.banner_url)} alt="" className="w-full h-full object-cover" />
        ) : creator.logo_url ? (
          <img src={assetUrl(creator.logo_url)} alt="" className="max-w-full max-h-full object-contain p-4" />
        ) : (
          <Store size={44} className="text-[var(--ff-primary)]" />
        )}
      </div>
      <h2 className="font-display text-3xl uppercase leading-none">{creator.display_name || creator.name || "Creator Store"}</h2>
      {creator.category && <p className="overline mt-3">{creator.category}</p>}
      {creator.bio && <p className="text-sm text-[var(--ff-muted-text)] mt-3 line-clamp-3">{creator.bio}</p>}
    </>
  );
}

export default function Marketplace() {
  const { platform } = usePlatformConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const query = searchParams.get("q") || "";

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    http.get("/products?published=true")
      .then((response) => {
        if (mounted) setProducts(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => {
        if (mounted) setProducts([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = normalise(query);
    if (!needle) return products;
    return products.filter((product) => normalise([
      product.title,
      product.description,
      product.category,
      product.creator_name,
      product.band_name,
    ].join(" ")).includes(needle));
  }, [products, query]);

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-16 max-w-7xl mx-auto px-6 md:px-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
          <div>
            <p className="overline mb-2">{platform.platform_name || "Fandom Forge"} marketplace</p>
            <h1 className="font-display text-5xl md:text-6xl uppercase">Shop Community Merchandise</h1>
            <p className="text-[var(--ff-muted-text)] mt-3 max-w-3xl">Browse published products from active creator and community stores.</p>
          </div>
          <Link to="/creators" className="btn-secondary">Browse Creator Stores</Link>
        </div>

        <label className="relative block max-w-xl mb-8">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ff-muted-text)]" />
          <input
            className="input-base pl-12"
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setSearchParams(next ? { q: next } : {});
            }}
            placeholder="Search products, categories or stores"
            aria-label="Search products"
          />
        </label>

        {loading ? (
          <div className="card overline">Loading products…</div>
        ) : filtered.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className="card text-center py-12">
            <Store size={42} className="mx-auto text-[var(--ff-primary)] mb-4" />
            <h2 className="font-display text-3xl uppercase">No matching products</h2>
            <p className="text-[var(--ff-muted-text)] mt-2">Published products will appear here as creator stores launch.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export function CreatorDirectory() {
  const { platform } = usePlatformConfig();
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [privateCreator, setPrivateCreator] = useState(null);

  useEffect(() => {
    let mounted = true;

    Promise.allSettled([
      http.get("/public/creators/gallery"),
      http.get("/creators"),
    ])
      .then(([galleryResult, publicResult]) => {
        if (!mounted) return;

        const gallery = galleryResult.status === "fulfilled" && Array.isArray(galleryResult.value.data)
          ? galleryResult.value.data
          : [];
        const publicCreators = publicResult.status === "fulfilled" && Array.isArray(publicResult.value.data)
          ? publicResult.value.data
          : [];
        const publicById = new Map(publicCreators.map((creator) => [creator.id, creator]));

        setCreators(gallery.map((galleryCreator) => {
          const publicCreator = publicById.get(galleryCreator.id);
          if (!publicCreator) return galleryCreator;

          return {
            ...publicCreator,
            ...galleryCreator,
            slug: publicCreator.slug || galleryCreator.slug,
            visibility: publicCreator.visibility || galleryCreator.visibility || "public",
            show_on_platform_gallery: publicCreator.show_on_platform_gallery ?? galleryCreator.show_on_platform_gallery,
          };
        }));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = normalise(query);
    if (!needle) return creators;
    return creators.filter((creator) => normalise([
      creator.display_name,
      creator.name,
      creator.category,
      creator.bio,
    ].join(" ")).includes(needle));
  }, [creators, query]);

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-16 max-w-7xl mx-auto px-6 md:px-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
          <div>
            <p className="overline mb-2">{platform.platform_name || "Fandom Forge"}</p>
            <h1 className="font-display text-5xl md:text-6xl uppercase">Creator Stores</h1>
            <p className="text-[var(--ff-muted-text)] mt-3 max-w-3xl">Browse creator and community stores. Some stores are private and can only be accessed using a link shared by the store owner.</p>
          </div>
          <Link to="/shop" className="btn-secondary">Shop All Products</Link>
        </div>

        <label className="relative block max-w-xl mb-8">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ff-muted-text)]" />
          <input className="input-base pl-12" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search creator stores" aria-label="Search creator stores" />
        </label>

        {loading ? (
          <div className="card overline">Loading creator stores…</div>
        ) : filtered.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((creator) => {
              const isPublic = creatorVisibility(creator) === "public";
              const cardClass = "card card-interactive block w-full text-left";
              if (isPublic && creator.slug) {
                return (
                  <Link key={creator.id || creator.slug} to={`/creators/${creator.slug}`} className={cardClass}>
                    <CreatorCardContent creator={creator} />
                  </Link>
                );
              }
              return (
                <button
                  key={creator.id || creator.slug}
                  type="button"
                  className={cardClass}
                  onClick={() => setPrivateCreator(creator)}
                  aria-haspopup="dialog"
                >
                  <CreatorCardContent creator={creator} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="card text-center py-12">
            <Store size={42} className="mx-auto text-[var(--ff-primary)] mb-4" />
            <h2 className="font-display text-3xl uppercase">No matching stores</h2>
            <p className="text-[var(--ff-muted-text)] mt-2">Creator stores will appear here as onboarding is completed.</p>
          </div>
        )}
      </main>

      {privateCreator && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 px-4 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="private-store-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPrivateCreator(null);
          }}
        >
          <div className="card max-w-lg w-full text-center py-10 px-6">
            <Store size={42} className="mx-auto text-[var(--ff-primary)] mb-4" />
            <p className="overline mb-2">{privateCreator.display_name || privateCreator.name || "Creator store"}</p>
            <h2 id="private-store-title" className="font-display text-4xl uppercase mb-4">This is a private store</h2>
            <p className="text-[var(--ff-muted-text)] mb-7">This store is not open to the general public. Please use the private link shared by the store owner to access it.</p>
            <button type="button" className="btn-primary" onClick={() => setPrivateCreator(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
