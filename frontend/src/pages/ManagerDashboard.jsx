import React from "react";
import { useLocation } from "react-router-dom";
import AdminDashboard from "./AdminDashboard";

function managerDashboardKey(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");
  return /^\/manager\/products\/(?:new|[^/]+)$/.test(path)
    ? path
    : "manager-dashboard";
}

export default function ManagerDashboard() {
  const location = useLocation();
  return (
    <AdminDashboard
      key={managerDashboardKey(location.pathname)}
      mode="manager"
      basePath="/manager"
      title="Manager Console"
    />
  );
}
