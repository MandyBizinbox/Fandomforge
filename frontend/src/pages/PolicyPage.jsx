import React, { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import RichTextRenderer from "../components/RichTextRenderer";
import { http } from "../lib/api";

export default function PolicyPage() {
  const { policyKey } = useParams();
  const location = useLocation();
  const mappedKey = policyKey || ({ "/terms": "terms_and_conditions", "/privacy": "privacy_policy", "/returns": "returns_policy", "/shipping-policy": "shipping_policy", "/creator-terms": "creator_terms", "/printer-terms": "printer_terms" }[location.pathname] || "terms_and_conditions");
  const [policy, setPolicy] = useState(null);

  useEffect(() => {
    http.get(`/public/policies/${mappedKey}`).then((res) => setPolicy(res.data)).catch(() => setPolicy({ title: "Policy", content: "<p>This policy is not available yet.</p>" }));
  }, [mappedKey]);

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-16 max-w-4xl mx-auto px-6 md:px-10">
        <p className="overline mb-2">{policy?.platform_name || "Platform"}</p>
        <h1 className="font-display text-5xl uppercase mb-8">{policy?.title || "Policy"}</h1>
        <div className="card leading-7 text-[var(--ff-muted-text)]">
          {policy?.content ? <RichTextRenderer html={policy.content} /> : "Loading…"}
        </div>
      </main>
    </div>
  );
}
