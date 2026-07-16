import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import Navbar from "../components/Navbar";
import RichTextRenderer from "../components/RichTextRenderer";
import { http } from "../lib/api";
import { getLocalPolicy, normalizePolicyKey } from "../content/policies";

const PATH_POLICY_KEYS = {
  "/terms": "terms_and_conditions",
  "/shop-terms": "terms_and_conditions",
  "/privacy": "privacy_policy",
  "/privacy-policy": "privacy_policy",
  "/returns": "returns_policy",
  "/shipping-policy": "shipping_policy",
  "/delivery-terms": "shipping_policy",
  "/creator-terms": "creator_terms",
  "/printer-terms": "printer_terms",
  "/intellectual-property": "intellectual_property",
  "/prohibited-content": "prohibited_content",
  "/copyright-complaints": "copyright_complaints",
  "/payout-policy": "payout_policy",
  "/store-suspension-policy": "store_suspension",
};

const PLACEHOLDER_PHRASES = [
  "not available yet",
  "will be published here",
  "coming soon",
  "placeholder",
  "to be confirmed",
  "to be published",
];

function isUsablePolicy(value) {
  const content = String(value?.content || "").trim();
  if (!content) return false;

  const normalised = content
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (normalised.length < 120) return false;
  return !PLACEHOLDER_PHRASES.some((phrase) => normalised.includes(phrase));
}

export default function PolicyPage({ policyKeyOverride = "" }) {
  const { policyKey } = useParams();
  const location = useLocation();

  const mappedKey = useMemo(
    () => normalizePolicyKey(policyKeyOverride || policyKey || PATH_POLICY_KEYS[location.pathname] || "terms_and_conditions"),
    [location.pathname, policyKey, policyKeyOverride]
  );

  const localPolicy = useMemo(() => getLocalPolicy(mappedKey), [mappedKey]);
  const [policy, setPolicy] = useState(localPolicy);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPolicy(localPolicy);
    setUsingFallback(false);

    http
      .get(`/public/policies/${mappedKey}`)
      .then((response) => {
        if (!active) return;

        if (isUsablePolicy(response.data)) {
          setPolicy({
            platform_name: response.data.platform_name || "FandomForge",
            ...response.data,
          });
          setUsingFallback(false);
          return;
        }

        setPolicy(localPolicy);
        setUsingFallback(Boolean(localPolicy));
      })
      .catch(() => {
        if (!active) return;
        setPolicy(localPolicy);
        setUsingFallback(Boolean(localPolicy));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [localPolicy, mappedKey]);

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-16 max-w-4xl mx-auto px-4 sm:px-6 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p className="overline">{policy?.platform_name || "FandomForge"}</p>
          <Link to="/legal" className="text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)] hover:underline">
            All policies
          </Link>
        </div>

        <h1 className="font-display text-5xl sm:text-6xl uppercase mb-8 leading-none">
          {policy?.title || "Platform Policy"}
        </h1>

        {loading && !policy ? (
          <div className="card text-[var(--ff-muted-text)]">Loading policy…</div>
        ) : policy?.content ? (
          <>
            {usingFallback && (
              <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4 mb-5 text-sm text-[var(--ff-muted-text)]">
                This is the current FandomForge public policy for this topic.
              </div>
            )}
            <div className="card leading-7 text-[var(--ff-muted-text)] policy-content">
              <RichTextRenderer html={policy.content} />
            </div>
          </>
        ) : (
          <div className="card">
            <AlertTriangle className="text-[var(--ff-primary)] mb-4" />
            <h2 className="font-display text-3xl uppercase mb-3">Policy unavailable</h2>
            <p className="text-[var(--ff-muted-text)] mb-5">
              We could not load this policy. Please contact FandomForge before continuing with the related transaction or account action.
            </p>
            <Link to="/contact" className="btn-primary">Contact Support</Link>
          </div>
        )}
      </main>
    </div>
  );
}
