const LAST_CREATOR_STORE_KEY = "fandomforge:lastCreatorStore";

export function creatorStorePath(store) {
  return store?.slug ? `/creators/${store.slug}` : "/";
}

export function normalizeCreatorStore(store = {}) {
  const slug = String(store.slug || "").trim();
  const name = String(store.name || store.display_name || "").trim();

  if (!slug) return null;
  return { slug, name: name || "Creator Store" };
}

export function saveLastCreatorStore(store) {
  if (typeof window === "undefined") return;

  const normalized = normalizeCreatorStore(store);
  if (!normalized) return;

  try {
    window.localStorage.setItem(LAST_CREATOR_STORE_KEY, JSON.stringify(normalized));
  } catch {
    // Convenience navigation only; ignore storage failures.
  }
}

export function getLastCreatorStore() {
  if (typeof window === "undefined") return null;

  try {
    return normalizeCreatorStore(JSON.parse(window.localStorage.getItem(LAST_CREATOR_STORE_KEY) || "null") || {});
  } catch {
    return null;
  }
}

export function getCreatorStoreFromItems(items = []) {
  const item = items.find((row) => row?.creator_slug || row?.creator_name);
  return normalizeCreatorStore({
    slug: item?.creator_slug,
    name: item?.creator_name,
  });
}
