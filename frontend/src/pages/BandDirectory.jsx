import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { http, assetUrl } from "../lib/api";
import Navbar from "../components/Navbar";

export default function BandDirectory() {
  const [creators, setCreators] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    http.get("/creators").then((r) => setCreators(r.data || [])).catch(() => {});
  }, []);

  const filtered = creators.filter((creator) =>
    creator.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="min-h-screen page-shell">
      <Navbar />

      <section className="pt-24 pb-16 border-b border-[var(--ff-card-border)]" data-testid="creator-directory-hero">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="overline mb-2">Creator Directory</div>
          <h1 className="font-display text-6xl md:text-7xl uppercase">
            All Creators
          </h1>
          <p className="text-[var(--ff-muted-text)] max-w-2xl mt-4">
            Discover official merch from creators, events, festivals and brands.
          </p>

          <label htmlFor="creator-search" className="sr-only">
            Search creators
          </label>
          <input
            id="creator-search"
            name="creator-search"
            className="input-base mt-8 max-w-md"
            placeholder="Search creators..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            data-testid="creator-search-input"
          />
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-6 md:px-10 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-[var(--ff-card-border)]">
          {filtered.map((creator, i) => (
            <Link
              to={`/creators/${creator.slug}`}
              key={creator.id}
              className={`relative h-72 group overflow-hidden border-b border-[var(--ff-card-border)] ${
                i % 2 === 0 ? "md:border-r" : ""
              }`}
              data-testid={`directory-creator-${creator.slug}`}
            >
              {creator.banner_url && (
                <img
                  src={assetUrl(creator.banner_url)}
                  alt={creator.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-all duration-700"
                />
              )}

              {!creator.banner_url && (
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-black" />
              )}

              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/5 transition" />

              <div className="relative h-full flex flex-col justify-end p-8">
                <p className="overline mb-2">Official Store</p>
                <h3 className="font-display text-4xl uppercase leading-none">
                  {creator.name}
                </h3>
                <p className="text-white/90 text-sm mt-2 line-clamp-2 max-w-lg">
                  {creator.bio || "Shop official merch and exclusive drops."}
                </p>
              </div>
            </Link>
          ))}

          {filtered.length === 0 && (
            <div className="p-10 text-[var(--ff-muted-text)]">
              No creators found.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}