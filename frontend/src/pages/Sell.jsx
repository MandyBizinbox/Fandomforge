import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { ArrowRight, CheckCircle2, ClipboardCheck, CreditCard, PackageCheck, Send, Settings, ShieldCheck, Store, Truck, UserCheck } from "lucide-react";

const problemPoints = [
  "You have to guess sizes before people order.",
  "You need money upfront to buy stock.",
  "You may end up with unsold products.",
  "Someone has to collect orders manually.",
  "Someone has to track payments.",
  "Someone has to manage spreadsheets.",
  "Someone has to chase people.",
  "Someone has to pack and distribute orders.",
  "Fundraising admin can become bigger than the fundraiser.",
];

const audiences = ["Scout Groups", "Schools", "Churches", "Sports Clubs", "Charities", "Community Organisations", "Fan Communities", "Small Businesses", "Event Organisers"];
const benefits = ["No inventory", "No upfront stock purchases", "Print-on-demand", "Secure payments", "Nationwide shipping", "Local production", "Professional storefront", "Fundraising opportunities", "Time savings", "Reduced administration"];

const visibilityModes = [
  ["Public", "For brands or creators who want discoverability."],
  ["Unlisted", "For groups, schools, churches, clubs, and fundraisers. Recommended default."],
  ["Private", "Future option for invitation-only or restricted-access stores."],
];

const steps = [
  ["Apply", "Tell us about your organisation, group, brand, or campaign."],
  ["Get Approved", "We review your application and activate your creator account."],
  ["Build Your Store", "Add branding, products, prices, and campaign details."],
  ["Share Your Link", "Send your store link to your members, supporters, customers, or fans."],
  ["Customers Order Online", "Customers choose products, add to cart, and pay securely."],
  ["FandomForge Prints & Ships", "Orders move through production and fulfilment."],
  ["You Track Sales", "View orders, performance, and earnings from your dashboard."],
];

const faqs = [
  ["Will my products be visible to everyone?", "No. The recommended default is an Unlisted store. Your store can be accessed by direct link without being shown in a public catalogue."],
  ["Do I need to buy stock upfront?", "No. FandomForge is designed around print-on-demand, so products can be produced when customers order."],
  ["Who handles payments?", "Customers pay through the platform, reducing manual payment tracking for your organisation."],
  ["Who prints the products?", "FandomForge manages the production workflow through approved production partners and platform fulfilment processes."],
  ["Can this be used for fundraising?", "Yes. FandomForge is suitable for fundraising campaigns, group merchandise, school spirit wear, event products, and community merchandise."],
  ["Can my organisation have its own branding?", "Yes. Creator stores should support logos, banners, organisation branding, and product presentation."],
  ["Can I share the store only with my members?", "Yes. Use an Unlisted store and share the direct link only with your intended audience."],
  ["Can a store be password-protected?", "This should be supported as a future Private visibility mode. The immediate priority is Public and Unlisted."],
  ["Do customers need an account to buy?", "The current checkout flow should be preserved unless account creation becomes required for specific payment or fulfilment features."],
  ["What products can we sell?", "Start with launch-ready product types and approved templates. Expand once product templates and print methods are properly seeded and tested."],
];

function SectionHeading({ eyebrow, title, children }) {
  return (
    <div className="mb-8 max-w-3xl">
      {eyebrow && <p className="overline mb-2">{eyebrow}</p>}
      <h2 className="font-display text-4xl md:text-5xl uppercase leading-none">{title}</h2>
      {children && <p className="text-[var(--ff-muted-text)] mt-4">{children}</p>}
    </div>
  );
}

function StepIcon({ index }) {
  const icons = [ClipboardCheck, UserCheck, Store, Send, CreditCard, Truck, Settings];
  const Icon = icons[index] || CheckCircle2;
  return <Icon className="text-[var(--ff-primary)] mb-4" size={28} />;
}

