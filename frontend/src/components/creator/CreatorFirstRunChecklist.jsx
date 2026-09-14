import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  Circle,
  Eye,
  Package,
  Rocket,
  Store,
} from "lucide-react";
import { http } from "../../lib/api";
import {
  creatorStorefrontPreviewStorageKey,
  deriveCreatorFirstRunChecklist,
} from "../../lib/creatorFirstRunChecklist";

const stepContent = {
  storefront: {
    title: "Brand your storefront",
    description: "Add a logo or banner so your store looks like yours before customers arrive.",
    action: "Edit storefront",
    to: "/creator/settings",
    icon: Store,
  },
  product: {
    title: "Create your first product",
    description: "Browse the merch catalogue, choose a launch-ready product and start designing.",
    action: "Browse catalogue",
    to: "/creator?section=catalogue",
    icon: Package,
  },
  payouts: {
    title: "Set up payout details",
    description: "Add and verify the bank account that will receive your creator earnings.",
    action: "Open payout settings",
    to: "/creator/settings",
    icon: Building2,
  },
  preview: {
    title: "Preview your storefront",
    description: "See what customers will see before you publish your first product.",
    action: "Preview store",
    to: "",
    icon: Eye,
  },
  publish: {
    title: "Publish your first product",
    description: "Once artwork and pricing are approved, switch your product live on the storefront.",
    action: "Review products",
    to: "/creator/products",
    icon: Rocket,
  },
};

export default function CreatorFirstRunChecklist() {
  const [creator, setCreator] = useState(null);
  const [products, setProducts] = useState([]);
  const [payoutState, setPayoutState] = useState(null);
  const [storefrontPreviewed, setStorefrontPreviewed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [creatorResult, productsResult, payoutResult] = await Promise.allSettled([
        http.get("/creators/me"),
        http.get("/products/mine"),
        http.get("/creator-payouts/profile"),
      ]);

      if (!active) return;

      const nextCreator = creatorResult.status === "fulfilled" ? creatorResult.value.data : null;
      setCreator(nextCreator);
      setProducts(productsResult.status === "fulfilled" ? (productsResult.value.data || []) : []);
      setPayoutState(payoutResult.status === "fulfilled" ? (payoutResult.value.data || null) : null);

      if (nextCreator && typeof window !== "undefined") {
        const key = creatorStorefrontPreviewStorageKey(nextCreator);
        setStorefrontPreviewed(window.localStorage.getItem(key) === "1");
      }

      setReady(true);
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const checklist = useMemo(
    () => deriveCreatorFirstRunChecklist({
      creator,
      products,
      payoutState,
      storefrontPreviewed,
    }),
    [creator, products, payoutState, storefrontPreviewed],
  );

  if (!ready || !creator || checklist.isComplete) return null;

  const markStorefrontPreviewed = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(creatorStorefrontPreviewStorageKey(creator), "1");
    }
    setStorefrontPreviewed(true);
  };

  const progressPercent = Math.round((checklist.completedCount / checklist.totalCount) * 100);

  return (
    <section className="card mb-8" data-testid="creator-first-run-checklist">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
        <div>
          <div className="overline mb-2">Launch checklist</div>
          <h2 className="font-display text-3xl uppercase">Get your store ready</h2>
          <p className="text-sm text-[var(--ff-muted-text)] mt-2 max-w-2xl">
            You do not need to finish everything at once. These are the five things that take your store from new account to ready for customers.
          </p>
        </div>
        <div className="text-sm font-bold whitespace-nowrap">
          {checklist.completedCount}/{checklist.totalCount} complete
        </div>
      </div>

      <div className="h-2 border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] mb-6 overflow-hidden">
        <div
          className="h-full bg-[var(--ff-primary)] transition-all"
          style={{ width: `${progressPercent}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="grid gap-3">
        {checklist.steps.map((step, index) => {
          const content = stepContent[step.key];
          const Icon = content.icon;
          const previewPath = creator.slug ? `/creators/${creator.slug}` : "";
          const actionPath = step.key === "preview" ? previewPath : content.to;
          const description = step.unavailable
            ? "Creator payouts are not enabled yet, so this will not block your launch."
            : content.description;

          return (
            <div
              key={step.key}
              className={`border border-[var(--ff-card-border)] p-4 flex flex-col md:flex-row md:items-center gap-4 ${step.complete ? "opacity-70" : ""}`}
              data-testid={`creator-checklist-${step.key}`}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="shrink-0 mt-0.5">
                  {step.complete ? (
                    <CheckCircle2 size={20} className="text-[var(--ff-primary)]" />
                  ) : (
                    <Circle size={20} className="text-[var(--ff-muted-text)]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--ff-muted-text)]">Step {index + 1}</span>
                    <Icon size={14} className="text-[var(--ff-primary)]" />
                  </div>
                  <h3 className="font-display text-xl uppercase mt-1">{content.title}</h3>
                  <p className="text-xs text-[var(--ff-muted-text)] mt-1 leading-relaxed">{description}</p>
                </div>
              </div>

              {!step.complete && actionPath && (
                <Link
                  to={actionPath}
                  className="btn-secondary shrink-0 justify-center"
                  target={step.key === "preview" ? "_blank" : undefined}
                  rel={step.key === "preview" ? "noreferrer" : undefined}
                  onClick={step.key === "preview" ? markStorefrontPreviewed : undefined}
                >
                  {content.action}
                </Link>
              )}

              {step.complete && (
                <span className="text-xs uppercase tracking-widest font-bold shrink-0">Done</span>
              )}
            </div>
          );
        })}
      </div>

      {!checklist.steps.find((step) => step.key === "payouts")?.complete && (
        <p className="text-xs text-[var(--ff-muted-text)] mt-4">
          Payout details live under Settings → Payout Details. You can finish that before your first payout; it does not stop you creating products.
        </p>
      )}
    </section>
  );
}
