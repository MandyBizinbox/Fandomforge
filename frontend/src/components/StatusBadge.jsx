import React from "react";

const STATUS_STYLES = {
  pending_payment: "badge-warning",
  paid: "badge-success",
  awaiting_artwork_review: "badge-warning",
  sent_to_printer: "badge-info",
  in_production: "badge-info",
  ready_for_dispatch: "badge-info",
  shipped: "badge-info",
  completed: "badge-success",
  cancelled: "badge-muted",
  refunded: "badge-muted",
  pending: "badge-warning",
  accepted: "badge-info",
  ready: "badge-info",
  delivered: "badge-success",
  active: "badge-success",
  suspended: "badge-error",
  approved: "badge-success",
  rejected: "badge-error",
  due: "badge-warning",
  inactive: "badge-muted",
  past_due: "badge-error",
};

export default function StatusBadge({ status, testId }) {
  const cls = STATUS_STYLES[status] || "badge-muted";
  return (
    <span className={`badge ${cls}`} data-testid={testId || `status-${status}`}>
      {String(status).replace(/_/g, " ")}
    </span>
  );
}
