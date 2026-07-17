import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import Navbar from "../components/Navbar";
import { POLICY_LINKS } from "../content/policies";

export default function LegalIndex() {
  return (
    <div className="min-h-screen page-shell">
      <Navbar />

      <main className="pt-28 pb-16 max-w-6xl mx-auto px-4 sm:px-6 md:px-10">
        <header className="mb-10 max-w-3xl">
          <p className="overline mb-2">Legal and platform policies</p>
          <h1 className="font-display text-5xl sm:text-6xl uppercase leading-none">
            Clear rules for customers, creators and communities
          </h1>
          <p className="text-[var(--ff-muted-text)] mt-4 text-lg">
            Find the current rules for accounts, orders, payments, content, production, delivery, returns, creator payouts and store enforcement.
          </p>
        </header>

        <section className="grid gap-5 md:grid-cols-2">
          {POLICY_LINKS.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              className="card group flex gap-4 items-start hover:border-[var(--ff-primary)] transition-colors"
            >
              <div className="w-12 h-12 border border-[var(--ff-card-border)] bg-[var(--ff-primary)]/10 flex items-center justify-center shrink-0">
                <FileText className="text-[var(--ff-primary)]" size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-3xl uppercase leading-none mb-2">
                  {item.title}
                </h2>
                <p className="text-sm text-[var(--ff-muted-text)]">
                  {item.description}
                </p>
                <span className="inline-flex items-center gap-2 mt-4 text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)]">
                  Read policy <ArrowRight size={14} />
                </span>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-8 border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 flex gap-4 items-start">
          <ShieldCheck className="text-[var(--ff-primary)] shrink-0 mt-1" />
          <div>
            <h2 className="font-display text-2xl uppercase mb-2">Need help applying a policy?</h2>
            <p className="text-sm text-[var(--ff-muted-text)]">
              Contact FandomForge before placing an order, publishing a product or submitting content when you are unsure how a policy applies.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/contact" className="btn-secondary">Contact Support</Link>
              <a href="mailto:help@fandomforge.co.za" className="btn-secondary">help@fandomforge.co.za</a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
