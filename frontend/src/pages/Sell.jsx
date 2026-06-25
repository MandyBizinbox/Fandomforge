import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { Upload, Store, PackageCheck, Banknote, ArrowRight } from "lucide-react";

export default function Sell() {
  return (
    <div className="min-h-screen page-shell">
      <Navbar />

      <section className="pt-32 pb-20 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="overline mb-4">For creators and events</p>
            <h1 className="font-display text-6xl md:text-8xl uppercase leading-[0.9] mb-6">
              Sell Merch Without Inventory
            </h1>
            <p className="text-[var(--ff-muted-text)] text-lg max-w-xl mb-8">
              Create your merch store, upload products, attach artwork and let FandomForge route orders to printers.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/register/creator" className="btn-primary">
                Create Your Store <ArrowRight size={18} />
              </Link>
              <Link to="/creators" className="btn-secondary">
                Browse Stores
              </Link>
            </div>
          </div>

          <div className="border border-[var(--ff-card-border)] bg-white/[0.03] p-8">
            <p className="overline mb-4">Creator workflow</p>
            <div className="space-y-5">
              <Step icon={<Store />} title="Launch your storefront" text="Create a public creator page for your fans." />
              <Step icon={<Upload />} title="Upload merch and artwork" text="Add product mockups, artwork files and selling prices." />
              <Step icon={<PackageCheck />} title="Orders go to printers" text="Production jobs are routed with the artwork attached." />
              <Step icon={<Banknote />} title="Earn from every sale" text="Track orders, commissions and creator earnings." />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <p className="overline mb-2">What you get</p>
          <h2 className="font-display text-4xl md:text-5xl uppercase mb-8">Built For Merch Sellers</h2>

          <div className="grid md:grid-cols-3 gap-6">
            <Feature title="Your own storefront" text="A branded page where fans can browse and buy your merch." />
            <Feature title="Product management" text="Load products, variations, mockups, pricing and artwork." />
            <Feature title="No stock holding" text="Sell first, print after order confirmation." />
            <Feature title="Printer routing" text="Approved printers receive the order details and artwork files." />
            <Feature title="Order tracking" text="Follow each order from checkout to production and dispatch." />
            <Feature title="Clear earnings" text="See sales, platform commission, print costs and payouts." />
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <p className="overline mb-2">Simple model</p>
          <h2 className="font-display text-4xl md:text-5xl uppercase mb-8">How The Money Works</h2>

          <div className="grid md:grid-cols-4 gap-4">
            <Money label="Fan pays" value="Selling Price" />
            <Money label="Printer gets" value="Print Cost" />
            <Money label="Platform gets" value="Commission" />
            <Money label="You earn" value="Profit" />
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6 md:px-10 text-center">
          <p className="overline mb-2">Ready to sell?</p>
          <h2 className="font-display text-5xl uppercase mb-6">Launch Your Merch Store</h2>
          <p className="text-[var(--ff-muted-text)] mb-8">
            Start with your profile, then load products and artwork once your store is ready.
          </p>
          <Link to="/register/creator" className="btn-primary">
            Start Selling <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Step({ icon, title, text }) {
  return (
    <div className="flex gap-4">
      <div className="text-[var(--ff-primary)] mt-1">{icon}</div>
      <div>
        <h3 className="font-display text-2xl uppercase">{title}</h3>
        <p className="text-[var(--ff-muted-text)] text-sm">{text}</p>
      </div>
    </div>
  );
}

function Feature({ title, text }) {
  return (
    <div className="card">
      <h3 className="font-display text-2xl uppercase mb-2">{title}</h3>
      <p className="text-[var(--ff-muted-text)] text-sm">{text}</p>
    </div>
  );
}

function Money({ label, value }) {
  return (
    <div className="border border-[var(--ff-card-border)] bg-white/[0.03] p-6">
      <p className="text-[var(--ff-muted-text)] text-xs uppercase tracking-widest mb-2">{label}</p>
      <p className="font-display text-2xl uppercase">{value}</p>
    </div>
  );
}