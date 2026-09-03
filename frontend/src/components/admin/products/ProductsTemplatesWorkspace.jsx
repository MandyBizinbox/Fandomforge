import React from "react";
import { useNavigate } from "react-router-dom";
import AdminWorkspaceTabs from "../workspaces/AdminWorkspaceTabs";
import ProductTypesPage from "../../template-studio/ProductTypesPage";
import ProductTemplatesPage from "../../template-studio/ProductTemplatesPage";
import CategoriesAdmin from "../../../pages/admin/CategoriesAdmin";
import AttributesAdmin from "../../../pages/admin/AttributesAdmin";
import AdminProductsList from "./AdminProductsList";

export default function ProductsTemplatesWorkspace({ modules = {}, user = null, mode = "admin" } = {}) {
  const navigate = useNavigate();
  return (
    <div data-testid="admin-product-templates-workspace" className="space-y-6">
      <div>
        <p className="overline mb-2">Product System</p>
        <h1 className="font-display text-5xl uppercase">Products & Templates</h1>
        <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Product types, templates, sellable products, categories and attributes live here. Print methods, colours and costing rules are managed in Manufacturing Rules.</p>
        <button type="button" onClick={() => navigate("/admin/manufacturing-rules")} className="ff-admin-button ff-admin-button--secondary mt-4">Open Manufacturing Rules</button>
      </div>
      <AdminWorkspaceTabs
        modules={modules}
        user={user}
        mode={mode}
        tabs={[
          { key: "product-types", label: "Product Types", permission: "manage_product_templates", moduleKey: "product_templates_enabled", element: <ProductTypesPage /> },
          { key: "templates", label: "Templates", permission: "manage_product_templates", moduleKey: "product_templates_enabled", element: <ProductTemplatesPage /> },
          { key: "products", label: "Sellable Products", permission: "manage_products", element: <AdminProductsList /> },
          { key: "categories", label: "Categories", permission: "manage_product_templates", moduleKey: "product_templates_enabled", element: <CategoriesAdmin /> },
          { key: "attributes", label: "Attributes", permission: "manage_product_templates", moduleKey: "product_templates_enabled", element: <AttributesAdmin /> },
        ]}
      />
    </div>
  );
}
