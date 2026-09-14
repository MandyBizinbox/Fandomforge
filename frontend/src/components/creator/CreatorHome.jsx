import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ExternalLink,
  Grid2X2,
  Package,
  Settings,
  ShoppingBag,
  Store,
} from "lucide-react";
import { assetUrl, http } from "../../lib/api";
import StatusBadge from "../StatusBadge";
import "./creatorHome.css";

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

function productImage(product = {}) {
  return product.primary_mockup_image_url
    || product.mockup_image_url
    || asArray(product.mockup_images)[0]
    || product.product_image_url
    || product.image_url
    || "";
}

function productStatus(product = {}) {
  if (product.published) return "Live";
  if (product.artwork_review_status === "approved") return "Ready to publish";
  if (product.artwork_review_status === "pending_review") return "Artwork review";
  if (product.artwork_review_status === "rejected") return "Needs changes";
  return "Draft";
}

function DashboardAction({ to, icon: Icon, title, copy, primary = false }) {
  return (
    <Link to={to} className={`creator-home-action ${primary ? "primary" : ""}`}>
      <span className="creator-home-action-icon"><Icon size={19} /></span>
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
    </Link>
  );
}

export default function CreatorHome() {
  const [stats, setStats] = useState(null);
  const [creator, setCreator] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const [statsResult, creatorResult, subscriptionResult, productsResult] = await Promise.allSettled([
        http.get("/creator-dash/stats"),
        http.get("/creators/me"),
        http.get("/creators/me/subscription"),
        http.get("/products/mine"),
      ]);
      if (!active) return;
      setStats(statsResult.status === "fulfilled" ? statsResult.value.data : null);
      setCreator(creatorResult.status === "fulfilled" ? creatorResult.value.data : null);
      setSubscription(subscriptionResult.status === "fulfilled" ? subscriptionResult.value.data : null);
      setProducts(productsResult.status === "fulfilled" ? asArray(productsResult.value.data) : []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const recentProducts = useMemo(() => products.slice(0, 4), [products]);
  const attentionSubscription = subscription && ["past_due", "suspended", "cancelled"].includes(subscription.status);

  return (
    <div className="creator-home" data-testid="creator-home">
      <header className="creator-home-hero">
        <div>
          <div className="creator-home-eyebrow">Creator Dashboard</div>
          <h1>{creator?.name ? `Welcome to ${creator.name}` : "Your creator workspace"}</h1>
          <p>Build products, manage your storefront and keep an eye on what is selling.</p>
        </div>
        {creator?.slug && (
          <Link to={`/creators/${creator.slug}`} target="_blank" rel="noreferrer" className="btn-secondary creator-home-store-link">
            <Store size={15} /> View storefront <ExternalLink size={13} />
          </Link>
        )}
      </header>

      {attentionSubscription && (
        <div className="creator-home-alert">
          <AlertTriangle size={20} />
          <div>
            <strong>Subscription needs attention</strong>
            <p>Your account is {String(subscription.status || "").replace(/_/g, " ")}. Publishing or checkout may be restricted until the subscription is updated.</p>
          </div>
          <Link to="/creator/settings" className="btn-secondary">Open settings</Link>
        </div>
      )}

      <section className="creator-home-stats" aria-label="Store performance">
        {[
          { label: "Products", value: loading ? "—" : stats?.product_count ?? products.length },
          { label: "Orders", value: loading ? "—" : stats?.order_count ?? 0 },
          { label: "Sales", value: loading ? "—" : money(stats?.total_sales) },
          { label: "Earnings", value: loading ? "—" : money(stats?.total_earnings) },
        ].map((item) => (
          <div key={item.label} className="creator-home-stat">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section className="creator-home-section">
        <div className="creator-home-section-heading">
          <div>
            <div className="creator-home-eyebrow">Create and manage</div>
            <h2>What do you want to do?</h2>
          </div>
        </div>
        <div className="creator-home-actions">
          <DashboardAction
            to="/creator?section=catalogue"
            icon={Grid2X2}
            title="Browse Catalogue"
            copy="Choose a product template and start designing."
            primary
          />
          <DashboardAction
            to="/creator/products"
            icon={Package}
            title="My Products"
            copy="Review drafts, approvals and live products."
          />
          <DashboardAction
            to="/creator/orders"
            icon={ShoppingBag}
            title="Orders"
            copy="See customer orders and fulfilment progress."
          />
          <DashboardAction
            to="/creator/settings"
            icon={Settings}
            title="Store Settings"
            copy="Update branding, visibility and payout details."
          />
        </div>
      </section>

      <section className="creator-home-section">
        <div className="creator-home-section-heading">
          <div>
            <div className="creator-home-eyebrow">Products</div>
            <h2>Recent products</h2>
          </div>
          {products.length > 0 && <Link to="/creator/products" className="creator-home-text-link">View all products →</Link>}
        </div>

        {recentProducts.length === 0 && !loading ? (
          <div className="creator-home-empty">
            <Package size={28} />
            <div>
              <strong>Your product shelf is empty</strong>
              <p>Start in the Catalogue so you can choose the merch before opening the builder.</p>
            </div>
            <Link to="/creator?section=catalogue" className="btn-primary">Browse Catalogue</Link>
          </div>
        ) : (
          <div className="creator-home-products">
            {recentProducts.map((product) => {
              const image = productImage(product);
              return (
                <Link key={product.id} to={`/creator/products/${product.id}`} className="creator-home-product">
                  <div className="creator-home-product-image-wrap">
                    {image ? (
                      <img src={assetUrl(image)} alt="" className="creator-home-product-image" />
                    ) : (
                      <div className="creator-home-product-image-placeholder"><Package size={22} /></div>
                    )}
                  </div>
                  <div className="creator-home-product-copy">
                    <strong>{product.title || product.name || "Untitled product"}</strong>
                    <span>{productStatus(product)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {subscription && !attentionSubscription && (
        <footer className="creator-home-footer-status">
          <div>
            <span>Subscription</span>
            <strong>{subscription.plan_name || "Manual / Custom"}</strong>
          </div>
          <StatusBadge status={subscription.status} />
        </footer>
      )}
    </div>
  );
}
