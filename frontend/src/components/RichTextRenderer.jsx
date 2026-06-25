import React, { useMemo } from "react";

function sanitizeHtml(html = "") {
  if (!html) return "";
  if (typeof window === "undefined" || !window.DOMParser) {
    return String(html).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html), "text/html");
  doc.querySelectorAll("script, iframe, object, embed").forEach((node) => node.remove());
  doc.body.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || "").trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.innerHTML;
}

export default function RichTextRenderer({ html = "", className = "" }) {
  const safeHtml = useMemo(() => sanitizeHtml(html), [html]);
  if (!safeHtml) return null;
  return <div className={`rich-text-content ${className}`} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
