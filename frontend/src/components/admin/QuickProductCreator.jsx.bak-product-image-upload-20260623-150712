import React, { useEffect, useState } from "react";
import { http, assetUrl } from "../../lib/api";
import { toast } from "sonner";

const DEFAULT_SIZES = "Kids 5-6,Kids 7-8,Kids 9-10,XS,S,M,L,XL,2XL,3XL";

export default function QuickProductCreator() {
  const [creators, setCreators] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [createdProduct, setCreatedProduct] = useState(null);
  const [form, setForm] = useState({
    creator_id: "",
    name: "",
    price: "",
    description: "",
    image_url: "",
    sizes: DEFAULT_SIZES,
    colour: "Black",
    category: "T-Shirts",
    published: true,
  });

  useEffect(() => {
    http.get("/admin/quick-product-creators")
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setCreators(rows);
        if (rows[0]) {
          setForm((current) => ({ ...current, creator_id: current.creator_id || rows[0].id }));
        }
      })
      .catch((err) => {
        toast.error(err.response?.data?.detail || "Could not load creators");
      });
  }, []);

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const uploadProductImage = async (file) => {
    if (!file) return;

    setUploadingImage(true);
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("subdir", "product-mockups");

      const response = await http.post("/files/image", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const url = response.data?.url;
      if (!url) throw new Error("Upload did not return a URL");

      set("image_url", url);
      toast.success("Product image uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not upload product image");
    } finally {
      setUploadingImage(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.creator_id) {
      toast.error("Choose a creator/store");
      return;
    }

    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }

    if (!Number(form.price || 0)) {
      toast.error("Price is required");
      return;
    }

    if (!form.image_url.trim()) {
      toast.error("Image URL is required");
      return;
    }

    setSaving(true);
    setCreatedProduct(null);

    try {
      const payload = {
        ...form,
        price: Number(form.price || 0),
      };

      const res = await http.post("/admin/quick-products", payload);
      setCreatedProduct(res.data);
      toast.success("Quick product created");

      setForm((current) => ({
        ...current,
        name: "",
        price: "",
        description: "",
      }));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not create quick product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-6">
      <div>
        <p className="overline mb-2">Super Admin</p>
        <h2 className="font-display text-3xl uppercase">Quick Product Creator</h2>
        <p className="text-sm text-[var(--ff-muted-text)] mt-2">
          Create a simple published product without Product Template Studio. Production will be manual/no-template.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Creator / Store</label>
          <select
            className="input-base"
            value={form.creator_id}
            onChange={(event) => set("creator_id", event.target.value)}
            required
          >
            {creators.map((creator) => (
              <option key={creator.id} value={creator.id}>
                {creator.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Product name</label>
          <input
            className="input-base"
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="Meadowridge Scout Group T-Shirt"
            required
          />
        </div>

        <div>
          <label className="label">Price</label>
          <input
            className="input-base"
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(event) => set("price", event.target.value)}
            placeholder="180"
            required
          />
        </div>

        <div>
          <label className="label">Product image</label>

          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4 items-start">
            <div className="border border-white/10 bg-black/30 min-h-[180px] flex items-center justify-center overflow-hidden">
              {form.image_url ? (
                <img
                  src={assetUrl(form.image_url)}
                  alt=""
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs text-[var(--ff-muted-text)] text-center px-4">
                  No image uploaded
                </span>
              )}
            </div>

            <div className="space-y-3">
              <label className="btn-secondary cursor-pointer justify-center">
                {uploadingImage ? "Uploading image…" : "Upload product image"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={(event) => uploadProductImage(event.target.files?.[0])}
                />
              </label>

              <div>
                <label className="label">Image URL</label>
                <input
                  className="input-base"
                  value={form.image_url}
                  onChange={(event) => set("image_url", event.target.value)}
                  placeholder="/api/uploads/images/product-mockups/..."
                  required
                />
                <p className="text-xs text-[var(--ff-muted-text)] mt-1">
                  Upload an image, or paste an existing uploaded image path.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="input-base min-h-[110px]"
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
            placeholder="Comfortable group T-shirt available in standard sizes."
          />
        </div>

        <div>
          <label className="label">Sizes</label>
          <textarea
            className="input-base min-h-[80px]"
            value={form.sizes}
            onChange={(event) => set("sizes", event.target.value)}
            required
          />
          <p className="text-xs text-[var(--ff-muted-text)] mt-1">
            Comma separated, for example: XS,S,M,L,XL,2XL,3XL
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Colour</label>
            <input
              className="input-base"
              value={form.colour}
              onChange={(event) => set("colour", event.target.value)}
              placeholder="Black"
            />
          </div>

          <div>
            <label className="label">Category</label>
            <input
              className="input-base"
              value={form.category}
              onChange={(event) => set("category", event.target.value)}
              placeholder="T-Shirts"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(event) => set("published", event.target.checked)}
          />
          Publish immediately
        </label>

        <button
          type="submit"
          className="btn-primary justify-center disabled:opacity-50"
          disabled={saving}
        >
          {saving ? "Creating..." : "Create quick product"}
        </button>
      </form>

      {createdProduct && (
        <div className="border border-green-500/30 bg-green-500/10 p-4 text-sm">
          <div className="font-bold mb-2">Created:</div>
          <div>{createdProduct.title}</div>
          <div className="text-[var(--ff-muted-text)] mt-1">ID: {createdProduct.id}</div>
          <a
            className="text-[var(--ff-primary)] underline mt-2 inline-block"
            href={`/product/${createdProduct.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Open product
          </a>
        </div>
      )}
    </div>
  );
}
