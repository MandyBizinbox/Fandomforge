import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LogOut } from "lucide-react";
import NotificationBell from "./notifications/NotificationBell";

function formatBadgeCount(value) {
  const count = Number(value || 0);
  if (count > 99) return "99+";
  return String(count);
}

export default function DashboardLayout({
  title,
  links,
  testidPrefix = "dash",
  notificationEndpoint = "",
  notificationPath = "",
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen admin-workspace flex">
      <aside className="w-64 admin-sidebar border-r flex flex-col min-h-screen sticky top-0" data-testid={`${testidPrefix}-sidebar`}>
        <div className="p-6 border-b border-[var(--ff-card-border)]">
          <div className="font-display text-xl uppercase tracking-tight cursor-pointer" onClick={() => navigate("/")}>
            MERCH<span className="brand-text">FORGE</span>
          </div>
          <div className="overline mt-2">{title}</div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {links.map((l, index) => {
            if (l.type === "section") {
              return (
                <div key={`${l.label}-${index}`} className="px-6 pt-5 pb-2 text-[10px] uppercase tracking-[0.22em] text-[var(--ff-muted-text)] font-bold">
                  {l.label}
                </div>
              );
            }

            return (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({isActive}) => `sidebar-link ${isActive ? 'active' : ''} ${Number(l.badgeCount || 0) > 0 ? 'sidebar-link-attention' : ''}`}
                data-testid={`${testidPrefix}-nav-${l.key}`}
              >
                {l.icon}
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                {Number(l.badgeCount || 0) > 0 && (
                  <span className="sidebar-link-badge" aria-label={`${l.badgeCount} pending`}>
                    {formatBadgeCount(l.badgeCount)}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-[var(--ff-card-border)] p-4">
          <div className="text-xs text-[var(--ff-muted-text)] mb-2 uppercase tracking-wider">{user?.name}</div>
          <div className="text-[10px] text-[var(--ff-muted-text)] mb-3 break-all">{user?.email}</div>
          <button
            onClick={() => { logout(); navigate("/"); }}
            className="w-full flex items-center justify-center gap-2 border border-[var(--ff-card-border)] px-3 py-2 text-xs uppercase tracking-widest font-bold hover:bg-white hover:text-black transition-colors"
            data-testid={`${testidPrefix}-logout-btn`}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0" data-testid={`${testidPrefix}-main`}>
        <div className="admin-topbar sticky top-0 z-30 border-b backdrop-blur px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="overline">{title}</div>
            <div className="text-xs text-[var(--ff-muted-text)] truncate">{user?.name || user?.email}</div>
          </div>
          {notificationEndpoint && (
            <NotificationBell
              endpoint={notificationEndpoint}
              path={notificationPath}
              testidPrefix={testidPrefix}
            />
          )}
        </div>
        <div className="p-6 md:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