export default function Sell() {
  return (
    <div className="min-h-screen page-shell">
      <Navbar />

      <section className="pt-32 pb-20 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div>
            <p className="overline mb-4">Sell online with FandomForge</p>
            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl uppercase leading-[0.9] mb-6">
              Sell branded merchandise online without buying stock upfront.
            </h1>
            <p className="text-[var(--ff-muted-text)] text-lg max-w-3xl mb-8">
              FandomForge gives your organisation a branded online store. You share the link with your community, customers order online, and we handle the printing, payments, and fulfilment.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/register/creator" className="btn-primary">Apply to Start a Store <ArrowRight size={18} /></Link>
              <a href="#how-it-works" className="btn-secondary">See How It Works</a>
            </div>
          </div>
          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-8">
            <p className="overline mb-5">Operational promise</p>
            <Store size={44} className="text-[var(--ff-primary)] mb-6" />
            <h2 className="font-display text-4xl uppercase leading-none mb-4">You promote the store. We handle the operational heavy lifting.</h2>
            <p className="text-[var(--ff-muted-text)]">A focused storefront, online payment flow, production process and fulfilment workflow for your branded merchandise.</p>
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="The problem" title="Traditional merchandise sales are messy." />
          <div className="grid md:grid-cols-3 gap-4">
            {problemPoints.map((point) => (
              <div key={point} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-5 flex gap-3">
                <CheckCircle2 size={18} className="text-[var(--ff-primary)] shrink-0 mt-1" />
                <p className="text-sm text-[var(--ff-muted-text)]">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="The solution" title="FandomForge removes the stock, payment, and fulfilment burden.">
            Your organisation gets a branded online store. You choose the products, set up your store, and share the link with your audience. Customers order and pay online. FandomForge manages the production and fulfilment process so you can focus on your community.
          </SectionHeading>
          <div className="border border-[var(--ff-primary)] bg-[var(--ff-primary)]/10 p-6 font-display text-3xl uppercase leading-none">
            You promote the store. We handle the operational heavy lifting.
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="Who it is for" title="Stores for groups, communities and campaigns" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {audiences.map((audience) => <div key={audience} className="card font-bold uppercase tracking-widest text-sm">{audience}</div>)}
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="Benefits" title="Less stock risk, fewer spreadsheets, cleaner fulfilment" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {benefits.map((benefit) => <div key={benefit} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-5 text-sm font-bold uppercase tracking-widest">{benefit}</div>)}
          </div>
        </div>
      </section>

      <section id="store-visibility" className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="Store privacy" title="Your store does not have to be public.">
            Many organisations only want their own community to access their merchandise. FandomForge supports direct-link stores, which means your products do not need to appear in a public marketplace.
          </SectionHeading>
          <div className="grid md:grid-cols-3 gap-6">
            {visibilityModes.map(([mode, text]) => (
              <div key={mode} className={`card ${mode === "Unlisted" ? "border-[var(--ff-primary)]" : ""}`}>
                <ShieldCheck className="text-[var(--ff-primary)] mb-4" />
                <h3 className="font-display text-3xl uppercase mb-2">{mode}</h3>
                <p className="text-[var(--ff-muted-text)] text-sm">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="How it works" title="Launch without the merch admin spiral" />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map(([title, text], index) => (
              <div key={title} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 min-h-[210px]">
                <p className="text-[var(--ff-primary)] font-display text-5xl mb-3">{index + 1}</p>
                <StepIcon index={index} />
                <h3 className="font-display text-2xl uppercase mb-2">{title}</h3>
                <p className="text-[var(--ff-muted-text)] text-sm">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-5xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="FAQ" title="Common creator questions" />
          <div className="space-y-3">
            {faqs.map(([question, answer]) => (
              <details key={question} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-5">
                <summary className="font-display text-2xl uppercase cursor-pointer">{question}</summary>
                <p className="text-[var(--ff-muted-text)] text-sm mt-3">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6 md:px-10 text-center">
          <p className="overline mb-2">Apply today</p>
          <h2 className="font-display text-5xl md:text-6xl uppercase leading-none mb-5">Ready to launch your own merch store?</h2>
          <p className="text-[var(--ff-muted-text)] mb-8">Start selling branded merchandise to your community without managing stock, manual payments, or fulfilment admin.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register/creator" className="btn-primary">Apply to Start a Store <ArrowRight size={18} /></Link>
            <Link to="/contact" className="btn-secondary">Contact Us</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
