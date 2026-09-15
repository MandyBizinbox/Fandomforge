import { useEffect } from "react";
import { toast } from "sonner";

export default function EntitlementNotice() {
  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {};
      const title = detail.reason_code === "platform_module_disabled"
        ? "Feature unavailable"
        : "Plan upgrade required";
      const description = [
        detail.message,
        detail.current_plan ? `Current plan: ${detail.current_plan}.` : "",
        detail.limit != null ? `Usage: ${detail.current_usage || 0} of ${detail.limit}.` : "",
        detail.required_plan ? `Available on: ${detail.required_plan}.` : "",
      ].filter(Boolean).join(" ");
      toast.error(title, {
        description,
        action: detail.upgrade_available
          ? { label: "View plans", onClick: () => { window.location.href = "/account/plans"; } }
          : undefined,
        duration: 9000,
      });
    };
    window.addEventListener("fandomforge:entitlement-denied", handler);
    return () => window.removeEventListener("fandomforge:entitlement-denied", handler);
  }, []);
  return null;
}
