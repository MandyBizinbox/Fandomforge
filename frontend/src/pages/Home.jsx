import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { ArrowRight, BadgeCheck, Boxes, CreditCard, HeartHandshake, Link as LinkIcon, PackageCheck, Paintbrush, ShieldCheck, Shirt, Store, Truck } from "lucide-react";

const trustTags = ["Print-on-demand", "Secure payments", "South African production", "No inventory required"];

const communityCards = [
  { title: "Schools", text: "Spirit wear, event shirts, leavers gear and campaign merch for school communities." },
  { title: "Scout Groups", text: "A simple direct-link store for group kit, fundraising drops and supporter merchandise." },
  { title: "Clubs & Communities", text: "Branded products for members, supporters and local audiences without stock admin." },
];

const flow = ["Join", "Create Store", "Share Store Link", "Customers Order", "FandomForge Prints & Ships", "Creator Earns"];

const features = [
  ["Print-on-demand", "Products can be produced after customers order, helping you avoid bulk stock risk."],
  ["No inventory", "No boxes of unsold sizes sitting with a volunteer, teacher, treasurer or organiser."],
  ["Secure online payments", "Customers order and pay online, reducing manual payment tracking."],
  ["Fundraising support", "Use branded merchandise as a practical fundraiser for your group or campaign."],
  ["Shipping handled", "Production and fulfilment workflows are managed through the platform."],
  ["South African production", "Built around local production partners and South African customer needs."],
  ["Creator branding", "Your store can carry your logo, banner, messaging and community identity."],
  ["Easy store management", "Manage products, orders and store details from a focused creator dashboard."],
];

const audiences = [
  "Scout Groups",
  "Schools",
  "Churches",
  "Sports Clubs",
  "Charities",
  "Community Organisations",
  "Fan Communities",
  "Small Businesses",
  "Event Organisers",
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

function IconForFeature({ title }) {
  const icons = {
    "Print-on-demand": Shirt,
    "No inventory": Boxes,
    "Secure online payments": CreditCard,
    "Fundraising support": HeartHandshake,
    "Shipping handled": Truck,
    "South African production": BadgeCheck,
    "Creator branding": Paintbrush,
    "Easy store management": Store,
  };
  const Icon = icons[title] || PackageCheck;
  return <Icon size={28} className="text-[var(--ff-primary)] mb-4" />;
}

export default function Home() {
  return (
    <div className="min-h-screen page-shell">
      <Navbar />

      <section className="pt-32 pb-16 md:pb-20 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10 grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center">
          <div>
            <p className="overline mb-4">FandomForge for communities</p>
            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl uppercase leading-[0.9] mb-6">
              Your own online merch store, without the stock, admin, or shipping headaches.
            </h1>
            <p className="text-[var(--ff-muted-text)] text-lg max-w-3xl mb-8">
              FandomForge helps schools, Scout groups, clubs, churches, creators, and communities sell branded merchandise online. You share your store link, your supporters order, and we handle the printing, payments, and delivery.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Link to="/sell" className="btn-primary">Sell Online <ArrowRight size={18} /></Link>
              <Link to="/sell#how-it-works" className="btn-secondary">Learn More</Link>
            </div>
            <div className="flex flex-wrap gap-3">
              {trustTags.map((tag) => (
                <span key={tag} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] px-3 py-2 text-xs uppercase tracking-widest text-[var(--ff-muted-text)]">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 md:p-8">
            <div className="grid grid-cols-2 gap-4">
              {features.slice(0, 4).map(([title, text]) => (
                <div key={title} className="border border-[var(--ff-card-border)] bg-white/[0.03] p-5 min-h-[150px]">
                  <IconForFeature title={title} />
                  <h3 className="font-display text-2xl uppercase leading-none mb-2">{title}</h3>
                  <p className="text-[var(--ff-muted-text)] text-sm">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="Social proof" title="Communities using FandomForge">
            FandomForge supports groups, organisations, and creators who want a simple way to offer branded merchandise to their own communities.
          </SectionHeading>
          <div className="grid md:grid-cols-3 gap-6">
            {communityCards.map((card) => (
              <div key={card.title} className="card min-h-[190px]">
                <div className="h-16 w-16 border border-[var(--ff-card-border)] bg-[var(--ff-primary)]/10 flex items-center justify-center mb-5">
                  <Store className="text-[var(--ff-primary)]" />
                </div>
                <h3 className="font-display text-3xl uppercase mb-2">{card.title}</h3>
                <p className="text-[var(--ff-muted-text)] text-sm">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="How it works" title="From link to delivered order" />
          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
            {flow.map((step, index) => (
              <div key={step} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-5 min-h-[150px]">
                <p className="text-[var(--ff-primary)] font-display text-4xl mb-4">{index + 1}</p>
                <h3 className="font-display text-2xl uppercase leading-none">{step}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="Features" title="Built to reduce merch admin" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map(([title, text]) => (
              <div key={title} className="card">
                <IconForFeature title={title} />
                <h3 className="font-display text-2xl uppercase mb-2">{title}</h3>
                <p className="text-[var(--ff-muted-text)] text-sm">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <SectionHeading eyebrow="Who it is for" title="Made for groups with an audience" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {audiences.map((name) => (
              <div key={name} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-5 flex items-center gap-3">
                <ShieldCheck size={20} className="text-[var(--ff-primary)] shrink-0" />
                <span className="font-bold uppercase tracking-widest text-sm">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10 grid lg:grid-cols-[0.85fr_1.15fr] gap-8 items-center">
          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-8">
            <LinkIcon size={42} className="text-[var(--ff-primary)] mb-6" />
            <p className="overline mb-2">Direct-link stores</p>
            <h2 className="font-display text-4xl md:text-5xl uppercase leading-none mb-4">Your store can stay private to your community.</h2>
            <p className="text-[var(--ff-muted-text)] mb-6">
              FandomForge does not need to publicly list your merchandise. You can share your store directly with your audience, and your products do not have to appear in a public marketplace.
            </p>
            <Link to="/sell#store-visibility" className="btn-secondary">Learn how store visibility works</Link>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[["Public", "For discoverable brands."], ["Unlisted", "Recommended for groups and fundraisers."], ["Private", "Future restricted-access option."]].map(([title, text]) => (
              <div key={title} className="border border-[var(--ff-card-border)] bg-white/[0.03] p-6 min-h-[170px]">
                <h3 className="font-display text-3xl uppercase mb-3">{title}</h3>
                <p className="text-[var(--ff-muted-text)] text-sm">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6 md:px-10 text-center">
          <p className="overline mb-2">Start selling</p>
          <h2 className="font-display text-5xl md:text-6xl uppercase leading-none mb-6">Ready to sell merchandise without managing the admin?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/sell" className="btn-primary">Sell Online <ArrowRight size={18} /></Link>
            <Link to="/contact" className="btn-secondary">Contact Us</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
