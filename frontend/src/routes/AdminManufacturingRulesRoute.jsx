import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "../components/admin/adminManufacturingRulesThemeRuntime";
import AdminManufacturingRulesUnified from "../pages/admin/AdminManufacturingRulesUnified";

export default function AdminManufacturingRulesRoute() {
  return (
    <Routes>
      <Route index element={<Navigate to="methods" replace />} />
      <Route path="methods" element={<AdminManufacturingRulesUnified activeSection="methods" />} />
      <Route path="colours" element={<AdminManufacturingRulesUnified activeSection="colours" />} />
      <Route path="settings" element={<AdminManufacturingRulesUnified activeSection="settings" />} />
      <Route path="*" element={<Navigate to="methods" replace />} />
    </Routes>
  );
}
