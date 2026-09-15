import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, RotateCcw, ShieldCheck, Store } from "lucide-react";
import { http } from "../lib/api";
import Navbar from "../components/Navbar";
import Customizer from "../components/Customizer";
import { useCart } from "../context/CartContext";
import { toast } from "sonner";
import { creatorStorePath, getLastCreatorStore, saveLastCreatorStore } from "../lib/creatorStoreContext";
import ProductGallery from "../components/product/ProductGallery";
import VariationSelector from "../components/product/VariationSelector";
import {
  buildInitialSelection,
  findSelectedVariation,
  getProductGalleryImages,
  getProductPrimaryImage,
  getEffectiveSellingPrice,
  getVariationColour,
  getVariationLabel,
  getVariationSize,
  resolveArtworkGroup,
} from "../components/product/productDisplayUtils";

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [productTemplate, setProductTemplate] = useState(null);
  const [selected, setSelected] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [customization, setCustomization] = useState(null);
  const [creator, setCreator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { addItem } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError("");
      setProduct(null);
      setProductTemplate(null);

      try {
        const productResponse = await http.get(`/products/${id}`);
        const loadedProduct = productResponse.data;
        if (!mounted) return;

        setProduct(loadedProduct);
        setSelected(buildInitialSelection(loadedProduct));

        const storedCreator = getLastCreatorStore();
        if (storedCreator) setCreator(storedCreator);

        const creatorsResponse = await http.get("/creators").catch(() => ({ data: [] }));
        if (!mounted) return;
        const listedCreator = (Array.isArray(creatorsResponse.data) ? creatorsResponse.data : []).find((row) => row.id === loadedProduct.band_id) || null;
        if (listedCreator) {
          setCreator(listedCreator);
          saveLastCreatorStore({ slug: listedCreator.slug, name: listedCreator.name });
        }
      } catch (requestError) {
        if (!mounted) return;
        setError(requestError.response?.status === 404
          ? "This product could not be found or is no longer available."
          : requestError.response?.data?.detail || "This product could not be loaded.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [id]);

  const variation = useMemo(() => findSelectedVariation(product || {}, selected), [product, selected]);
  const artworkGroup = useMemo(() => resolveArtworkGroup(product || {}, variation), [product, variation]);
  const galleryImages = useMemo(() => getProductGalleryImages(product || {}, variation), [product, variation]);

  useEffect(() => {
    let mounted = true;

    async function loadProductTemplate() {
      if (!product?.template_id) {
        setProductTemplate(null);
        return;
      }

      try {
        const response = await http.get(`/product-templates/${product.template_id}`);
        if (mounted) setProductTemplate(response.data);
      } catch {
        if (mounted) setProductTemplate(null);
      }
    }

    loadProductTemplate();
    return () => {
      mounted = false;
    };
  }, [product?.template_id]);

  const unitPrice = getEffectiveSellingPrice(product, variation);
  const variationLabel = variation ? getVariationLabel(variation) : "";
  const isOutOfStock = variation?.stock_status === "out_of_stock";

  const addToCart = () => {
    if (!variation) {
      toast.error("Choose an available product option.");
      return;
    }
    if (isOutOfStock) {
      toast.error("This option is currently out of stock.");
      return;
    }

    const mockupUrl = customization?.preview_image || getProductPrimaryImage(product, variation);

    addItem({
      product_id: product.id,
      product_title: product.title,
      band_id: product.band_id,
      creator_slug: creator?.slug || getLastCreatorStore()?.slug || null,
      creator_name: creator?.name || getLastCreatorStore()?.name || null,
      variation_id: variation.id,
      size: getVariationSize(variation),
      color: getVariationColour(variation),
      attribute_values: variation.attribute_values || {},
      variation_label: variationLabel,
      artwork_group_id: artworkGroup?.id || null,
      artwork_group_label: artworkGroup?.label || null,
      unit_price: Number(unitPrice || 0),
      quantity,
      mockup_url: mockupUrl,
      mockup_images: galleryImages,
      primary_mockup_image_url: mockupUrl,
      customization,
    });

    toast.success("Added to cart", { description: product.title });
    navigate("/cart");
  };

  if (loading) {
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <div className="pt-32 overline text-center">Loading product…</div>
      </div>
    );
  }

  if (error || !product) {
    const store = creator || getLastCreatorStore();
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <main className="pt-32 pb-16 max-w-3xl mx-auto px-4 sm:px-6 md:px-10 text-center">
          <div className="card py-14">
            <AlertTriangle className="mx-auto text-[var(--ff-primary)] mb-5" size={38} />
            <p className="overline mb-2">Product unavailable</p>
            <h1 className="font-display text-4xl sm:text-5xl uppercase mb-4">This product cannot be displayed</h1>
            <p className="text-[var(--ff-muted-text)] mb-6">{error || "This product is not currently available."}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {store && <Link to={creatorStorePath(store)} className="btn-primary">Return to {store.name}</Link>}
              <Link to="/contact" className="btn-secondary">Contact Support</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10">
          {showCustomizer ? (
            <>
              <div className="overline mb-4">Customise — {product.title}</div>
              <Customizer
                mockupUrl={getProductPrimaryImage(product, variation)}
                onCancel={() => setShowCustomizer(false)}
                onSave={(data) => {
                  setCustomization(data);
                  setShowCustomizer(false);
                  toast.success("Custom design saved.");
                }}
              />
            </>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-8 lg:gap-12">
              <div>
                <ProductGallery product={product} variation={variation} customization={customization} />
                <div className="hidden lg:block">
                  <SizeChartDisplay sizeChart={productTemplate?.size_chart} />
                </div>
              </div>

              <div>
                {creator && (
                  <div className="mb-5" data-testid="product-creator-name">
                    <div className="overline mb-2 flex flex-wrap gap-2">
                      <Link to={creatorStorePath(creator)}>{creator.name}</Link>
                      <span>/</span>
                      <span>Product</span>
                    </div>
                    <Link to={creatorStorePath(creator)} className="btn-secondary text-xs py-2 px-3">
                      <Store size={14} /> Back to {creator.name}
                    </Link>
                  </div>
                )}

                <h1 className="font-display text-3xl sm:text-5xl md:text-6xl uppercase leading-none mb-4 max-w-full" style={{ overflowWrap: "anywhere" }} data-testid="product-title">{product.title}</h1>
                <div className="text-2xl sm:text-3xl font-bold mb-6" data-testid="product-price">R {Number(unitPrice || 0).toFixed(2)}</div>
                <FormattedText text={product.description} className="text-[var(--ff-muted-text)] leading-relaxed mb-8" data-testid="product-description" />

                <div className="space-y-6">
                  <VariationSelector
                    product={product}
                    selected={selected}
                    onSelectedChange={setSelected}
                    selectedVariation={variation}
                  />

                  {variation && (
                    <div className="card text-sm" data-testid="selected-variation-summary">
                      <div className="overline mb-2">Selected option</div>
                      <div className="font-bold">{variationLabel}</div>
                      {variation.sku && <div className="text-xs text-[var(--ff-muted-text)] mt-1">SKU: {variation.sku}</div>}
                    </div>
                  )}

                  {isOutOfStock && (
                    <div className="border border-[var(--ff-primary)] bg-[var(--ff-card-bg)] p-4 text-[var(--ff-primary)] text-sm uppercase tracking-widest" data-testid="variation-oos">
                      This option is currently out of stock.
                    </div>
                  )}

                  <div>
                    <label className="label">Quantity</label>
                    <div className="inline-flex border border-[var(--ff-card-border)]" aria-label="Product quantity">
                      <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-4 py-2 hover:bg-[var(--ff-button-primary-bg)] hover:text-[var(--ff-button-primary-text)]" data-testid="product-qty-minus">−</button>
                      <span className="px-6 py-2 min-w-[40px] text-center" data-testid="product-qty">{quantity}</span>
                      <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(quantity + 1)} className="px-4 py-2 hover:bg-[var(--ff-button-primary-bg)] hover:text-[var(--ff-button-primary-text)]" data-testid="product-qty-plus">+</button>
                    </div>
                  </div>

                  {product.customization_enabled && (
                    <button type="button" onClick={() => setShowCustomizer(true)} className="btn-secondary" data-testid="product-customize-btn">
                      {customization ? <><RotateCcw size={16} /> Edit custom design</> : "Customise this product"}
                    </button>
                  )}

                  {customization && (
                    <div className="card text-xs flex items-center gap-3" data-testid="product-customization-summary">
                      {customization.preview_image && <img src={customization.preview_image} alt="Custom product preview" className="w-16 h-16 object-cover border border-[var(--ff-card-border)]" />}
                      <div>Custom design saved with {customization.text_entries?.length || 0} text and {customization.uploaded_files?.length || 0} image layer(s).</div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={addToCart}
                    disabled={!variation || isOutOfStock}
                    className="btn-primary w-full text-base justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="product-add-to-cart"
                  >
                    Add to cart — R {(Number(unitPrice || 0) * quantity).toFixed(2)}
                  </button>

                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <Link to="/shipping-policy" className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4 hover:border-[var(--ff-primary)]">
                      <ShieldCheck size={18} className="text-[var(--ff-primary)] mb-2" />
                      <strong className="block uppercase tracking-wide">Made to order</strong>
                      <span className="text-[var(--ff-muted-text)] text-xs">Review production and delivery information.</span>
                    </Link>
                    <Link to="/returns" className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4 hover:border-[var(--ff-primary)]">
                      <RotateCcw size={18} className="text-[var(--ff-primary)] mb-2" />
                      <strong className="block uppercase tracking-wide">Returns policy</strong>
                      <span className="text-[var(--ff-muted-text)] text-xs">Understand returns before ordering.</span>
                    </Link>
                  </div>

                  <div className="lg:hidden">
                    <SizeChartDisplay sizeChart={productTemplate?.size_chart} />
                  </div>

                  {(product.specs || product.specifications || product.features) && (
                    <div className="card mt-8" data-testid="product-specs-copy">
                      <div className="overline mb-3">Specifications and features</div>
                      <FormattedText text={product.specs || product.specifications || product.features} className="text-sm text-[var(--ff-muted-text)] leading-relaxed" />
                    </div>
                  )}

                  {Object.keys(product.spec_attributes || {}).length > 0 && (
                    <div className="card mt-8" data-testid="product-specs">
                      <div className="overline mb-3">Product specifications</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <tbody>
                            {Object.entries(product.spec_attributes || {}).map(([key, values]) => (
                              <tr key={key} className="border-b border-[var(--ff-card-border)] last:border-b-0">
                                <td className="py-2 text-[var(--ff-muted-text)] w-1/3">{key}</td>
                                <td className="py-2">{(values || []).join(", ")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function renderInlineText(text) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="text-[var(--ff-card-text)]">{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function FormattedText({ text, className = "", ...props }) {
  const lines = String(text || "").split(/\r?\n/);
  const nodes = [];
  let list = [];
  let ordered = false;

  const flushList = () => {
    if (!list.length) return;
    const Tag = ordered ? "ol" : "ul";
    nodes.push(
      <Tag key={`list-${nodes.length}`} className={`${ordered ? "list-decimal" : "list-disc"} pl-5 space-y-1`}>
        {list.map((item, index) => <li key={index}>{renderInlineText(item)}</li>)}
      </Tag>
    );
    list = [];
    ordered = false;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);

    if (numbered || bullet) {
      const nextOrdered = Boolean(numbered);
      if (list.length && ordered !== nextOrdered) flushList();
      ordered = nextOrdered;
      list.push(numbered ? numbered[1] : bullet[1]);
      return;
    }

    flushList();
    if (trimmed.startsWith("## ")) {
      nodes.push(<h3 key={index} className="font-display text-2xl uppercase text-[var(--ff-card-text)] mt-4">{renderInlineText(trimmed.slice(3))}</h3>);
    } else {
      nodes.push(<p key={index}>{renderInlineText(trimmed)}</p>);
    }
  });

  flushList();
  if (!nodes.length) return null;
  return <div className={`space-y-3 ${className}`} {...props}>{nodes}</div>;
}

function SizeChartDisplay({ sizeChart }) {
  const enabled = Boolean(sizeChart?.enabled);
  const columns = Array.isArray(sizeChart?.columns) ? sizeChart.columns.filter(Boolean) : [];
  const rows = Array.isArray(sizeChart?.rows) ? sizeChart.rows : [];

  if (!enabled || !columns.length || !rows.length) return null;

  return (
    <section className="mb-8 border border-[var(--ff-card-border)] overflow-hidden bg-[var(--ff-card-bg)]">
      <div className="p-4 border-b border-[var(--ff-card-border)]">
        <h2 className="font-display text-2xl uppercase text-[var(--ff-card-text)]">{sizeChart.title || "Size guide"}</h2>
        {sizeChart.unit && <p className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] mt-1">Measurements in {sizeChart.unit}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-black/5">
              {columns.map((column, index) => (
                <th key={index} className="text-left p-3 font-bold text-[var(--ff-card-text)] whitespace-nowrap">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-[var(--ff-card-border)]">
                {columns.map((_, columnIndex) => (
                  <td key={columnIndex} className="p-3 text-[var(--ff-muted-text)] whitespace-nowrap">{row?.[columnIndex] || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sizeChart.notes && <div className="p-4 border-t border-[var(--ff-card-border)] text-xs text-[var(--ff-muted-text)] whitespace-pre-wrap">{sizeChart.notes}</div>}
    </section>
  );
}
