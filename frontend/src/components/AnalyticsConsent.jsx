import React, { useState } from "react";
import { getAnalyticsConsent, hasAnalyticsChoice, setAnalyticsConsent, resetPageDeduplication, trackPage } from "../lib/analytics";
export default function AnalyticsConsent() {
  const [choice, setChoice] = useState(hasAnalyticsChoice);
  if (choice) return null;
  const decide = (granted) => {
    setAnalyticsConsent(granted);
    setChoice(true);
    if (granted) { resetPageDeduplication(); trackPage(window.location.pathname); }
  };
  return <div role="dialog" aria-label="Analytics cookies" className="fixed bottom-3 left-3 right-3 z-[9999] max-w-xl rounded-lg border border-gray-500 bg-neutral-950 p-4 text-white shadow-xl">
    <p className="mb-3 text-sm">FandomForge uses optional Google Analytics cookies to understand site usage. You can decline and continue using the site.</p>
    <div className="flex gap-3"><button type="button" onClick={() => decide(false)} className="rounded border border-gray-400 px-4 py-2 text-sm">Decline</button><button type="button" onClick={() => decide(true)} className="rounded bg-white px-4 py-2 text-sm text-black">Accept analytics</button></div>
  </div>;
}
