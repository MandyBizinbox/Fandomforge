/**
 * Build a WhatsApp click-to-chat URL from a configured support number.
 * South African national numbers (e.g. 082...) are expanded to +27.
 * Other numbers should be stored in international format.
 */
export function makeMerchIdeasWhatsAppUrl(number, country = "ZA") {
  const raw = String(number || "").trim();
  if (!raw) return null;

  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0") && country === "ZA") digits = `27${digits.slice(1)}`;

  if (!/^[1-9]\d{8,14}$/.test(digits)) return null;

  const message = encodeURIComponent(
    "Hi! I have a merch idea and would love help getting started."
  );
  return `https://wa.me/${digits}?text=${message}`;
}
