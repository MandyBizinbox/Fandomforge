import React, { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import ProductBuilder from "../components/product-builder/ProductBuilder";
import { http, assetUrl } from "../lib/api";
import {
  BarChart3,
  Package,
  ShoppingBag,
  DollarSign,
  Settings as SettingsIcon,
  Plus,
  Upload,
  Trash2,
  Save,
  Eye,
  Clock3,
  Bell,
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import OrderDetail from "../components/OrderDetail";
import ManualOrderBuilder from "../components/orders/ManualOrderBuilder";
import ActivityTimeline from "../components/activity/ActivityTimeline";
import NotificationList from "../components/notifications/NotificationList";
import AttributeVariationEditor from "../components/AttributeVariationEditor";
import { toast } from "sonner";

const allBandLinks = [
  { type: "section", label: "Command" },
  { to: "/creator", end: true, label: "Overview", key: "overview", icon: <BarChart3 size={14} /> },

  { type: "section", label: "Storefront" },
  { to: "/creator/products", label: "Products", key: "products", icon: <Package size={14} /> },
  { to: "/creator/settings", label: "Settings", key: "settings", icon: <SettingsIcon size={14} /> },

  { type: "section", label: "Orders" },
  { to: "/creator/orders", label: "Orders", key: "orders", icon: <ShoppingBag size={14} /> },
  { to: "/creator/notifications", label: "Notifications", key: "notifications", icon: <Bell size={14} /> },
  { to: "/creator/activity", label: "Activity", key: "activity", icon: <Clock3 size={14} /> },

  { type: "section", label: "Money" },
  { to: "/creator/earnings", label: "Earnings", key: "earnings", icon: <DollarSign size={14} /> },
];

function filterBandLinksByModules(modules = {}) {
  const filtered = allBandLinks.filter((link) => {
    if (link.type === "section") return true;
    if (link.key === "earnings") return modules.payouts_enabled !== false;
    if (link.key === "orders") return modules.manual_orders_enabled !== false;
    return true;
  });

  return filtered.filter((link, index) => {
    if (link.type !== "section") return true;
    const next = filtered[index + 1];
    return next && next.type !== "section";
  });
}


const MAX_CREATOR_UPLOAD_MB = 25;
const MAX_CREATOR_UPLOAD_BYTES = MAX_CREATOR_UPLOAD_MB * 1024 * 1024;

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CreatorImageField({ label, value, onUpload, hint, requirements, inputId, previewClassName = "aspect-video" }) {
  const [selectedFile, setSelectedFile] = useState(null);

  const handleChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    if (file) onUpload(file);
    event.target.value = "";
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <label htmlFor={inputId} className="label">{label}</label>
          <p className="text-xs text-[var(--ff-muted-text)] mt-1">{hint}</p>
        </div>
      </div>

      <div className={`${previewClassName} border border-dashed border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] flex items-center justify-center overflow-hidden mb-4`}>
        {value ? (
          <img src={assetUrl(value)} alt={label} className="w-full h-full object-contain p-3" />
        ) : (
          <div className="text-center text-xs text-[var(--ff-muted-text)] uppercase tracking-widest px-4">No {label.toLowerCase()} uploaded yet</div>
        )}
      </div>

      <div className="space-y-3">
        <label className="btn-secondary cursor-pointer justify-center w-full">
          <Upload size={14} /> {value ? `Replace ${label}` : `Upload ${label}`}
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleChange}
          />
        </label>

        {selectedFile && (
          <div className="text-xs text-[var(--ff-muted-text)]">
            Selected: <span className="text-[var(--ff-card-text)]">{selectedFile.name}</span> · {formatFileSize(selectedFile.size)}
          </div>
        )}

        <div className="text-xs text-[var(--ff-muted-text)] leading-relaxed">
          {requirements}
          <br />
          Maximum upload size: {MAX_CREATOR_UPLOAD_MB}MB. Accepted: PNG, JPG, WebP or SVG.
        </div>
      </div>
    </div>
  );
}


function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function artworkStatusLabel(status) {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "pending_review") return "pending_review";
  return "not_required";
}

function creatorProductStatusText(product) {
  if (product.requires_creator_pricing_approval || product.creator_pricing_approval_status === "pending_creator_approval") {
    return "Pricing update needs approval";
  }
  if (product.artwork_review_status === "pending_review") return "Pending artwork review";
  if (product.artwork_review_status === "approved" && !product.published) return "Approved — ready to publish";
  if (product.published) return "Live";
  return "Draft";
}

