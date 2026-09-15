import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
  Sparkles,
} from "lucide-react";
import { assetUrl, http } from "../../lib/api";
import {
  creatorCatalogueCard,
  creatorCatalogueCategories,
  creatorCatalogueColours,
  creatorCatalogueGallery,
  creatorCatalogueMatches,
  creatorCataloguePrintAreas,
  creatorCataloguePrintMethods,
  creatorCatalogueProductTypeLabel,
  creatorCatalogueSizes,
  creatorCatalogueSpecs,
  creatorCatalogueTemplates,
} from "../../lib/creatorCatalogue";
import { templateReadiness } from "../../lib/templateReadiness";
import "./creatorCatalogue.css";

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function methodLabel(value) {
  return String(value || "").replace(/[_-]+/g, " ").trim();
}

function ProductImage({ src, alt, className = "" }) {
  if (!src) {
    return (
      <div className={`creator-catalogue-image-placeholder ${className}`}>
        <Package size={34} />
        <span>Product image</span>
      </div>
    );
  }
  return <img src={assetUrl(src)} alt={alt} className={className} loading="lazy" />;
}

function CatalogueCard({ template, printOptions, productTypes, onOpen }) {
  const card = creatorCatalogueCard(template, printOptions, productTypes);
  const colourPreview = card.colours.slice(0, 6);
  const extraColours = Math.max(0, card.colours.length - colourPreview.length);

  return (
    <button
      type="button"
      className="creator-catalogue-card"
      onClick={() => onOpen(template.id)}
      data-testid={`creator-catalogue-card-${template.id}`}
    >
      <div className="creator-catalogue-card-media">
        <ProductImage src={card.image} alt={card.name} className="creator-catalogue-card-image" />
      </div>
      <div className="creator-catalogue-card-body">
        <div className="creator-catalogue-card-copy">
          <div className="creator-catalogue-eyebrow">{card.category}</div>
          <h3>{card.name}</h3>
          {card.brand && <p className="creator-catalogue-brand">{card.brand}</p>}
        </div>

        <div className="creator-catalogue-card-meta">
          {card.blankCost > 0 && (
            <div>
              <span>Base product from</span>
              <strong>{money(card.blankCost)}</strong>
            </div>
          )}
          {card.sizes.length > 0 && (
            <div>
              <span>Sizes</span>
              <strong>{card.sizes.length}</strong>
            </div>
          )}
        </div>

        {(colourPreview.length > 0 || card.printMethods.length > 0) && (
          <div className="creator-catalogue-card-footer">
            {colourPreview.length > 0 && (
              <div className="creator-catalogue-swatches" aria-label={`${card.colours.length} colours`}>
                {colourPreview.map((colour) => (
                  <span
                    key={colour.name}
                    className={`creator-catalogue-swatch ${colour.hex ? "has-colour" : ""}`}
                    style={colour.hex ? { backgroundColor: colour.hex } : undefined}
                    title={colour.name}
                  />
                ))}
                {extraColours > 0 && <span className="creator-catalogue-more">+{extraColours}</span>}
              </div>
            )}
            {card.printMethods.length > 0 && (
              <span className="creator-catalogue-method-summary">{card.printMethods.slice(0, 2).join(" · ")}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

function CatalogueDetail({ template, printOptions, productTypes, onBack }) {
  const navigate = useNavigate();
  const gallery = useMemo(() => creatorCatalogueGallery(template), [template]);
  const colours = useMemo(() => creatorCatalogueColours(template), [template]);
  const sizes = useMemo(() => creatorCatalogueSizes(template), [template]);
  const printAreas = useMemo(() => creatorCataloguePrintAreas(template), [template]);
  const printMethods = useMemo(() => creatorCataloguePrintMethods(template, printOptions), [template, printOptions]);
  const specs = useMemo(() => creatorCatalogueSpecs(template), [template]);
  const ready = useMemo(() => templateReadiness(template, printOptions), [template, printOptions]);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    setActiveImage(0);
  }, [template?.id]);

  const currentImage = gallery[activeImage] || gallery[0] || null;
  const name = template.name || template.title || "Product";
  const category = creatorCatalogueProductTypeLabel(template, productTypes);
  const description = template.long_description || template.description || template.short_description || "";
  const brand = template.brand || template.supplier_brand || "";

  const changeImage = (delta) => {
    if (gallery.length <= 1) return;
    setActiveImage((current) => (current + delta + gallery.length) % gallery.length);
  };

  return (
    <div className="creator-catalogue-detail" data-testid="creator-catalogue-detail">
      <button type="button" className="creator-catalogue-back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to catalogue
      </button>

      <div className="creator-catalogue-detail-hero">
        <section className="creator-catalogue-gallery" aria-label={`${name} images`}>
          <div className="creator-catalogue-gallery-main">
            <ProductImage src={currentImage?.url} alt={currentImage?.label || name} className="creator-catalogue-detail-image" />
            {gallery.length > 1 && (
              <>
                <button type="button" className="creator-catalogue-gallery-control left" onClick={() => changeImage(-1)} aria-label="Previous image">
                  <ChevronLeft size={20} />
                </button>
                <button type="button" className="creator-catalogue-gallery-control right" onClick={() => changeImage(1)} aria-label="Next image">
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="creator-catalogue-thumbnails">
              {gallery.slice(0, 8).map((image, index) => (
                <button
                  type="button"
                  key={`${image.url}-${index}`}
                  className={`creator-catalogue-thumbnail ${index === activeImage ? "active" : ""}`}
                  onClick={() => setActiveImage(index)}
                  aria-label={`View ${image.label || `image ${index + 1}`}`}
                >
                  <ProductImage src={image.url} alt="" className="creator-catalogue-thumbnail-image" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="creator-catalogue-detail-copy">
          <div className="creator-catalogue-breadcrumb">Catalogue / {category}</div>
          <h1>{name}</h1>
          {brand && <div className="creator-catalogue-detail-brand">{brand}</div>}
          {description && <p className="creator-catalogue-description">{description}</p>}

          {printMethods.length > 0 && (
            <div className="creator-catalogue-detail-block">
              <div className="creator-catalogue-detail-label">Available print methods</div>
              <div className="creator-catalogue-pills">
                {printMethods.map((method) => <span key={method}>{methodLabel(method)}</span>)}
              </div>
            </div>
          )}

          <div className="creator-catalogue-price-panel">
            <div>
              <div className="creator-catalogue-detail-label">Base product from</div>
              <div className="creator-catalogue-price">{ready.blankCost > 0 ? money(ready.blankCost) : "Calculated in builder"}</div>
              <p>Printing is calculated from your design, print area and production method in the builder.</p>
            </div>
            <button
              type="button"
              className="btn-primary creator-catalogue-start"
              onClick={() => navigate(`/creator/products/new?template=${encodeURIComponent(template.id)}`)}
            >
              <Sparkles size={16} /> Start designing
            </button>
          </div>
        </section>
      </div>

      <section className="creator-catalogue-facts">
        <div className="creator-catalogue-fact">
          <div className="creator-catalogue-detail-label">Colours</div>
          <strong>{colours.length || "—"}</strong>
          {colours.length > 0 && (
            <div className="creator-catalogue-colour-list">
              {colours.slice(0, 16).map((colour) => (
                <span key={colour.name} className="creator-catalogue-colour-chip" title={colour.name}>
                  <span
                    className={`creator-catalogue-swatch ${colour.hex ? "has-colour" : ""}`}
                    style={colour.hex ? { backgroundColor: colour.hex } : undefined}
                  />
                  {colour.name}
                </span>
              ))}
              {colours.length > 16 && <span className="creator-catalogue-more">+{colours.length - 16} more</span>}
            </div>
          )}
        </div>

        <div className="creator-catalogue-fact">
          <div className="creator-catalogue-detail-label">Sizes</div>
          <strong>{sizes.length || "—"}</strong>
          {sizes.length > 0 && <p>{sizes.join(" · ")}</p>}
        </div>

        <div className="creator-catalogue-fact">
          <div className="creator-catalogue-detail-label">Print areas</div>
          <strong>{printAreas.length || "—"}</strong>
          {printAreas.length > 0 && (
            <div className="creator-catalogue-print-areas">
              {printAreas.map((area) => (
                <span key={area}><Check size={13} /> {area}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      {(specs.length > 0 || description) && (
        <section className="creator-catalogue-information">
          <div>
            <div className="creator-catalogue-eyebrow">Product information</div>
            <h2>Everything you need before you design</h2>
          </div>
          <div className="creator-catalogue-information-copy">
            {description && <p>{description}</p>}
            {specs.length > 0 && (
              <ul>
                {specs.map((spec, index) => <li key={`${spec}-${index}`}>{spec}</li>)}
              </ul>
            )}
          </div>
        </section>
      )}

      <div className="creator-catalogue-bottom-action">
        <button type="button" className="btn-secondary" onClick={onBack}>Back to catalogue</button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate(`/creator/products/new?template=${encodeURIComponent(template.id)}`)}
        >
          Start designing
        </button>
      </div>
    </div>
  );
}

export default function CreatorCatalogue() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [templates, setTemplates] = useState([]);
  const [printOptions, setPrintOptions] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const [templateResult, printResult, typeResult] = await Promise.allSettled([
        http.get("/product-templates"),
        http.get("/print-options"),
        http.get("/public/product-types?status=active"),
      ]);
      if (!active) return;

      if (templateResult.status !== "fulfilled") {
        setError(templateResult.reason?.response?.data?.detail || "Could not load the product catalogue.");
        setTemplates([]);
      } else {
        setTemplates(asArray(templateResult.value.data));
      }
      setPrintOptions(printResult.status === "fulfilled" ? asArray(printResult.value.data) : []);
      setProductTypes(typeResult.status === "fulfilled" ? asArray(typeResult.value.data) : []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const launchReadyTemplates = useMemo(
    () => creatorCatalogueTemplates(templates, printOptions),
    [templates, printOptions]
  );
  const categories = useMemo(
    () => creatorCatalogueCategories(launchReadyTemplates, productTypes),
    [launchReadyTemplates, productTypes]
  );
  const filteredTemplates = useMemo(
    () => launchReadyTemplates.filter((template) => creatorCatalogueMatches(template, query, category, productTypes)),
    [launchReadyTemplates, query, category, productTypes]
  );

  const selectedTemplateId = searchParams.get("template") || "";
  const selectedTemplate = launchReadyTemplates.find((template) => String(template.id) === String(selectedTemplateId)) || null;

  const openTemplate = (templateId) => {
    const next = new URLSearchParams(searchParams);
    next.set("section", "catalogue");
    next.set("template", String(templateId));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeTemplate = () => {
    const next = new URLSearchParams(searchParams);
    next.set("section", "catalogue");
    next.delete("template");
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="creator-catalogue" data-testid="creator-catalogue-loading">
        <div className="creator-catalogue-loading-grid">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="creator-catalogue-skeleton" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="creator-catalogue creator-catalogue-empty">
        <Package size={34} />
        <h2>Catalogue unavailable</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (selectedTemplate) {
    return (
      <div className="creator-catalogue">
        <CatalogueDetail
          template={selectedTemplate}
          printOptions={printOptions}
          productTypes={productTypes}
          onBack={closeTemplate}
        />
      </div>
    );
  }

  return (
    <div className="creator-catalogue" data-testid="creator-catalogue">
      <header className="creator-catalogue-header">
        <div>
          <div className="creator-catalogue-eyebrow">Creator catalogue</div>
          <h1>Choose what you want to create</h1>
          <p>Browse the merch range, check available options and open a product when you are ready to design.</p>
        </div>
        <div className="creator-catalogue-count">{launchReadyTemplates.length} products ready to customise</div>
      </header>

      <div className="creator-catalogue-toolbar">
        <label className="creator-catalogue-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, categories or brands"
            aria-label="Search catalogue"
          />
        </label>
      </div>

      <div className="creator-catalogue-categories" role="tablist" aria-label="Catalogue categories">
        <button type="button" className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>All</button>
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            className={category === item ? "active" : ""}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="creator-catalogue-empty">
          <Search size={30} />
          <h2>No products found</h2>
          <p>Try another search or category.</p>
        </div>
      ) : (
        <div className="creator-catalogue-grid">
          {filteredTemplates.map((template) => (
            <CatalogueCard
              key={template.id}
              template={template}
              printOptions={printOptions}
              productTypes={productTypes}
              onOpen={openTemplate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
