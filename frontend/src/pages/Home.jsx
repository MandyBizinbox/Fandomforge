import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import ProductCard from "../components/ProductCard";
import RichTextRenderer from "../components/RichTextRenderer";
import { http } from "../lib/api";
import { usePlatformConfig } from "../lib/platform";
import { ArrowRight, Music, Shirt, Truck, Sparkles, Store, ClipboardList } from "lucide-react";

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function sectionLimit(section, fallback) {
  const value = Number(section?.settings?.limit || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function SectionHeader({ eyebrow, title, subtitle, buttonLabel, buttonUrl }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
      <div>
        {eyebrow && <p className="overline mb-2">{eyebrow}</p>}
        {title && <h2 className="font-display text-4xl md:text-5xl uppercase">{title}</h2>}
        {subtitle && <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">{subtitle}</p>}
      </div>
      {buttonLabel && buttonUrl && (
        <Link to={buttonUrl} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold shrink-0">
          {buttonLabel} →
        </Link>
      )}
    </div>
  );
}

function HomeHero({ sections = [], homepage, platform }) {
  const slides = Array.isArray(sections) && sections.length ? sections : [{}];
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const timer = setInterval(() => setActive((current) => (current + 1) % slides.length), 7000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const section = slides[active] || slides[0] || {};
  const title = section?.title || homepage.hero_title || "Launch official merch stores without the production admin";
  const subtitle = section?.subtitle || homepage.hero_subtitle || "Give creators, clubs and communities a clean storefront, simple checkout and reliable fulfilment workflow.";
  const primaryLabel = section?.button_label || homepage.buyer_cta_label || "Shop Merch";
  const primaryUrl = section?.button_url || homepage.buyer_cta_url || "/shop";
  const secondaryLabel = section?.secondary_button_label || homepage.creator_cta_label || "Start Selling";
  const secondaryUrl = section?.secondary_button_url || homepage.creator_cta_url || "/register/creator";
  const isLight = platform.theme_mode === "light";
  const heroTextClass = isLight ? "text-zinc-700" : "text-[var(--ff-muted-text)]";
  const heroBodyClass = isLight ? "text-zinc-700" : "text-[var(--ff-muted-text)]";
  const heroBg = section?.settings?.background_color || platform.background_color || (isLight ? "#FFFFFF" : "#0A0A0A");
  const hasImage = Boolean(section?.image_url);

  return (
    <section
      className="pt-32 pb-20 border-b border-[var(--ff-card-border)] bg-cover bg-center relative overflow-hidden"
      style={{
        backgroundColor: heroBg,
        backgroundImage: hasImage ? `linear-gradient(90deg, ${isLight ? "rgba(255,255,255,0.92)" : "rgba(10,10,10,0.88)"} 0%, ${isLight ? "rgba(255,255,255,0.72)" : "rgba(10,10,10,0.58)"} 46%, rgba(10,10,10,0.08) 100%), url(${section.image_url})` : undefined,
      }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 grid lg:grid-cols-2 gap-12 items-center relative z-10">
        <div>
          <p className="overline mb-4">{section?.eyebrow || platform.platform_tagline || "Official merch platform"}</p>
          <h1 className="font-display text-6xl md:text-8xl uppercase leading-[0.9] mb-6">{title}</h1>
          <p className={`${heroTextClass} text-lg max-w-xl mb-4`}>{subtitle}</p>
          <RichTextRenderer html={section?.body_html} className={`${heroBodyClass} max-w-xl mb-8`} />
          <div className="flex flex-col sm:flex-row gap-4">
            {primaryLabel && primaryUrl && <Link to={primaryUrl} className="btn-primary">{primaryLabel} <ArrowRight size={18} /></Link>}
            {secondaryLabel && secondaryUrl && <Link to={secondaryUrl} className="btn-secondary">{secondaryLabel}</Link>}
          </div>

          {slides.length > 1 && (
            <div className="flex gap-2 mt-8">
              {slides.map((slide, index) => (
                <button
                  key={slide.id || index}
                  type="button"
                  onClick={() => setActive(index)}
                  className={`h-2 rounded-full transition-all ${index === active ? "w-10 bg-[var(--ff-primary)]" : "w-2 bg-white/30"}`}
                  aria-label={`Show hero slide ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {!hasImage && (
          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 min-h-[360px] flex items-center justify-center">
            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="card"><Store className="text-[var(--ff-primary)] mb-5" size={38} /><p className="font-display text-3xl uppercase">Storefronts</p><p className="text-[var(--ff-muted-text)] text-sm mt-2">Creator-ready shops.</p></div>
              <div className="card"><Shirt className="text-[var(--ff-primary)] mb-5" size={38} /><p className="font-display text-3xl uppercase">Templates</p><p className="text-[var(--ff-muted-text)] text-sm mt-2">Controlled blanks.</p></div>
              <div className="card"><ClipboardList className="text-[var(--ff-primary)] mb-5" size={38} /><p className="font-display text-3xl uppercase">Orders</p><p className="text-[var(--ff-muted-text)] text-sm mt-2">Clean production data.</p></div>
              <div className="card"><Truck className="text-[var(--ff-primary)] mb-5" size={38} /><p className="font-display text-3xl uppercase">Dispatch</p><p className="text-[var(--ff-muted-text)] text-sm mt-2">Tracking updates.</p></div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function FeatureGrid({ section }) {
  const features = Array.isArray(section.settings?.features) ? section.settings.features : [];
  return (
    <section className="py-16 border-b border-[var(--ff-card-border)]">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <SectionHeader eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} buttonLabel={section.button_label} buttonUrl={section.button_url} />
        <RichTextRenderer html={section.body_html} className="mb-8 text-[var(--ff-muted-text)]" />
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div key={index} className="card">
              <h3 className="font-display text-2xl uppercase mb-2">{feature.title}</h3>
              <p className="text-[var(--ff-muted-text)] text-sm">{feature.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ section }) {
  const steps = Array.isArray(section.settings?.steps) ? section.settings.steps : [];
  return (
    <section className="py-16 border-b border-[var(--ff-card-border)]">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <SectionHeader eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} />
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <div key={index} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6">
              <p className="text-[var(--ff-primary)] font-display text-5xl mb-4">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="font-display text-2xl uppercase mb-2">{step.title}</h3>
              <p className="text-[var(--ff-muted-text)] text-sm">{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AudienceCards({ section, homepage, modules, signup }) {
  return (
    <section className="py-16 border-b border-[var(--ff-card-border)]">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <SectionHeader eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} />
        <div className="grid md:grid-cols-3 gap-6">
          <Link to={homepage.buyer_cta_url || "/shop"} className="card hover:border-[var(--ff-primary)] border border-[var(--ff-card-border)]">
            <Sparkles className="text-[var(--ff-primary)] mb-4" />
            <h3 className="font-display text-2xl uppercase mb-2">For Buyers</h3>
            <p className="text-[var(--ff-muted-text)] text-sm">Browse creator stores, choose products and track your order online.</p>
          </Link>
          {modules.creators_enabled !== false && signup.creator_signup_enabled !== false && (
            <Link to={homepage.creator_cta_url || "/register/creator"} className="card hover:border-[var(--ff-primary)] border border-[var(--ff-card-border)]">
              <Shirt className="text-[var(--ff-primary)] mb-4" />
              <h3 className="font-display text-2xl uppercase mb-2">For Creators</h3>
              <p className="text-[var(--ff-muted-text)] text-sm">Launch a storefront, add approved products and sell without holding stock.</p>
            </Link>
          )}
          {modules.printers_enabled !== false && modules.printer_marketplace_enabled !== false && !modules.sole_printer_mode && signup.printer_signup_enabled !== false && (
            <Link to={homepage.printer_cta_url || "/register/printer"} className="card hover:border-[var(--ff-primary)] border border-[var(--ff-card-border)]">
              <Truck className="text-[var(--ff-primary)] mb-4" />
              <h3 className="font-display text-2xl uppercase mb-2">For Printers</h3>
              <p className="text-[var(--ff-muted-text)] text-sm">Receive production-ready jobs with artwork, mockups and dispatch details.</p>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function FeaturedProducts({ section, products }) {
  const rows = products.slice(0, sectionLimit(section, 8));
  return (
    <section className="py-16 border-b border-[var(--ff-card-border)]">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <SectionHeader eyebrow={section.eyebrow || "Shop now"} title={section.title || "Featured Products"} subtitle={section.subtitle} buttonLabel={section.button_label || "View all"} buttonUrl={section.button_url || "/shop"} />
        {rows.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {rows.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className="card text-[var(--ff-muted-text)]">Products will appear here once they are published.</div>
        )}
      </div>
    </section>
  );
}

function FeaturedCreators({ section, creators }) {
  const rows = creators.slice(0, sectionLimit(section, 6));
  return (
    <section className="py-16 border-b border-[var(--ff-card-border)]">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <SectionHeader eyebrow={section.eyebrow || "Browse stores"} title={section.title || "Creator Stores"} subtitle={section.subtitle} buttonLabel={section.button_label || "View creators"} buttonUrl={section.button_url || "/creators"} />
        {rows.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rows.map((creator) => (
              <Link key={creator.id} to={`/creators/${creator.slug}`} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-6 hover:border-[var(--ff-primary)]">
                <div className="h-32 bg-[var(--ff-surface-bg)] border border-[var(--ff-card-border)] mb-5 flex items-center justify-center">
                  {creator.logo_url ? <img src={creator.logo_url} alt={creator.name} className="max-h-full max-w-full object-contain" /> : <Music size={42} className="text-[var(--ff-muted-text)]" />}
                </div>
                <h3 className="font-display text-2xl uppercase">{creator.name}</h3>
                <p className="text-[var(--ff-muted-text)] text-sm mt-2">{creator.bio || "Official merch store"}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card text-[var(--ff-muted-text)]">Creator stores will appear here once they are active.</div>
        )}
      </div>
    </section>
  );
}

function RichTextSection({ section }) {
  return (
    <section className="py-16 border-b border-[var(--ff-card-border)]">
      <div className="max-w-5xl mx-auto px-6 md:px-10">
        <SectionHeader eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} buttonLabel={section.button_label} buttonUrl={section.button_url} />
        {section.image_url && <img src={section.image_url} alt={section.title || "Homepage section"} className="w-full max-h-[520px] object-cover border border-[var(--ff-card-border)] mb-8" />}
        <RichTextRenderer html={section.body_html} className="text-[var(--ff-muted-text)] text-base leading-relaxed" />
      </div>
    </section>
  );
}

function CtaBanner({ section }) {
  return (
    <section className="py-16 border-b border-[var(--ff-card-border)]">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="border border-[var(--ff-primary)] bg-[var(--ff-primary)]/10 p-8 md:p-12 text-center">
          {section.eyebrow && <p className="overline mb-2">{section.eyebrow}</p>}
          <h2 className="font-display text-4xl md:text-6xl uppercase mb-4">{section.title}</h2>
          {section.subtitle && <p className="text-[var(--ff-muted-text)] max-w-2xl mx-auto mb-6">{section.subtitle}</p>}
          <RichTextRenderer html={section.body_html} className="text-[var(--ff-muted-text)] max-w-2xl mx-auto mb-6" />
          {section.button_label && section.button_url && <Link to={section.button_url} className="btn-primary">{section.button_label} <ArrowRight size={18} /></Link>}
        </div>
      </div>
    </section>
  );
}

function FaqSection({ section }) {
  const faqs = Array.isArray(section.settings?.faqs) ? section.settings.faqs : [];
  return (
    <section className="py-16 border-b border-[var(--ff-card-border)]">
      <div className="max-w-5xl mx-auto px-6 md:px-10">
        <SectionHeader eyebrow={section.eyebrow} title={section.title} subtitle={section.subtitle} />
        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <details key={index} className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-5">
              <summary className="font-display text-2xl uppercase cursor-pointer">{faq.question}</summary>
              <RichTextRenderer html={faq.answer} className="text-[var(--ff-muted-text)] text-sm mt-3" />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const [products, setProducts] = useState([]);
  const [creators, setBands] = useState([]);
  const { platform } = usePlatformConfig();
  const homepage = platform.homepage || {};
  const modules = platform.modules || {};
  const signup = platform.signup || {};

  useEffect(() => {
    http.get("/products").then((r) => setProducts(asArray(r.data))).catch(() => setProducts([]));
    http.get("/creators").then((r) => setBands(asArray(r.data))).catch(() => setBands([]));
  }, []);

  const sections = useMemo(() => {
    const rows = Array.isArray(platform.homepage_sections) ? platform.homepage_sections : [];
    return rows.filter((section) => section && section.enabled !== false).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }, [platform.homepage_sections]);

  const heroSections = sections.filter((section) => section.type === "hero");
  const nonHeroSections = sections.filter((section) => section.type !== "hero");
  const safeProducts = Array.isArray(products) ? products : [];
  const safeBands = Array.isArray(creators) ? creators : [];

  const renderSection = (section) => {
    switch (section.type) {
      case "feature_grid": return <FeatureGrid key={section.id} section={section} />;
      case "how_it_works": return <HowItWorks key={section.id} section={section} />;
      case "audience_cards": return <AudienceCards key={section.id} section={section} homepage={homepage} modules={modules} signup={signup} />;
      case "featured_products": return <FeaturedProducts key={section.id} section={section} products={safeProducts} />;
      case "featured_creators": return <FeaturedCreators key={section.id} section={section} creators={safeBands} />;
      case "cta_banner": return <CtaBanner key={section.id} section={section} />;
      case "faq": return <FaqSection key={section.id} section={section} />;
      case "image_text":
      case "rich_text":
      default: return <RichTextSection key={section.id} section={section} />;
    }
  };

  return (
    <div
      className={`min-h-screen ${platform.theme_mode === "light" ? "text-[var(--ff-page-text)]" : "text-[var(--ff-page-text)]"}`}
      style={{ backgroundColor: platform.background_color || (platform.theme_mode === "light" ? "#FFFFFF" : "#0A0A0A") }}
    >
      <Navbar />
      <HomeHero sections={heroSections} homepage={homepage} platform={platform} />

      {nonHeroSections.length > 0 ? (
        nonHeroSections.map(renderSection)
      ) : (
        <>
          <FeaturedProducts section={{ eyebrow: "Shop now", title: homepage.featured_title || "Featured Products", button_label: "View all", button_url: "/shop", settings: { limit: 8 } }} products={safeProducts} />
          <FeaturedCreators section={{ eyebrow: "Browse stores", title: homepage.creators_title || "Creator Stores", button_label: "View creators", button_url: "/creators", settings: { limit: 6 } }} creators={safeBands} />
          <AudienceCards section={{ eyebrow: "Built for every role", title: "One platform for selling, fulfilment and tracking", subtitle: "Buyers, creators and fulfilment teams each get a focused workflow." }} homepage={homepage} modules={modules} signup={signup} />
        </>
      )}
    </div>
  );
}
