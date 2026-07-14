import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import RichTextRenderer from "../components/RichTextRenderer";
import { http } from "../lib/api";

const PATH_POLICY_MAP = {
  "/terms": "terms_and_conditions",
  "/privacy": "privacy_policy",
  "/returns": "returns_policy",
  "/shipping-policy": "shipping_policy",
  "/creator-terms": "creator_terms",
  "/printer-terms": "printer_terms",
  "/intellectual-property": "intellectual_property_policy",
  "/prohibited-content": "prohibited_content_policy",
  "/copyright-complaints": "copyright_complaint_procedure",
  "/payout-policy": "payout_policy",
  "/store-suspension": "store_suspension_termination_policy",
};

const POLICY_LINKS = [
  ["Creator Terms", "/creator-terms"],
  ["Customer Terms", "/terms"],
  ["Intellectual Property", "/intellectual-property"],
  ["Prohibited Content", "/prohibited-content"],
  ["Copyright Complaints", "/copyright-complaints"],
  ["Privacy", "/privacy"],
  ["Shipping", "/shipping-policy"],
  ["Returns", "/returns"],
  ["Payouts", "/payout-policy"],
  ["Store Suspension", "/store-suspension"],
];

export default function PolicyPage() {
  const { policyKey } = useParams();
  const location = useLocation();
  const mappedKey = policyKey || PATH_POLICY_MAP[location.pathname] || "terms_and_conditions";
  const [policy, setPolicy] = useState(null);

  useEffect(() => {
    setPolicy(null);
    http.get(`/public/policies/${mappedKey}`)
      .then((response) => setPolicy(response.data))
      .catch(() => setPolicy({ title: "Policy", content: "<p>This policy is not available yet.</p>" }));
  }, [mappedKey]);

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-16 max-w-5xl mx-auto px-6 md:px-10">
        <p className="overline mb-2">{policy?.platform_name || "Platform"}</p>
        <h1 className="font-display text-5xl uppercase mb-8">{policy?.title || "Policy"}</h1>
        <div className="card leading-7 text-[var(--ff-muted-text)]">
          {policy?.content ? <RichTextRenderer html={policy.content} /> : "Loading…"}
        </div>

        <div className="mt-8">
          <p className="overline mb-3">Platform policies</p>
          <nav className="flex flex-wrap gap-2">
            {POLICY_LINKS.map(([label, to]) => (
              <Link key={to} to={to} className={`btn-secondary text-xs py-2 px-3 ${location.pathname === to ? "border-[var(--ff-primary)]" : ""}`}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </main>
    </div>
  );
}
