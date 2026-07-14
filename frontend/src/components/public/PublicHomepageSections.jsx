import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Store, Users } from "lucide-react";
import { assetUrl, http } from "../../lib/api";
import ProductCard from "../ProductCard";
import RichTextRenderer from "../RichTextRenderer";

const DEFAULT_AUDIENCES = [
  { title: "Creators and designers", text: "Turn original artwork and ideas into products through the Creator Studio." },
  { title: "Clubs and teams", text: "Give members and supporters one place to order approved merchandise." },
  { title: "Schools and youth groups", text: "Create spirit wear, event products and fundraising merchandise without bulk stock." },
  { title: "Events and organisations", text: "Launch a dedicated store for campaigns, communities and supporter merchandise." },
];

function sectionClass(section) {
  return `py-14 md:py-16 border-b border-[var(--ff-card-border)] ${section.settings?.class_name || ""}`;
}

function SectionHeader({ section, centered = false }) {
  return (
    <div className={`${centered ? "text-center mx-auto" : ""} max-w-3xl mb-8`}>
      {section.eyebrow && <p className="overline mb-2">{section.eyebrow}</p>}
      {section.title && <h2 className="font-display text-4xl md:text-5xl uppercase leading-none">{section.title}</h2>}
      {section.subtitle && <p className="mt-4 text-[var(--ff-muted-text)]">{section.subtitle}</p>}
      {section.body_html && <RichTextRenderer html={section.body_html} className="mt-4 text-[var(--ff-muted-text)]" />}
    </div>
  );
}

function ActionButtons({ section, centered = false }) {
  if (!section.button_label && !section.secondary_button_label) return null;
  return (
    <div className={`flex flex-col sm:flex-row gap-3 mt-6 ${centered ? "justify-center" : ""}`}>
      {section.button_label && section.button_url && (
        <Link to={section.button_url} className="btn-primary">
          {section.button_label} <ArrowRight size={17} />
        </Link>
      )}
      {section.secondary_button_label && section.secondary_button_url && (
        <Link to={section.secondary_button_url} className="btn-secondary">
          {section.secondary_button_label}
        </Link>
      )}
    </div>
  );
}

function HeroSection({ section }) {
  const image = assetUrl(section.image_url);
  return (
    <section className="pt-32 pb-16 md:pb-20 border-b border-[var(--ff-card-border)]">
      <div className={`max-w-7xl mx-auto px-6 md:px-10 ${image ? "grid lg:grid-cols-[1.08fr_0.92fr] gap-10 items-center" : ""}`}>
        <div>
          {section.eyebrow && <p className="overline mb-4">{section.eyebrow}</p>}
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl uppercase leading-[0.9] mb-6">
            {section.title || "Create merchandise for your community"}
          </h1>
          {section.subtitle && <p className="text-[var(--ff-muted-text)] text-lg max-w-3xl mb-5">{section.subtitle}</p>}
          {section.body_html && <RichTextRenderer html={section.body_html} className="text-[var(--ff-muted-text)] max-w-3xl" />}
          <ActionButtons section={section} />
        </div>
        {image && (
          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-3 md:p-5">
            <img src={image} alt="" className="w-full h-auto max-h-[560px] object-contain" />
          </div>
        )}
      </div>
    </section>
  );
}

function FeatureGridSection({ section }) {
  const features = Array.isArray(section.settings?.features) ? section.settings.features : [];
  const rows = features.length ? features : DEFAULT_AUDIENCES;
  return (
    <section className={sectionClass(section)}>
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <SectionHeader section={section} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((feature, index) => (
            <article key={`${feature.title || "feature"}-${index}`} className="card min-h-[170px]">
              <CheckCircle2 size={23} className="text-[var(--ff-primary)] mb-4" />
              <h3 className="font-display text-2xl uppercase leading-none mb-3">{feature.title}</h3>
              <p className="text-sm text-[var(--ff-muted-text)]">{feature.text}</p>
            </article>
          ))}
        </div>
        <ActionButtons section={section} />
      </div>
    </section>
  );
}

function HowItWorksSection({ section }) {
  const steps = Array.isArray(section.settings?.steps) ? section.settings.steps : [];
  const rows = steps.length ? steps : [
    { title: "Create", text: "Set up your account and creator profile." },
    { title: "Build", text: "Choose a product and add artwork or text." },
    { title: "Price", text: "Set the selling price using the live cost calculation." },
    { title: "Publish", text: "Save, review and publish the product." },
    { title: "Share", text: "Send your storefront link to your community." },
    { title: "Fulfil", text: "Orders move through production and delivery." },
  ];
  return (
    <section className={sectionClass(section)}>
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <SectionHeader section={section} />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((step, index) => (
            <article key={`${step.title || "step"}-${index}`} className="card flex gap-4 min-h-[150px]">
              <div className="font-display text-4xl text-[var(--ff-primary)] leading-none">{index + 1}</div>
              <div>
                <h3 className="font-display text-2xl uppercase leading-none mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--ff-muted-text)]">{step.text}</p>
              </div>
            </article>
          ))}
        </div>
        <ActionButtons section={section} />
      </div>
    </section>
  );
}

function AudienceCardsSection({ section }) {
  const cards = Array.isArray(section.settings?.cards) ? section.settings.cards : [];
  const rows = cards.length ? cards : DEFAULT_AUDIENCES;
  return (
    <section className={sectionClass(section)}>
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <SectionHeader section={section} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {rows.map((card, index) => (
            <article key={`${card.title || "audience"}-${index}`} className="card min-h-[180px]">
              <Users size={24} className="text-[var(--ff-primary)] mb-4" />
              <h3 className="font-display text-2xl uppercase leading-none mb-3">{card.title}</h3>
              <p className="text-sm text-[var(--ff-muted-text)]">{card.text}</p>
            </article>
          ))}
        </div>
        <ActionButtons section={section} />
      </div>
    </section>
  );
}