function Overview() {
  const [stats, setStats] = useState(null);
  const [creator, setCreator] = useState(null);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    http.get("/creator-dash/stats").then((r) => setStats(r.data)).catch(() => {});
    http.get("/creators/me").then((r) => setCreator(r.data)).catch(() => {});
    http.get("/creators/me/subscription").then((r) => setSubscription(r.data)).catch(() => {});
  }, []);

  return (
    <div data-testid="creator-overview">
      <div className="overline mb-2">Creator Dashboard</div>
      <h1 className="font-display text-5xl uppercase mb-8">Overview</h1>

      {subscription && ["past_due", "suspended", "cancelled"].includes(subscription.status) && (
        <div className="card mb-6 border-[var(--ff-primary)] bg-[var(--ff-surface-bg)]">
          <div className="overline mb-2">Subscription Attention</div>
          <h2 className="font-display text-2xl uppercase">{subscription.status.replace(/_/g, " ")}</h2>
          <p className="text-sm text-[var(--ff-muted-text)] mt-2">
            Your account has subscription restrictions. Publishing and checkout access may be limited until admin updates the subscription status.
          </p>
        </div>
      )}

      {subscription && !["past_due", "suspended", "cancelled"].includes(subscription.status) && (
        <div className="card mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="overline mb-1">Subscription</div>
            <div className="font-display text-2xl uppercase">{subscription.plan_name || "Manual / Custom"}</div>
            <p className="text-xs text-[var(--ff-muted-text)] mt-1">Next billing: {subscription.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString() : "Manual"}</p>
          </div>
          <div className="flex gap-3"><StatusBadge status={subscription.status} /></div>
        </div>
      )}

      {creator && (
        <div className="card mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="overline mb-1">Storefront</div>
            <div className="font-display text-2xl uppercase">{creator.name}</div>
            <Link
              to={`/creators/${creator.slug}`}
              className="text-xs uppercase tracking-widest text-[var(--ff-primary)] hover:text-[var(--ff-primary)]"
            >
              View public store →
            </Link>
          </div>

          <div className="flex gap-3">
            <StatusBadge status={creator.status} />
            <StatusBadge status={creator.subscription_status} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-0 border border-[var(--ff-card-border)]">
        {[
          { k: "Products", v: stats?.product_count ?? 0 },
          { k: "Orders", v: stats?.order_count ?? 0 },
          { k: "Sales", v: money(stats?.total_sales) },
          { k: "Earnings", v: money(stats?.total_earnings) },
          { k: "Commission", v: money(stats?.total_commission) },
        ].map((s, i) => (
          <div key={s.k} className={`p-6 ${i < 4 ? "border-r border-[var(--ff-card-border)]" : ""}`}>
            <div className="overline mb-2">{s.k}</div>
            <div className="font-display text-3xl">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <Link to="/creator/products/new" className="card card-interactive">
          <Package className="text-[var(--ff-primary)] mb-4" />
          <h2 className="font-display text-3xl uppercase mb-2">Add Product</h2>
          <p className="text-[var(--ff-muted-text)] text-sm">Create merch, add pricing, upload mockups and attach artwork.</p>
        </Link>

        <Link to="/creator/settings" className="card card-interactive">
          <SettingsIcon className="text-[var(--ff-primary)] mb-4" />
          <h2 className="font-display text-3xl uppercase mb-2">Edit Storefront</h2>
          <p className="text-[var(--ff-muted-text)] text-sm">Update creator name, bio, logo, banner and socials.</p>
        </Link>
      </div>
    </div>
  );
}

function ProductsList() {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const load = () => {
    http.get("/products/mine").then((r) => setProducts(r.data || [])).catch(() => {
      toast.error("Could not load products");
    });
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = products.filter((p) => {
    const needle = q.toLowerCase();
    return (
      !needle ||
      p.title?.toLowerCase().includes(needle) ||
      p.category?.toLowerCase().includes(needle)
    );
  });

  const togglePublish = async (product) => {
    try {
      await http.patch(`/products/${product.id}`, { published: !product.published });
      toast.success(product.published ? "Product unpublished" : "Product published");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Publish update failed");
    }
  };

  const approvePricingUpdate = async (product) => {
    try {
      await http.post(`/products/${product.id}/approve-pricing`);
      toast.success("Pricing update approved");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Pricing approval failed");
    }
  };

  const remove = async (product) => {
    if (!window.confirm(`Delete "${product.title}"? This cannot be undone.`)) return;

    try {
      await http.delete(`/products/${product.id}`);
      toast.success("Product deleted");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div data-testid="creator-products-page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="overline mb-2">Catalog</div>
          <h1 className="font-display text-5xl uppercase">Products</h1>
        </div>

        <button
          type="button"
          onClick={() => navigate("/creator/products/new")}
          className="btn-primary"
        >
          <Plus size={14} /> New Product
        </button>
      </div>

      <div className="mb-6 max-w-md">
        <label htmlFor="product-search" className="label">Search products</label>
        <input
          id="product-search"
          name="product-search"
          className="input-base"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title or category..."
          autoComplete="off"
        />
      </div>

      <div className="border border-[var(--ff-card-border)] overflow-x-auto">
        <table className="table-brutal">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Print Cost</th>
              <th>Status</th>
              <th>Artwork</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((product) => (
              <tr key={product.id}>
                <td className="flex items-center gap-3">
                  {product.mockup_images?.[0] ? (
                    <img
                      src={assetUrl(product.mockup_images[0])}
                      alt={product.title}
                      className="w-12 h-12 object-cover border border-[var(--ff-card-border)]"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] flex items-center justify-center text-[var(--ff-muted-text)] text-xs">
                      MF
                    </div>
                  )}

                  <div>
                    <div className="font-bold">{product.title}</div>
                    <div className="text-xs text-[var(--ff-muted-text)]">{product.variations?.length || 0} variations</div>
                  </div>
                </td>

                <td>{product.category || "—"}</td>
                <td>{money(product.selling_price)}</td>
                <td>{money(product.print_cost)}</td>
                <td>
                  <StatusBadge status={product.published ? "active" : "inactive"} />
                  <div className="text-[11px] text-[var(--ff-muted-text)] mt-1">{creatorProductStatusText(product)}</div>
                </td>
                <td><StatusBadge status={artworkStatusLabel(product.artwork_review_status)} /></td>

                <td className="text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => navigate(`/creator/products/${product.id}`)}
                    className="text-xs uppercase tracking-widest text-[var(--ff-primary)] hover:text-[var(--ff-primary)] font-bold mr-3"
                  >
                    Edit
                  </button>

                  {(product.requires_creator_pricing_approval || product.creator_pricing_approval_status === "pending_creator_approval") ? (
                    <button
                      type="button"
                      onClick={() => approvePricingUpdate(product)}
                      className="text-xs uppercase tracking-widest text-[var(--ff-primary)] hover:text-[var(--ff-primary)] font-bold mr-3"
                    >
                      Approve pricing
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => togglePublish(product)}
                      disabled={!product.published && product.artwork_review_status && product.artwork_review_status !== "approved" && product.artwork_review_status !== "not_required"}
                      className="text-xs uppercase tracking-widest hover:text-[var(--ff-primary)] font-bold mr-3 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {product.published ? "Unpublish" : "Publish"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => remove(product)}
                    className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] font-bold"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-[var(--ff-muted-text)] overline">
                  No products found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductForm() {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const isNew = !routeId || routeId === "new";

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    template_id: "",
    selling_price: 35,
    print_cost: 12,
    mockup_images: [],
    customization_enabled: false,
    published: false,
  });

  const [variations, setVariations] = useState([]);
  const [attributeIds, setAttributeIds] = useState([]);
  const [specAttributes, setSpecAttributes] = useState({});
  const [categories, setCategories] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedProductTypeId, setSelectedProductTypeId] = useState("");
  const [product, setProduct] = useState(null);
  const [artwork, setArtwork] = useState(null);
  const [artworks, setArtworks] = useState([]);
  const [mockupFile, setMockupFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const selectedProductType = useMemo(
    () => productTypes.find((type) => type.id === selectedProductTypeId),
    [productTypes, selectedProductTypeId]
  );

  const filteredTemplates = useMemo(() => {
    if (!selectedProductType) return [];
    return templates.filter((template) => (
      template.product_type_id
        ? template.product_type_id === selectedProductType.id
        : template.category === selectedProductType.category
    ));
  }, [templates, selectedProductType]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.template_id),
    [templates, form.template_id]
  );

  const needsTemplateReview = Boolean(form.template_id);

  const profit = useMemo(() => {
    const sale = Number(form.selling_price || 0);
    const cost = Number(form.print_cost || 0);
    const commission = sale * 0.15;
    return {
      sale,
      cost,
      commission,
      creator: sale - cost - commission,
    };
  }, [form.selling_price, form.print_cost]);

  useEffect(() => {
    http.get("/categories").then((r) => setCategories(r.data || [])).catch(() => {});
    http.get("/attributes").then((r) => setAttributes(r.data || [])).catch(() => {});
    http.get("/public/product-types?status=active").then((r) => setProductTypes(r.data || [])).catch(() => {});
    http.get("/product-templates").then((r) => setTemplates(r.data || [])).catch(() => {});

    if (!isNew) {
      http.get(`/products/${routeId}`)
        .then((r) => {
          setProduct(r.data);
          setForm({
            title: r.data.title || "",
            description: r.data.description || "",
            category: r.data.category || "",
            template_id: r.data.template_id || "",
            selling_price: r.data.selling_price || 0,
            print_cost: r.data.print_cost || 0,
            mockup_images: r.data.mockup_images || [],
            customization_enabled: Boolean(r.data.customization_enabled),
            published: Boolean(r.data.published),
          });
          setVariations(r.data.variations || []);
          setAttributeIds(r.data.attribute_ids || []);
          setSpecAttributes(r.data.spec_attributes || {});
        })
        .catch(() => toast.error("Could not load product"));

      http.get(`/artworks/product/${routeId}`)
        .then((r) => setArtworks(r.data || []))
        .catch(() => {});
    }
  }, [routeId, isNew]);

  useEffect(() => {
    if (!form.template_id || selectedProductTypeId || templates.length === 0 || productTypes.length === 0) return;
    const template = templates.find((row) => row.id === form.template_id);
    if (!template) return;
    const type = productTypes.find((row) => row.id === template.product_type_id)
      || productTypes.find((row) => row.category === template.category);
    if (type) setSelectedProductTypeId(type.id);
  }, [form.template_id, productTypes, selectedProductTypeId, templates]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const chooseProductType = (typeId) => {
    const type = productTypes.find((row) => row.id === typeId);
    setSelectedProductTypeId(typeId);
    setForm((current) => ({
      ...current,
      category: type?.category || "",
      template_id: "",
      published: false,
    }));
  };

  const chooseTemplate = (templateId) => {
    const template = templates.find((row) => row.id === templateId);
    setForm((current) => ({
      ...current,
      template_id: templateId,
      category: template?.category || selectedProductType?.category || current.category,
      print_cost: Number(template?.creator_print_price || template?.base_price || current.print_cost || 0),
      mockup_images: template?.mockup_images?.length ? template.mockup_images : current.mockup_images,
      published: false,
    }));
    if (template?.attribute_ids?.length) setAttributeIds(template.attribute_ids);
  };

  const updateGroupDelivery = (key, value) => {
    setForm((current) => ({
      ...current,
      group_delivery: {
        ...(current.group_delivery || {}),
        [key]: value,
      },
    }));
  };

  const addMockupUrl = () => {
    setForm((current) => ({
      ...current,
      mockup_images: [...current.mockup_images, ""],
    }));
  };

  const updateMockupUrl = (index, value) => {
    setForm((current) => ({
      ...current,
      mockup_images: current.mockup_images.map((url, i) => (i === index ? value : url)),
    }));
  };

  const removeMockupUrl = (index) => {
    setForm((current) => ({
      ...current,
      mockup_images: current.mockup_images.filter((_, i) => i !== index),
    }));
  };

  const uploadMockup = async () => {
    if (!mockupFile) return;

    if (mockupFile.size > MAX_CREATOR_UPLOAD_BYTES) {
      toast.error(`File too large. Maximum upload size is ${MAX_CREATOR_UPLOAD_MB}MB.`);
      return;
    }

    const fd = new FormData();
    fd.append("file", mockupFile);
    fd.append("subdir", "product-mockups");

    try {
      const r = await http.post("/files/image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setForm((current) => ({
        ...current,
        mockup_images: [...current.mockup_images, r.data.url],
      }));

      setMockupFile(null);
      toast.success("Mockup uploaded");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Mockup upload failed");
    }
  };

  const uploadArtworkForProduct = async (productId) => {
    if (!artwork || !productId) return false;

    const fd = new FormData();
    fd.append("product_id", productId);
    fd.append("placement", "front");
    fd.append("notes", "Creator uploaded artwork");
    fd.append("dpi", 300);
    fd.append("file", artwork);

    await http.post("/artworks/upload", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return true;
  };

  const save = async (e) => {
    e.preventDefault();

    if (isNew && !selectedProductTypeId) {
      toast.error("Choose a product type first");
      return;
    }

    if (isNew && !form.template_id) {
      toast.error("Choose a template before creating the product");
      return;
    }

    setSaving(true);

    const payload = {
      title: form.title.trim(),
      description: form.description || "",
      category: form.category || selectedProductType?.category || selectedTemplate?.category || "",
      template_id: form.template_id || null,
      selling_price: Number(form.selling_price || 0),
      print_cost: Number(form.print_cost || 0),
      mockup_images: form.mockup_images.map((url) => url.trim()).filter(Boolean),
      customization_enabled: Boolean(form.customization_enabled),
      published: needsTemplateReview ? false : Boolean(form.published),
      variations,
      attribute_ids: attributeIds,
      spec_attributes: specAttributes,
    };

    try {
      if (isNew) {
        const r = await http.post("/products", payload);
        if (artwork) {
          await uploadArtworkForProduct(r.data.id);
          toast.success("Product created — artwork awaiting approval");
        } else {
          toast.success("Product created — artwork review pending");
        }
        navigate(`/creator/products/${r.data.id}`, { replace: true });
      } else {
        const r = await http.patch(`/products/${routeId}`, payload);
        if (artwork) {
          await uploadArtworkForProduct(routeId);
          const artworkResponse = await http.get(`/artworks/product/${routeId}`);
          setArtworks(artworkResponse.data || []);
          setArtwork(null);
          const productResponse = await http.get(`/products/${routeId}`);
          setProduct(productResponse.data);
        } else {
          setProduct(r.data);
        }
        toast.success(artwork ? "Product saved — artwork awaiting approval" : "Product saved");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const uploadArtwork = async (e) => {
    e.preventDefault();

    const productId = product?.id || routeId;
    if (!artwork || !productId || isNew) return;

    try {
      await uploadArtworkForProduct(productId);
      toast.success("Artwork uploaded — awaiting approval");
      const r = await http.get(`/artworks/product/${productId}`);
      setArtworks(r.data || []);
      setArtwork(null);
      const productResponse = await http.get(`/products/${productId}`);
      setProduct(productResponse.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Artwork upload failed");
    }
  };

  return (
    <div data-testid="creator-product-form">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="overline mb-2">{isNew ? "Create" : "Edit"}</div>
          <h1 className="font-display text-5xl uppercase">
            {isNew ? "New Product" : form.title || "Edit Product"}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => navigate("/creator/products")}
          className="btn-secondary"
        >
          Back
        </button>
      </div>

      <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {isNew && (
            <div className="card">
              <div className="overline mb-3">1. Product type</div>
              <div className="grid sm:grid-cols-2 gap-3">
                {productTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => chooseProductType(type.id)}
                    className={`border p-4 text-left hover:bg-[var(--ff-surface-bg)] ${selectedProductTypeId === type.id ? "border-[var(--ff-primary)] bg-[var(--ff-surface-bg)]" : "border-[var(--ff-card-border)]"}`}
                  >
                    <div className="font-bold uppercase text-sm">{type.name}</div>
                    <div className="text-xs text-[var(--ff-muted-text)] mt-1">{type.category}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isNew && (
            <div className="card">
              <div className="overline mb-3">2. Template</div>
              {!selectedProductType ? (
                <div className="text-sm text-[var(--ff-muted-text)]">Choose a product type to see matching templates.</div>
              ) : filteredTemplates.length > 0 ? (
                <div className="space-y-3">
                  {filteredTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => chooseTemplate(template.id)}
                      className={`w-full border p-4 text-left hover:bg-[var(--ff-surface-bg)] ${form.template_id === template.id ? "border-[var(--ff-primary)] bg-[var(--ff-surface-bg)]" : "border-[var(--ff-card-border)]"}`}
                    >
                      <div className="font-bold uppercase text-sm">{template.name}</div>
                      <div className="text-xs text-[var(--ff-muted-text)] mt-1">{template.category}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--ff-muted-text)]">No active templates are available for this product type.</div>
              )}
            </div>
          )}

          <div className="card">
            <div className="overline mb-3">{isNew ? "3. Product details" : "Product details"}</div>
            <div className="space-y-4">
              <div>
                <label htmlFor="product-title" className="label">Product title</label>
                <input
                  id="product-title"
                  name="title"
                  className="input-base"
                  required
                  value={form.title}
                  onChange={(e) => updateForm("title", e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="product-description" className="label">Description</label>
                <textarea
                  id="product-description"
                  name="description"
                  className="input-base"
                  rows={5}
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                />
              </div>

              {!form.template_id && (
                <div>
                  <label htmlFor="product-category" className="label">Category</label>
                  <select
                    id="product-category"
                    name="category"
                    className="input-base"
                    value={form.category}
                    onChange={(e) => updateForm("category", e.target.value)}
                    required
                  >
                    <option value="">Pick a category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedTemplate && (
                <div className="text-xs text-[var(--ff-muted-text)] border border-[var(--ff-card-border)] p-3">
                  Template: <span className="font-bold text-[var(--ff-card-text)]">{selectedTemplate.name}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="selling-price" className="label">Selling price</label>
                  <input
                    id="selling-price"
                    name="selling_price"
                    className="input-base"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.selling_price}
                    onChange={(e) => updateForm("selling_price", e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="print-cost" className="label">Print cost</label>
                  <input
                    id="print-cost"
                    name="print_cost"
                    className="input-base"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.print_cost}
                    onChange={(e) => updateForm("print_cost", e.target.value)}
                  />
                </div>
              </div>

                <label className="dropzone block cursor-pointer">
                  <div className="overline mb-2">Print artwork</div>
                  <div className="text-xs text-[var(--ff-muted-text)]">
                    Upload production artwork. Maximum upload size: {MAX_CREATOR_UPLOAD_MB}MB.
                  </div>
                  <div className="text-xs text-[var(--ff-muted-text)] mt-1">
                    Accepted: PNG, JPG, SVG or PDF. Recommended: transparent PNG/SVG/PDF where possible.
                  </div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,application/pdf"
                    className="hidden"
                    onChange={(e) => setArtwork(e.target.files?.[0] || null)}
                  />
                  {artwork && (
                    <div className="mt-3 text-sm text-[var(--ff-card-text)]">
                      {artwork.name}
                      <span className="block text-xs text-[var(--ff-muted-text)]">{formatFileSize(artwork.size)}</span>
                    </div>
                  )}
                </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.customization_enabled}
                  onChange={(e) => updateForm("customization_enabled", e.target.checked)}
                />
                Allow buyer customization
              </label>

              {!needsTemplateReview && (
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => updateForm("published", e.target.checked)}
                  />
                  Publish product
                </label>
              )}
            </div>
          </div>

            <div className="card">
              <div className="mb-4">
                <div className="overline mb-1">Mockups</div>
                <p className="text-xs text-[var(--ff-muted-text)]">
                  Upload product mockup images. Raw file URLs are stored internally and are not shown to creators.
                </p>
                <p className="text-xs text-[var(--ff-muted-text)] mt-1">
                  Recommended: clear product image, 1200×1200px or larger. Maximum upload size: {MAX_CREATOR_UPLOAD_MB}MB. Accepted: PNG, JPG or WebP.
                </p>
              </div>

              <div className="space-y-3">
                {form.mockup_images.map((url, index) => (
                  <div key={index} className="flex items-center gap-3 border border-[var(--ff-card-border)] p-3">
                    <div className="w-20 h-20 bg-[var(--ff-surface-bg)] border border-[var(--ff-card-border)] flex items-center justify-center overflow-hidden shrink-0">
                      <img src={assetUrl(url)} alt={`Mockup ${index + 1}`} className="w-full h-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-[var(--ff-card-text)]">Mockup {index + 1}</div>
                      <div className="text-xs text-[var(--ff-muted-text)]">Image uploaded</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMockupUrl(index)}
                      className="btn-secondary px-3"
                      title="Remove mockup"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                {form.mockup_images.length === 0 && (
                  <div className="text-xs text-[var(--ff-muted-text)] border border-dashed border-[var(--ff-card-border)] p-4">
                    No mockups uploaded yet.
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="input-base"
                  onChange={(e) => setMockupFile(e.target.files?.[0] || null)}
                />

                {mockupFile && (
                  <div className="text-xs text-[var(--ff-muted-text)]">
                    Selected: <span className="text-[var(--ff-card-text)]">{mockupFile.name}</span> · {formatFileSize(mockupFile.size)}
                  </div>
                )}

                <button
                  type="button"
                  onClick={uploadMockup}
                  className="btn-secondary w-full sm:w-auto"
                  disabled={!mockupFile}
                >
                  <Upload size={14} /> Upload Mockup
                </button>
              </div>
            </div>

          <AttributeVariationEditor
            allAttributes={attributes}
            attributeIds={attributeIds}
            onAttributeIdsChange={setAttributeIds}
            variations={variations}
            onVariationsChange={setVariations}
            specAttributes={specAttributes}
            onSpecChange={setSpecAttributes}
          />

          <button type="submit" className="btn-primary w-full" disabled={saving}>
            <Save size={14} /> {saving ? "Saving..." : isNew ? "Create Product" : "Save Product"}
          </button>
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="overline mb-3">Product preview</div>

            <div className="aspect-square bg-[var(--ff-surface-bg)] border border-[var(--ff-card-border)] mb-4 overflow-hidden">
              {form.mockup_images[0] ? (
                <img
                  src={assetUrl(form.mockup_images[0])}
                  alt={form.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--ff-muted-text)] font-display text-5xl">
                  MF
                </div>
              )}
            </div>

            <h3 className="font-display text-2xl uppercase">{form.title || "Product title"}</h3>
            <p className="text-[var(--ff-muted-text)] text-sm mt-2 line-clamp-3">
              {form.description || "Product description will appear here."}
            </p>

            {needsTemplateReview && (
              <div className="mt-4 text-xs text-[var(--ff-muted-text)] border border-[var(--ff-card-border)] p-3">
                Creator template products stay unpublished until artwork is approved.
              </div>
            )}

            {!isNew && product && (
              <Link
                to={`/product/${product.id}`}
                className="btn-secondary w-full mt-4"
              >
                <Eye size={14} /> View Product
              </Link>
            )}
          </div>

          <div className="card">
            <div className="overline mb-3">Profit estimate</div>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="text-[var(--ff-muted-text)]">Sale price</td>
                  <td className="text-right">{money(profit.sale)}</td>
                </tr>
                <tr>
                  <td className="text-[var(--ff-muted-text)]">Printer cost</td>
                  <td className="text-right">{money(profit.cost)}</td>
                </tr>
                <tr>
                  <td className="text-[var(--ff-muted-text)]">Commission 15%</td>
                  <td className="text-right">{money(profit.commission)}</td>
                </tr>
                <tr className="border-t border-[var(--ff-card-border)]">
                  <td className="font-bold pt-2">Creator earns</td>
                  <td className="text-right font-bold text-[#34C759] pt-2">
                    {money(profit.creator)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {!isNew && (
            <div className="card">
              <div className="overline mb-3">Artwork files</div>

              <div className="space-y-2 mb-4">
                {artworks.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-sm border-b border-[var(--ff-card-border)] pb-2"
                  >
                    <a
                      href={assetUrl(item.file_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:text-[var(--ff-primary)]"
                    >
                      {item.file_name}
                    </a>
                    <StatusBadge status={item.status} />
                  </div>
                ))}

                {artworks.length === 0 && (
                  <div className="text-xs text-[var(--ff-muted-text)]">No artwork uploaded yet.</div>
                )}
              </div>

              {artwork && (
                <button
                  type="button"
                  onClick={uploadArtwork}
                  className="btn-primary w-full mt-3"
                >
                  <Upload size={14} /> Upload Artwork
                </button>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

function OrdersList() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    http.get("/orders/creator").then((r) => setOrders(r.data || [])).catch(() => {});
  }, []);

  return (
    <div data-testid="creator-orders-page">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <div className="overline mb-2">Orders</div>
          <h1 className="font-display text-5xl uppercase">Creator Orders</h1>
        </div>

        <Link to="/creator/orders/new" className="btn-primary">
          <Plus size={14} /> New Manual Order
        </Link>
      </div>

      <div className="border border-[var(--ff-card-border)] overflow-x-auto">
        <table className="table-brutal">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Artwork</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.order_number}</td>
                <td>{new Date(order.created_at).toLocaleDateString()}</td>
                <td>{order.items.length}</td>
                <td>{money(order.total)}</td>
                <td><StatusBadge status={order.status} /></td>
                <td className="text-right">
                  <Link to={`/creator/orders/${order.id}`} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold">View</Link>
                </td>
              </tr>
            ))}

            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-[var(--ff-muted-text)] overline">
                  No orders yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Earnings() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    http.get("/creator-dash/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  if (!stats) return <div className="overline">Loading…</div>;

  return (
    <div data-testid="creator-earnings-page">
      <div className="overline mb-2">Money</div>
      <h1 className="font-display text-5xl uppercase mb-8">Earnings</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-[var(--ff-card-border)]">
        <div className="p-6 border-r border-[var(--ff-card-border)]">
          <div className="overline mb-2">Gross sales</div>
          <div className="font-display text-4xl">{money(stats.total_sales)}</div>
        </div>

        <div className="p-6 border-r border-[var(--ff-card-border)]">
          <div className="overline mb-2">Commission paid</div>
          <div className="font-display text-4xl text-[var(--ff-primary)]">
            {money(stats.total_commission)}
          </div>
        </div>

        <div className="p-6">
          <div className="overline mb-2">Net earnings</div>
          <div className="font-display text-4xl text-[#34C759]">
            {money(stats.total_earnings)}
          </div>
        </div>
      </div>

      <div className="overline mt-10">Subscription</div>
      <div className="card mt-3 flex items-center justify-between">
        <div>
          <div className="text-sm text-[var(--ff-muted-text)]">Plan</div>
          <div className="font-display text-xl">Monthly creator store subscription</div>
        </div>
        <StatusBadge status={stats.subscription_status || "inactive"} />
      </div>
    </div>
  );
}

function SettingsPage() {
  const [creator, setCreator] = useState(null);
  const [form, setForm] = useState({
    name: "",
    bio: "",
    logo_url: "",
    banner_url: "",
    instagram: "",
    twitter: "",
    group_delivery: {
      enabled: false,
      delivery_interval_days: 14,
      first_batch_date: "",
      collection_point_name: "",
      collection_address_line_1: "",
      collection_suburb: "",
      collection_town: "",
      collection_province: "",
      collection_postal_code: "",
      customer_instructions: "",
      internal_notes: "",
    },
  });

  useEffect(() => {
    http.get("/creators/me").then((r) => {
      setCreator(r.data);
      setForm({
        name: r.data.name || "",
        bio: r.data.bio || "",
        logo_url: r.data.logo_url || "",
        banner_url: r.data.banner_url || "",
        instagram: r.data.socials?.instagram || "",
        twitter: r.data.socials?.twitter || "",
        group_delivery: {
          enabled: Boolean(r.data.group_delivery?.enabled),
          delivery_interval_days: Number(r.data.group_delivery?.delivery_interval_days || 14),
          first_batch_date: r.data.group_delivery?.first_batch_date || "",
          collection_point_name: r.data.group_delivery?.collection_point_name || "",
          collection_address_line_1: r.data.group_delivery?.collection_address_line_1 || "",
          collection_suburb: r.data.group_delivery?.collection_suburb || "",
          collection_town: r.data.group_delivery?.collection_town || "",
          collection_province: r.data.group_delivery?.collection_province || "",
          collection_postal_code: r.data.group_delivery?.collection_postal_code || "",
          customer_instructions: r.data.group_delivery?.customer_instructions || "",
          internal_notes: r.data.group_delivery?.internal_notes || "",
        },
      });
    }).catch(() => {});
  }, []);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateGroupDelivery = (key, value) => {
    setForm((current) => ({
      ...current,
      group_delivery: {
        ...(current.group_delivery || {}),
        [key]: value,
      },
    }));
  };

  const uploadStoreImage = async (file, targetField) => {
    if (!file) return;

    const fd = new FormData();
    fd.append("file", file);
    fd.append("subdir", "creator-storefronts");

    try {
      const r = await http.post("/files/image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      updateForm(targetField, r.data.url);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Image upload failed");
    }
  };

  const save = async (e) => {
    e.preventDefault();

    const socials = {};
    if (form.instagram) socials.instagram = form.instagram;
    if (form.twitter) socials.twitter = form.twitter;

    const intervalDays = Number(form.group_delivery?.delivery_interval_days || 14);
    if (form.group_delivery?.enabled && intervalDays < 14) {
      toast.error("Group Delivery interval must be at least 14 days");
      return;
    }

    const groupDelivery = {
      enabled: Boolean(form.group_delivery?.enabled),
      delivery_interval_days: Math.max(14, intervalDays || 14),
      first_batch_date: form.group_delivery?.first_batch_date || "",
      collection_point_name: form.group_delivery?.collection_point_name || "",
      collection_address_line_1: form.group_delivery?.collection_address_line_1 || "",
      collection_suburb: form.group_delivery?.collection_suburb || "",
      collection_town: form.group_delivery?.collection_town || "",
      collection_province: form.group_delivery?.collection_province || "",
      collection_postal_code: form.group_delivery?.collection_postal_code || "",
      customer_instructions: form.group_delivery?.customer_instructions || "",
      internal_notes: form.group_delivery?.internal_notes || "",
    };

    try {
      const r = await http.patch("/creators/me", {
        name: form.name,
        bio: form.bio,
        logo_url: form.logo_url || null,
        banner_url: form.banner_url || null,
        socials,
        group_delivery: groupDelivery,
      });

      setCreator(r.data);
      toast.success("Storefront saved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    }
  };

  const subscribe = async () => {
    try {
      await http.post("/payments/subscribe");
      toast.success("Subscription activated");
      const r = await http.get("/creators/me");
      setCreator(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Subscription failed");
    }
  };

  if (!creator) return <div className="overline">Loading…</div>;

  return (
    <div data-testid="creator-settings-page">
      <div className="overline mb-2">Settings</div>
      <h1 className="font-display text-5xl uppercase mb-8">Storefront</h1>

      <form onSubmit={save} className="max-w-2xl space-y-4">
        <div>
          <label htmlFor="creator-name" className="label">Creator name</label>
          <input
            id="creator-name"
            name="name"
            className="input-base"
            value={form.name}
            onChange={(e) => updateForm("name", e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="creator-bio" className="label">Bio</label>
          <textarea
            id="creator-bio"
            name="bio"
            className="input-base"
            rows={4}
            value={form.bio}
            onChange={(e) => updateForm("bio", e.target.value)}
          />
        </div>

        <div className="card space-y-4 border border-[var(--ff-card-border)]">
          <div>
            <p className="overline mb-2">Group Delivery</p>
            <h2 className="font-display text-3xl uppercase">Free batched collection</h2>
            <p className="text-sm text-[var(--ff-muted-text)] mt-1">
              Customers do not pay delivery. Orders are batched to your collection point and assigned to the next valid batch date.
            </p>
          </div>

          <label className="flex items-start gap-3 border border-[var(--ff-card-border)] p-3 bg-[var(--ff-surface-bg)] cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={Boolean(form.group_delivery?.enabled)}
              onChange={(e) => updateGroupDelivery("enabled", e.target.checked)}
            />
            <span>
              <span className="block text-sm font-bold">Enable Free Group Delivery</span>
              <span className="block text-xs text-[var(--ff-muted-text)] mt-1">Only shown when the cart contains products from this creator/store.</span>
            </span>
          </label>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Delivery interval days</label>
              <input
                className="input-base"
                type="number"
                min="14"
                value={form.group_delivery?.delivery_interval_days || 14}
                onChange={(e) => updateGroupDelivery("delivery_interval_days", Number(e.target.value || 14))}
              />
              <p className="text-xs text-[var(--ff-muted-text)] mt-1">Minimum 14 days.</p>
            </div>

            <div>
              <label className="label">First batch date</label>
              <input
                className="input-base"
                type="date"
                value={form.group_delivery?.first_batch_date || ""}
                onChange={(e) => updateGroupDelivery("first_batch_date", e.target.value)}
              />
            </div>

            <div>
              <label className="label">Collection point name</label>
              <input
                className="input-base"
                value={form.group_delivery?.collection_point_name || ""}
                onChange={(e) => updateGroupDelivery("collection_point_name", e.target.value)}
                placeholder="Group Hall"
              />
            </div>

            <div>
              <label className="label">Address line 1</label>
              <input
                className="input-base"
                value={form.group_delivery?.collection_address_line_1 || ""}
                onChange={(e) => updateGroupDelivery("collection_address_line_1", e.target.value)}
                placeholder="1 Main Road"
              />
            </div>

            <div>
              <label className="label">Suburb</label>
              <input
                className="input-base"
                value={form.group_delivery?.collection_suburb || ""}
                onChange={(e) => updateGroupDelivery("collection_suburb", e.target.value)}
                placeholder="Durbanville"
              />
            </div>

            <div>
              <label className="label">Town</label>
              <input
                className="input-base"
                value={form.group_delivery?.collection_town || ""}
                onChange={(e) => updateGroupDelivery("collection_town", e.target.value)}
                placeholder="Cape Town"
              />
            </div>

            <div>
              <label className="label">Province</label>
              <input
                className="input-base"
                value={form.group_delivery?.collection_province || ""}
                onChange={(e) => updateGroupDelivery("collection_province", e.target.value)}
                placeholder="Western Cape"
              />
            </div>

            <div>
              <label className="label">Postal code</label>
              <input
                className="input-base"
                value={form.group_delivery?.collection_postal_code || ""}
                onChange={(e) => updateGroupDelivery("collection_postal_code", e.target.value)}
                placeholder="7550"
              />
            </div>
          </div>

          <div>
            <label className="label">Customer instructions</label>
            <textarea
              className="input-base"
              rows={3}
              value={form.group_delivery?.customer_instructions || ""}
              onChange={(e) => updateGroupDelivery("customer_instructions", e.target.value)}
              placeholder="Orders are delivered in batches to the group hall. You will be notified when your order is ready for collection."
            />
          </div>

          <div>
            <label className="label">Internal notes</label>
            <textarea
              className="input-base"
              rows={3}
              value={form.group_delivery?.internal_notes || ""}
              onChange={(e) => updateGroupDelivery("internal_notes", e.target.value)}
              placeholder="Internal only. Not shown to buyers."
            />
          </div>
        </div>

          <CreatorImageField
            label="Logo"
            value={form.logo_url}
            inputId="creator-logo"
            hint="Shown on your public storefront and creator cards."
            requirements="Recommended: square or transparent logo, at least 800×800px."
            previewClassName="aspect-square"
            onUpload={(file) => uploadStoreImage(file, "logo_url")}
          />

          <CreatorImageField
            label="Banner"
            value={form.banner_url}
            inputId="creator-banner"
            hint="Shown as the wide header image on your public storefront."
            requirements="Recommended: wide banner, around 1600×600px or larger."
            previewClassName="aspect-[16/6]"
            onUpload={(file) => uploadStoreImage(file, "banner_url")}
          />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="creator-instagram" className="label">Instagram</label>
            <input
              id="creator-instagram"
              name="instagram"
              className="input-base"
              value={form.instagram}
              onChange={(e) => updateForm("instagram", e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="creator-twitter" className="label">Twitter / X</label>
            <input
              id="creator-twitter"
              name="twitter"
              className="input-base"
              value={form.twitter}
              onChange={(e) => updateForm("twitter", e.target.value)}
            />
          </div>
        </div>

        <button type="submit" className="btn-primary">
          <Save size={14} /> Save Storefront
        </button>
      </form>

      <div className="mt-10 card max-w-2xl">
        <div className="overline mb-2">Subscription</div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-[var(--ff-muted-text)]">Current status</div>
            <StatusBadge status={creator.subscription_status} />
          </div>

          <button type="button" onClick={subscribe} className="btn-secondary">
            Activate / Renew
          </button>
        </div>
      </div>
    </div>
  );
}

function BandNotifications() {
  return <NotificationList endpoint="/creator-dash/notifications" title="Notifications" subtitle="Artwork reviews, production updates and order notes for your creator account" />;
}

function BandActivity() {
  return (
    <div data-testid="creator-activity-page">
      <div className="overline mb-2">Creator</div>
      <h1 className="font-display text-5xl uppercase mb-8">Activity</h1>
      <ActivityTimeline endpoint="/creator-dash/activity" title="Recent Creator Activity" canAddNote={false} />
    </div>
  );
}

export default function BandDashboard() {
  const [platformConfig, setPlatformConfig] = useState({ modules: {} });

  useEffect(() => {
    http.get("/orders/platform-config").then((r) => setPlatformConfig(r.data || { modules: {} })).catch(() => {});
  }, []);

  const visibleLinks = filterBandLinksByModules(platformConfig.modules || {});

  return (
    <Routes>
      <Route element={<DashboardLayout title="Creator Console" links={visibleLinks} testidPrefix="creator-dash" notificationEndpoint="/creator-dash/notifications" notificationPath="/creator/notifications" />}>
        <Route index element={<Overview />} />
        <Route path="products" element={<ProductsList />} />
        <Route path="products/new" element={<ProductBuilder mode="creator" backTo="/creator/products" />} />
        <Route path="products/:id" element={<ProductBuilder mode="creator" backTo="/creator/products" />} />
        <Route path="orders" element={<OrdersList />} />
        <Route path="notifications" element={<BandNotifications />} />
        <Route path="activity" element={<BandActivity />} />
        <Route path="orders/new" element={<ManualOrderBuilder mode="creator" backTo="/creator/orders" />} />
        <Route
          path="orders/:id"
          element={<OrderDetail mode="view" backTo="/creator/orders" testidPrefix="creator-order" />}
        />
        <Route path="earnings" element={<Earnings />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
