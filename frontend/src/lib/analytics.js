// FandomForge GA4. Never send user identifiers, payment details or query strings.
export const GA4_ID = process.env.REACT_APP_GA4_MEASUREMENT_ID || "G-CTPEVD0ZXZ";
const KEY = "ff_analytics_consent_v1";
let loaded = false;
let lastPage = "";
const sentPurchases = new Set();
export const getAnalyticsConsent = () => { try { return localStorage.getItem(KEY) === "granted"; } catch { return false; } };
export function setAnalyticsConsent(granted) {
  try { localStorage.setItem(KEY, granted ? "granted" : "denied"); } catch { /* storage blocked */ }
  if (granted) initializeAnalytics();
}
export function hasAnalyticsChoice() { try { return localStorage.getItem(KEY) !== null; } catch { return false; } }
export function initializeAnalytics() {
  if (!getAnalyticsConsent() || loaded || !GA4_ID || typeof window === "undefined") return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  // SPA page views are sent explicitly by the router, never automatically.
  window.gtag("config", GA4_ID, { send_page_view: false, anonymize_ip: true });
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA4_ID);
  document.head.appendChild(script);
}
export function trackEvent(name, params = {}) {
  if (!getAnalyticsConsent()) return;
  initializeAnalytics();
  if (typeof window.gtag === "function") window.gtag("event", name, params);
}
export function trackPage(path) {
  if (!getAnalyticsConsent()) return;
  initializeAnalytics();
  // Ignore hash/query: callback tokens and customer data must never reach GA4.
  const clean = String(path || "/").split(/[?#]/)[0];
  if (lastPage === clean) return;
  lastPage = clean;
  trackEvent("page_view", { page_location: window.location.origin + clean, page_path: clean, page_title: document.title });
}
export function resetPageDeduplication() { lastPage = ""; }
export function trackPurchase(order) {
  if (!order || order.payment_status !== "paid") return;
  const id = String(order.id || order.order_id || order.order_number || "");
  const value = Number(order.total_amount ?? order.total ?? order.total_price);
  if (!id || !Number.isFinite(value) || value < 0 || !getAnalyticsConsent()) return;
  const key = "ff_ga4_purchase_" + id;
  if (sentPurchases.has(id)) return;
  try { if (localStorage.getItem(key)) return; } catch { /* session only */ }
  trackEvent("purchase", { transaction_id: id, currency: "ZAR", value });
  sentPurchases.add(id);
  try { localStorage.setItem(key, "1"); } catch { /* storage blocked */ }
}
