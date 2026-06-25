import React, { useEffect, useMemo, useState } from "react";
import { http } from "../lib/api";
import Navbar from "../components/Navbar";
import ProductCard from "../components/ProductCard";

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [creators, setCreators] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [creatorId, setCreatorId] = useState("all");

  useEffect(() => {
    http.get("/products").then((r) => setProducts(r.data || [])).catch(() => {});
    http.get("/creators").then((r) => setCreators(r.data || [])).catch(() => {});
  }, []);

  const creatorNameById = useMemo(() => {
    return creators.reduce((acc, creator) => {
      acc[creator.id] = creator.name;
      return acc;
    }, {});
  }, [creators]);

  const categories = useMemo(() => {
    return [
      "all",
      ...Array.from(
        new Set(
          products
            .map((product) => product.category)
            .filter(Boolean)
        )
      ),
    ];
  }, [products]);

  const filtered = products.filter((product) => {
    const matchesSearch =
      !q ||
      product.title?.toLowerCase().includes(q.toLowerCase()) ||
      creatorNameById[product.band_id]?.toLowerCase().includes(q.toLowerCase());

    const matchesCategory = cat === "all" || product.category === cat;
    const matchesCreator = creatorId === "all" || product.band_id === creatorId;

    return matchesSearch && matchesCategory && matchesCreator;
  });

  return (
    <div className="min-h-screen page-shell">
      <Navbar />

      <section className="pt-24 pb-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <p className="overline mb-2">Marketplace</p>
          <h1 className="font-display text-6xl md:text-7xl uppercase">
            Shop Official Merch
          </h1>
          <p className="text-[var(--ff-muted-text)] max-w-2xl mt-4">
            Browse T-shirts, hoodies, drops and custom merch from creators, festivals and events.
          </p>

          <div className="grid md:grid-cols-3 gap-4 mt-8 max-w-5xl">
            <div>
              <label htmlFor="shop-search" className="label">
                Search
              </label>
              <input
                id="shop-search"
                name="shop-search"
                className="input-base"
                placeholder="Search products or creators..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="shop-category" className="label">
                Category
              </label>
              <select
                id="shop-category"
                name="shop-category"
                className="input-base"
                value={cat}
                onChange={(e) => setCat(e.target.value)}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category === "all" ? "All categories" : category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="shop-creator" className="label">
                Creator
              </label>
              <select
                id="shop-creator"
                name="shop-creator"
                className="input-base"
                value={creatorId}
                onChange={(e) => setCreatorId(e.target.value)}
              >
                <option value="all">All creators</option>
                {creators.map((creator) => (
                  <option key={creator.id} value={creator.id}>
                    {creator.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-6 md:px-10 py-12">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-[var(--ff-muted-text)]">
            Showing {filtered.length} of {products.length} products
          </p>

          {(q || cat !== "all" || creatorId !== "all") && (
            <button
              type="button"
              className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold hover:text-[var(--ff-primary)]"
              onClick={() => {
                setQ("");
                setCat("all");
                setCreatorId("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {filtered.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={{
                  ...product,
                  creator_name: creatorNameById[product.band_id],
                }}
              />
            ))}
          </div>
        ) : (
          <div className="card text-[var(--ff-muted-text)]">
            No products found for the selected filters.
          </div>
        )}
      </main>
    </div>
  );
}