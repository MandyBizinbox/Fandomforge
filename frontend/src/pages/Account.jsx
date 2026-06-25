import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

export default function Account() {
  const { user } = useAuth();

  const dashboardPath =
    user?.role === "super_admin"
      ? "/admin"
      : user?.role === "creator"
      ? "/creator"
      : user?.role === "printer"
      ? "/printer"
      : null;

  return (
    <div className="min-h-screen page-shell">
      <Navbar />

      <main className="pt-24 pb-16 max-w-5xl mx-auto px-6 md:px-10">
        <p className="overline mb-2">Account</p>

        <h1 className="font-display text-4xl md:text-5xl uppercase mb-6">
          My Account
        </h1>

        <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 mb-6">
          <p className="text-[var(--ff-muted-text)] text-sm mb-2">Signed in as</p>
          <p className="text-lg font-bold">{user?.email || "Unknown user"}</p>
          <p className="text-[var(--ff-muted-text)] text-sm mt-2">
            Role: {user?.role || "buyer"}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Link to="/shop" className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 hover:border-[var(--ff-primary)]">
            <p className="font-display text-2xl uppercase mb-2">Shop Merch</p>
            <p className="text-[var(--ff-muted-text)] text-sm">Browse products and support creators.</p>
          </Link>

          <Link to="/cart" className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 hover:border-[var(--ff-primary)]">
            <p className="font-display text-2xl uppercase mb-2">Cart</p>
            <p className="text-[var(--ff-muted-text)] text-sm">Review your current cart.</p>
          </Link>

          {dashboardPath && (
            <Link to={dashboardPath} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 hover:border-[var(--ff-primary)]">
              <p className="font-display text-2xl uppercase mb-2">Dashboard</p>
              <p className="text-[var(--ff-muted-text)] text-sm">Open your role-specific dashboard.</p>
            </Link>
          )}

          {user?.role === "buyer" && (
            <Link to="/creator/profile-setup" className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 hover:border-[var(--ff-primary)]">
              <p className="font-display text-2xl uppercase mb-2">Create Creator Store</p>
              <p className="text-[var(--ff-muted-text)] text-sm">Set up your creator storefront.</p>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}