function RichTextSection({ section }) {
  return (
    <section className={sectionClass(section)}>
      <div className="max-w-4xl mx-auto px-6 md:px-10">
        <SectionHeader section={section} />
        <ActionButtons section={section} />
      </div>
    </section>
  );
}

function ImageTextSection({ section }) {
  const image = assetUrl(section.image_url);
  return (
    <section className={sectionClass(section)}>
      <div className="max-w-7xl mx-auto px-6 md:px-10 grid lg:grid-cols-2 gap-8 items-center">
        <div>
          <SectionHeader section={section} />
          <ActionButtons section={section} />
        </div>
        {image ? (
          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-3">
            <img src={image} alt="" className="w-full h-auto max-h-[520px] object-contain" />
          </div>
        ) : (
          <div className="card min-h-[260px] flex items-center justify-center text-[var(--ff-muted-text)]"><Store size={50} /></div>
        )}
      </div>
    </section>
  );
}

function FaqSection({ section }) {
  const faqs = Array.isArray(section.settings?.faqs) ? section.settings.faqs : [];
  if (!faqs.length) return null;
  return (
    <section className={sectionClass(section)}>
      <div className="max-w-4xl mx-auto px-6 md:px-10">
        <SectionHeader section={section} />
        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <details key={`${faq.question || "faq"}-${index}`} className="card">
              <summary className="font-display text-2xl uppercase cursor-pointer">{faq.question}</summary>
              <p className="text-sm text-[var(--ff-muted-text)] mt-3">{faq.answer}</p>
            </details>
          ))}
        </div>
        <ActionButtons section={section} />
      </div>
    </section>
  );
}

function CtaSection({ section }) {
  return (
    <section className={sectionClass(section)}>
      <div className="max-w-5xl mx-auto px-6 md:px-10 text-center">
        <SectionHeader section={section} centered />
        <ActionButtons section={section} centered />
      </div>
    </section>
  );
}

function FeaturedProductsSection({ section, products }) {
  const limit = Math.max(1, Number(section.settings?.limit || 8));
  const rows = products.slice(0, limit);
  return (
    <section className={sectionClass(section)}>
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <SectionHeader section={section} />
        {rows.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {rows.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className="card text-[var(--ff-muted-text)]">Published products will appear here when they are available.</div>
        )}
        <ActionButtons section={section} />
      </div>
    </section>
  );
}

function FeaturedCreatorsSection({ section, creators }) {
  const limit = Math.max(1, Number(section.settings?.limit || 6));
  const rows = creators.slice(0, limit);
  return (
    <section className={sectionClass(section)}>
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <SectionHeader section={section} />
        {rows.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {rows.map((creator) => (
              <Link key={creator.id || creator.slug || creator.display_name} to={`/creators/${creator.slug || creator.id}`} className="card card-interactive block">
                <div className="h-24 bg-[var(--ff-surface-bg)] border border-[var(--ff-card-border)] overflow-hidden mb-4 flex items-center justify-center">
                  {creator.banner_url ? <img src={assetUrl(creator.banner_url)} alt="" className="w-full h-full object-cover" /> : <Store size={32} className="text-[var(--ff-primary)]" />}
                </div>
                <h3 className="font-display text-3xl uppercase leading-none">{creator.display_name || creator.name || "Creator Store"}</h3>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card text-[var(--ff-muted-text)]">Active creator stores will appear here when they are available.</div>
        )}
        <ActionButtons section={section} />
      </div>
    </section>
  );
}

export default function PublicHomepageSections({ sections = [] }) {
  const enabledSections = useMemo(
    () => (Array.isArray(sections) ? sections : []).filter((section) => section && section.enabled !== false).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    [sections]
  );
  const needsProducts = enabledSections.some((section) => section.type === "featured_products");
  const needsCreators = enabledSections.some((section) => section.type === "featured_creators");
  const [products, setProducts] = useState([]);
  const [creators, setCreators] = useState([]);

  useEffect(() => {
    let mounted = true;
    if (needsProducts) {
      http.get("/products?published=true")
        .then((response) => mounted && setProducts(Array.isArray(response.data) ? response.data : []))
        .catch(() => mounted && setProducts([]));
    }
    if (needsCreators) {
      http.get("/public/creators/gallery")
        .then((response) => mounted && setCreators(Array.isArray(response.data) ? response.data : []))
        .catch(() => mounted && setCreators([]));
    }
    return () => { mounted = false; };
  }, [needsProducts, needsCreators]);

  return enabledSections.map((section) => {
    const key = section.id || `${section.type}-${section.sort_order}`;
    if (section.type === "hero") return <HeroSection key={key} section={section} />;
    if (section.type === "feature_grid") return <FeatureGridSection key={key} section={section} />;
    if (section.type === "how_it_works") return <HowItWorksSection key={key} section={section} />;
    if (section.type === "audience_cards") return <AudienceCardsSection key={key} section={section} />;
    if (section.type === "rich_text") return <RichTextSection key={key} section={section} />;
    if (section.type === "image_text") return <ImageTextSection key={key} section={section} />;
    if (section.type === "faq") return <FaqSection key={key} section={section} />;
    if (section.type === "cta_banner") return <CtaSection key={key} section={section} />;
    if (section.type === "featured_products") return <FeaturedProductsSection key={key} section={section} products={products} />;
    if (section.type === "featured_creators") return <FeaturedCreatorsSection key={key} section={section} creators={creators} />;
    return null;
  });
}
