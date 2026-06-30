import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { ArrowRight, CheckCircle2, CreditCard, FileCheck2, Paintbrush, Send, Settings, ShieldCheck, Store, Truck, UserPlus } from "lucide-react";

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
const benefits = ["Free store access", "No inventory", "No upfront stock purchases", "Print-on-demand", "Secure payments", "Nationwide shipping", "Local production", "Professional storefront", "Fundraising opportunities", "Reduced administration"];

const visibilityModes = [
  ["Direct-link stores", "Share your store URL with your own audience without being listed in a public catalogue."],
  ["Merch review", "Products are reviewed before going live so customers can order with confidence."],
  ["Seller dashboard", "Track products, orders, store activity, and earnings from one place."],
];

const steps = [
  ["Start Your Free Store", "Create your seller account and set up your store. Store access is free, with platform terms and conditions applying."],
  ["Add Your Branding", "Upload your logo, banner, organisation details, and store information."],
  ["Add Your Merch", "Choose products, add designs, set details, and prepare your merchandise for review."],
  ["Merch Gets Reviewed", "Products are checked before going live so customers can order with confidence."],
  ["Share Your Store Link", "Send your direct store link to your members, supporters, customers, or fans."],
  ["Customers Order Online", "Customers choose products, add to cart, and pay securely."],
  ["FandomForge Prints & Ships", "Orders move through production and fulfilment."],
  ["You Track Sales", "View orders, store activity, and earnings from your dashboard."],
];

const faqs = [
  ["Is it free to open a FandomForge store?", "Yes. Sellers can create a store for free. Platform terms and conditions apply, and product/merch approval is required before items go live."],
  ["Do my products go live immediately?", "Your store access is instant, but merchandise is reviewed before it goes live. This helps protect quality, pricing accuracy, and customer confidence."],
  ["Will my store be public?", "By default, stores are designed for direct-link sharing. You can send your store link to your own audience without your products being promoted in a public catalogue."],
  ["Do I need to buy stock upfront?", "No. FandomForge is built around print-on-demand, so you do not need to buy boxes of stock before selling."],
  ["Who handles payments?", "Customers pay online through the platform. This reduces manual payment tracking for sellers and organisations."],
  ["Who handles printing and fulfilment?", "FandomForge manages the print and fulfilment workflow through the platform."],
  ["Can I use FandomForge for fundraising?", "Yes. FandomForge is ideal for groups, schools, Scout groups, clubs, churches, charities, events, and community fundraising."],
  ["Can I brand my own store?", "Yes. You can add your organisation or creator branding, including your store name, logo, banner, and product presentation."],
  ["How do customers find my store?", "You share your direct store link with your audience through WhatsApp, email, social media, newsletters, events, or your own website."],
  ["Can customers order from anywhere in South Africa?", "The platform is designed for South African sellers and customers, with fulfilment and delivery handled through the available platform options."],
  ["What kind of products can I sell?", "You can sell approved merchandise products supported by the platform, such as apparel, mugs, and other available print-on-demand items."],
  ["What happens after a customer orders?", "The order is processed through the platform, then moves into production and fulfilment. You can track activity from your seller dashboard."],
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
  const icons = [UserPlus, Paintbrush, Store, FileCheck2, Send, CreditCard, Truck, Settings];
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
              Create a free merch store and sell without buying stock upfront.
            </h1>
            <p className="text-[var(--ff-muted-text)] text-lg max-w-3xl mb-8">
              FandomForge gives your organisation instant access to a branded online store. Store access is free, platform terms apply, and merchandise is reviewed before it goes live.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/register/creator" className="btn-primary">Start Your Free Store <ArrowRight size={18} /></Link>
              <a href="#how-it-works" className="btn-secondary">Learn More</a>
            </div>
          </div>
          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-8">
            <p className="overline mb-5">How it works now</p>
            <Store size={44} className="text-[var(--ff-primary)] mb-6" />
            <h2 className="font-display text-4xl uppercase leading-none mb-4">Free store access. Merch reviewed before it goes live.</h2>
            <p className="text-[var(--ff-muted-text)]">Set up your store, add branding, prepare products for review, then share your direct store link once your merchandise is ready.</p>
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
            Your organisation gets a branded online store at no store-access cost. You add branding and prepare merchandise, products are reviewed before going live, and your customers order through your direct store link.
          </SectionHeading>
          <div className="border border-[var(--ff-primary)] bg-[var(--ff-primary)]/10 p-6 font-display text-3xl uppercase leading-none">
            You share the store. We handle the operational heavy lifting.
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
          <SectionHeading eyebrow="Benefits" title="Free store access, no stock risk, cleaner fulfilment" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {benefits.map((benefit) => <div key={benefit} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-5 text-sm font-bold uppercase tracking-widest">{benefit}</div>)}
          </div>
        </div>
      </section>

      <section id="store-visibility" className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="Store privacy" title="Your store is built for direct-link sharing.">
            Send your store link to your own audience through WhatsApp, email, social media, newsletters, events, or your own website. Your products do not need to be promoted in a public catalogue.
          </SectionHeading>
          <div className="grid md:grid-cols-3 gap-6">
            {visibilityModes.map(([mode, text]) => (
              <div key={mode} className="card">
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
          <SectionHeading eyebrow="How it works" title="From free store setup to fulfilled orders" />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map(([title, text], index) => (
              <div key={title} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 min-h-[220px]">
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
          <SectionHeading eyebrow="FAQ" title="Common seller questions" />
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
          <p className="overline mb-2">Start free</p>
          <h2 className="font-display text-5xl md:text-6xl uppercase leading-none mb-5">Ready to launch your own merch store?</h2>
          <p className="text-[var(--ff-muted-text)] mb-8">Create your free store, prepare your merchandise for review, and start sharing your direct store link with your community.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register/creator" className="btn-primary">Start Your Free Store <ArrowRight size={18} /></Link>
            <Link to="/contact" className="btn-secondary">Contact Us</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
