import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  Image,
  Layers3,
  PackageCheck,
  Paintbrush,
  Palette,
  School,
  ShieldCheck,
  Shirt,
  Store,
  Truck,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";
import { usePlatformConfig } from "../lib/platform";

function PageShell({ eyebrow, title, intro, children, primaryLabel = "Start Creating", primaryTo = "/register/creator", secondaryLabel, secondaryTo }) {
  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <section className="pt-32 pb-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-6xl mx-auto px-6 md:px-10">
          <p className="overline mb-3">{eyebrow}</p>
          <h1 className="font-display text-5xl md:text-7xl uppercase leading-[0.92] max-w-5xl">{title}</h1>
          {intro && <p className="mt-6 max-w-3xl text-lg text-[var(--ff-muted-text)]">{intro}</p>}
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            {primaryLabel && primaryTo && <Link to={primaryTo} className="btn-primary">{primaryLabel} <ArrowRight size={17} /></Link>}
            {secondaryLabel && secondaryTo && <Link to={secondaryTo} className="btn-secondary">{secondaryLabel}</Link>}
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}

function Section({ eyebrow, title, intro, children, id = "", narrow = false }) {
  return (
    <section id={id} className="py-14 md:py-16 border-b border-[var(--ff-card-border)]">
      <div className={`${narrow ? "max-w-4xl" : "max-w-6xl"} mx-auto px-6 md:px-10`}>
        <div className="max-w-3xl mb-8">
          {eyebrow && <p className="overline mb-2">{eyebrow}</p>}
          <h2 className="font-display text-4xl md:text-5xl uppercase leading-none">{title}</h2>
          {intro && <p className="mt-4 text-[var(--ff-muted-text)]">{intro}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function Cards({ items, columns = "md:grid-cols-3" }) {
  return (
    <div className={`grid gap-4 ${columns}`}>
      {items.map((item, index) => {
        const Icon = item.icon || CheckCircle2;
        return (
          <article key={item.title || index} className="card min-h-[180px]">
            <Icon size={26} className="text-[var(--ff-primary)] mb-4" />
            <h3 className="font-display text-2xl uppercase leading-none mb-3">{item.title}</h3>
            <p className="text-sm text-[var(--ff-muted-text)]">{item.text}</p>
            {item.link && <Link to={item.link} className="inline-flex mt-4 text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)]">{item.linkLabel || "Learn more"} →</Link>}
          </article>
        );
      })}
    </div>
  );
}

function NumberedSteps({ steps }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {steps.map((step, index) => (
        <article key={step.title} className="card flex gap-4">
          <div className="font-display text-4xl text-[var(--ff-primary)] leading-none">{index + 1}</div>
          <div>
            <h3 className="font-display text-2xl uppercase leading-none mb-2">{step.title}</h3>
            <p className="text-sm text-[var(--ff-muted-text)]">{step.text}</p>
            {step.link && <Link to={step.link} className="inline-flex mt-3 text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)]">{step.linkLabel || "Continue"} →</Link>}
          </div>
        </article>
      ))}
    </div>
  );
}

function OperationalNote({ children }) {
  return (
    <div className="border border-[var(--ff-primary)] bg-[color-mix(in_srgb,var(--ff-primary)_10%,transparent)] p-5 text-sm">
      <div className="flex gap-3">
        <ShieldCheck className="text-[var(--ff-primary)] shrink-0" size={20} />
        <div>{children}</div>
      </div>
    </div>
  );
}

export function BecomeCreatorPage() {
  const { platform } = usePlatformConfig();
  const creatorSignupEnabled = platform?.signup?.creator_signup_enabled !== false;
  const approvalRequired = platform?.signup?.require_creator_approval === true;

  const audiences = [
    "Creators and designers", "Gaming communities", "Racing communities", "Clubs", "Schools", "Bands and musicians",
    "Events", "Organisations and associations", "Small brands", "Community leaders",
  ];

  return (
    <PageShell
      eyebrow="Become a creator"
      title="Create merchandise for your community without carrying stock or managing fulfilment."
      intro="Choose products, upload artwork, add text, set your selling price and build a dedicated storefront through the Creator Studio. FandomForge manages the production and order-fulfilment workflow."
      primaryLabel={creatorSignupEnabled ? "Create Your FandomForge Account" : "Creator Signup Temporarily Closed"}
      primaryTo={creatorSignupEnabled ? "/register/creator" : "/contact"}
      secondaryLabel="See How It Works"
      secondaryTo="/how-it-works"
    >
      <Section eyebrow="Who can join" title="Built for more than traditional artists">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {audiences.map((name) => <div key={name} className="card text-sm font-bold uppercase tracking-wider">{name}</div>)}
        </div>
      </Section>

      <Section eyebrow="Creator control" title="You build the product. The platform handles the operational workflow.">
        <Cards items={[
          { icon: Shirt, title: "Choose products", text: "Use approved product templates with controlled sizes, colours and printable areas." },
          { icon: Upload, title: "Add artwork", text: "Upload image artwork or create custom text layers directly in the Creator Studio." },
          { icon: Palette, title: "Control the design", text: "Position artwork, select supported production options and preview the product." },
          { icon: Calculator, title: "Set the price", text: "See the platform cost calculation, choose a selling price and review estimated earnings." },
          { icon: Store, title: "Publish a storefront", text: "Share a dedicated store link with your fans, members, customers or supporters." },
          { icon: PackageCheck, title: "Orders are fulfilled", text: "FandomForge routes approved order information and artwork into production and fulfilment." },
        ]} />
      </Section>

      <Section eyebrow="After registration" title="A direct path from account to first product" narrow>
        <NumberedSteps steps={[
          { title: "Create your account", text: approvalRequired ? "Register your creator account. The current platform configuration requires account approval before full access." : "Register your creator account and continue into creator profile setup." },
          { title: "Complete your creator profile", text: "Add your display name, description, logo or profile image and public store details." },
          { title: "Review creator terms", text: "Confirm your rights to uploaded artwork and accept the current creator and platform policies.", link: "/creator-terms", linkLabel: "Read creator terms" },
          { title: "Create your first product", text: "Choose a product, select variations, add artwork or text, set pricing and save the draft." },
          { title: "Complete launch checks", text: "Confirm your storefront, payout information, terms and first published product are ready." },
        ]} />
      </Section>
    </PageShell>
  );
}

export function HowItWorksPage() {
  const steps = [
    ["Create an account", "Register as a creator and sign in to the creator workspace.", UserPlus],
    ["Set up your creator profile", "Add your creator, club, school, brand or organisation identity and storefront information.", Users],
    ["Choose a product", "Select a launch-ready product template and the available sizes and colours you want to offer.", Shirt],
    ["Upload or create artwork", "Upload an image or create custom text directly inside the product artwork studio.", Paintbrush],
    ["Select variants", "Choose the supported product variations that customers will be able to order.", Layers3],
    ["Set your selling price", "Review the calculated product and production costs, then set the customer selling price.", Calculator],
    ["Save and preview", "Save the product draft, generate the mockup and confirm the artwork placement and product information.", Image],
    ["Publish the product", "Submit or publish the completed product according to the current review workflow.", FileCheck2],
    ["Share your storefront", "Use your dedicated store link in social media, WhatsApp, websites, newsletters or community communication.", Store],
    ["Orders move to fulfilment", "FandomForge records the sale and routes product, variation, artwork and production details to fulfilment.", Truck],
  ];

  return (
    <PageShell eyebrow="How it works" title="From creator account to fulfilled merchandise order." intro="You choose the products, artwork and selling price. FandomForge keeps the product, pricing, order and production details connected behind the scenes as you move through each step." primaryLabel="Start Creating" primaryTo="/register/creator" secondaryLabel="View Products and Pricing" secondaryTo="/products-and-pricing">
      <Section eyebrow="Creator journey" title="Ten clear steps">
        <div className="grid md:grid-cols-2 gap-4">
          {steps.map(([title, text, Icon], index) => (
            <article key={title} className="card flex gap-4 min-h-[150px]">
              <div className="shrink-0">
                <div className="font-display text-4xl text-[var(--ff-primary)] leading-none">{index + 1}</div>
                <Icon size={22} className="mt-3 text-[var(--ff-primary)]" />
              </div>
              <div>
                <h2 className="font-display text-2xl uppercase leading-none mb-2">{title}</h2>
                <p className="text-sm text-[var(--ff-muted-text)]">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </PageShell>
  );
}

export function ProductsPricingPage() {
  const [productTypes, setProductTypes] = useState([]);

  useEffect(() => {
    let mounted = true;
    http.get("/public/product-types?status=active")
      .then((response) => mounted && setProductTypes(Array.isArray(response.data) ? response.data : []))
      .catch(() => mounted && setProductTypes([]));
    return () => { mounted = false; };
  }, []);

  const definitions = [
    ["Base product cost", "The product or blank cost used before artwork production is added."],
    ["Printing cost", "The estimated cost of producing the selected artwork using the chosen production profile and print size."],
    ["Total base cost", "The combined product and production amount calculated by the Creator Studio."],
    ["Selling price", "The customer-facing price set for the product, subject to platform pricing controls."],
    ["Estimated creator earnings", "The estimated creator amount displayed by the live pricing calculation before the product is published."],
    ["Shipping", "A separate customer delivery cost based on the available checkout method and destination."],
  ];

  return (
    <PageShell eyebrow="Products and pricing" title="See what you can create and understand every part of the price." intro="Product availability, colours, sizes, production profiles and costs are controlled by the live catalogue. Registered creators receive the detailed catalogue-pricing view inside the dashboard." primaryLabel="Create an Account" primaryTo="/register/creator" secondaryLabel="Creator Catalogue Pricing" secondaryTo="/creator/catalogue-pricing">
      <Section eyebrow="Active catalogue" title="Launch product types">
        {productTypes.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {productTypes.map((type) => (
              <article key={type.id || type.slug || type.name} className="card">
                <Shirt className="text-[var(--ff-primary)] mb-4" />
                <h3 className="font-display text-2xl uppercase">{type.name}</h3>
                <p className="text-sm text-[var(--ff-muted-text)] mt-2">{type.description || type.category || "Available through approved product templates."}</p>
              </article>
            ))}
          </div>
        ) : (
          <OperationalNote>The detailed active product list is loaded from the live catalogue. Sign in to view the creator catalogue-pricing workspace.</OperationalNote>
        )}
      </Section>

      <Section eyebrow="Pricing explained" title="The six values creators need to understand">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {definitions.map(([title, text]) => <article key={title} className="card"><h3 className="font-display text-2xl uppercase mb-2">{title}</h3><p className="text-sm text-[var(--ff-muted-text)]">{text}</p></article>)}
        </div>
      </Section>
    </PageShell>
  );
}

export function CreatorOnboardingPage() {
  const { platform } = usePlatformConfig();
  const creatorSignupEnabled = platform?.signup?.creator_signup_enabled !== false;
  const signupLabel = creatorSignupEnabled ? "Start Your Store" : "Creator Signup Temporarily Closed";
  const signupTarget = creatorSignupEnabled ? "/register/creator" : "/contact";

  const launchBenefits = [
    { icon: Store, title: "Your own storefront", text: "Launch a dedicated store that reflects your creator identity, brand, club or community." },
    { icon: Shirt, title: "Your merchandise range", text: "Turn your artwork, logo, message or community identity into products your audience can order." },
    { icon: Users, title: "A shareable store link", text: "Use one link across social media, WhatsApp, websites, newsletters and community channels." },
    { icon: PackageCheck, title: "Customer ordering", text: "Give customers a structured checkout and order journey instead of managing messages and spreadsheets." },
    { icon: Truck, title: "Managed fulfilment", text: "FandomForge keeps the order and production workflow connected after a customer buys." },
  ];

  const gettingStarted = [
    { icon: Store, title: "A store name", text: "Use your creator name, brand, club, school, team, event or community identity." },
    { icon: Image, title: "A simple identity", text: "A logo, profile image or basic visual direction is enough to begin setting up your storefront." },
    { icon: Paintbrush, title: "An idea to sell", text: "Bring finished artwork, a design concept, a logo or custom text for your first product." },
    { icon: UserPlus, title: "Your contact details", text: "You need an email address and the basic information required to create your account." },
  ];

  const launchSteps = [
    { title: "Create your account", text: "Tell us who you are and what kind of creator, brand, organisation or community you represent." },
    { title: "Build your storefront", text: "Add your store name, identity, description and the public details you want customers to see." },
    { title: "Create your first product", text: "Choose a product, add artwork or text, select the variations you want to offer and set your selling price." },
    { title: "Publish and share", text: "Launch your product and share your storefront link with the audience you already have." },
  ];

  const platformHandles = [
    { icon: Layers3, title: "Product setup", text: "Approved products, variations and printable areas are organised inside the Creator Studio." },
    { icon: Calculator, title: "Live pricing", text: "Current product and production costs stay connected to the selling-price calculation." },
    { icon: PackageCheck, title: "Customer checkout", text: "Customers place structured orders through the storefront instead of sending manual requests." },
    { icon: FileCheck2, title: "Order records", text: "Product, variation, artwork and order details stay attached to the transaction." },
    { icon: Truck, title: "Production workflow", text: "Approved order information moves into production and fulfilment through the platform." },
    { icon: BadgeCheck, title: "Order visibility", text: "Customers and the operational team can follow the order through the available status and tracking flow." },
  ];

  const creatorControls = [
    { icon: Palette, title: "Your identity", text: "You choose your store name, description, images and the way your brand or community is presented." },
    { icon: Paintbrush, title: "Your artwork", text: "You decide which original artwork, logos, messages and text become part of your products." },
    { icon: Shirt, title: "Your product range", text: "You choose which available products and variations you want to offer your audience." },
    { icon: CircleDollarSign, title: "Your selling price", text: "You set the customer-facing price within the live pricing controls shown in the Creator Studio." },
    { icon: ShieldCheck, title: "Your store visibility", text: "Choose whether your storefront is public, unlisted or private before you launch." },
    { icon: Users, title: "Your promotion", text: "You decide where, when and how you share your store with your audience or community." },
  ];

  return (
    <PageShell
      eyebrow="Launch your creator store"
      title="Your merchandise store starts with one idea."
      intro="Create your account, build your storefront and publish your first product without buying stock or managing production yourself."
      primaryLabel={signupLabel}
      primaryTo={signupTarget}
      secondaryLabel="See Products and Pricing"
      secondaryTo="/products-and-pricing"
    >
      <Section eyebrow="What you can launch" title="A complete merchandise store built around your audience" intro="Start with one product or build a growing range. FandomForge gives you the storefront and operational structure needed to sell professionally.">
        <Cards items={launchBenefits} columns="sm:grid-cols-2 lg:grid-cols-3" />
      </Section>

      <Section eyebrow="What you need" title="You can start before everything is perfect" intro="You do not need a finished catalogue, bulk stock or production experience before joining.">
        <Cards items={gettingStarted} columns="sm:grid-cols-2 lg:grid-cols-4" />
        <div className="mt-6">
          <OperationalNote>Start with the identity and product idea you already have. You can refine your storefront and expand your merchandise range as you grow.</OperationalNote>
        </div>
      </Section>

      <Section eyebrow="Your launch journey" title="Four steps from signup to a shareable store" intro="The setup journey is designed to move you directly toward your first published product.">
        <NumberedSteps steps={launchSteps} />
      </Section>

      <Section eyebrow="Built into FandomForge" title="You build the brand. We handle the operational workflow." intro="The platform keeps the technical product, pricing, order and production information connected behind the scenes.">
        <Cards items={platformHandles} />
      </Section>

      <Section eyebrow="Creator control" title="Your store still belongs to your vision" intro="FandomForge supports the workflow without taking control of how you present, price and promote your merchandise.">
        <Cards items={creatorControls} />
      </Section>

      <section className="py-16 md:py-20 border-b border-[var(--ff-card-border)]">
        <div className="max-w-5xl mx-auto px-6 md:px-10 text-center">
          <p className="overline mb-3">Ready to launch?</p>
          <h2 className="font-display text-4xl md:text-6xl uppercase leading-none">Turn your community into a merchandise store.</h2>
          <p className="mt-5 mx-auto max-w-2xl text-[var(--ff-muted-text)]">Create your account and start building the first product your audience can call their own.</p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link to={signupTarget} className="btn-primary">{creatorSignupEnabled ? "Create Your Creator Account" : "Contact FandomForge"} <ArrowRight size={17} /></Link>
            <Link to="/how-it-works" className="btn-secondary">See How It Works</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

export function CommunityStoresPage() {
  const useCases = [
    ["Club merchandise", Users], ["School spirit wear", School], ["Fundraising", CircleDollarSign], ["Event merchandise", BadgeCheck],
    ["Team apparel", Shirt], ["Scout and youth groups", ShieldCheck], ["Gaming communities", Layers3], ["Racing teams and supporters", Truck],
    ["Associations and organisations", Store], ["Staff and volunteer clothing", Users],
  ];

  return (
    <PageShell eyebrow="For communities" title="Launch a central merchandise store for your club, school or organisation." intro="Give members and supporters one place to order approved branded products without relying on manual order lists, payment screenshots or bulk pre-orders." primaryLabel="Launch Your Community Store" primaryTo="/register/creator" secondaryLabel="How It Works" secondaryTo="/how-it-works">
      <Section eyebrow="Use cases" title="Merchandise for the communities people already belong to">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {useCases.map(([title, Icon]) => <article key={title} className="card"><Icon className="text-[var(--ff-primary)] mb-4"/><h3 className="font-display text-2xl uppercase leading-none">{title}</h3></article>)}
        </div>
      </Section>
      <Section eyebrow="Operational benefits" title="Reduce the administration around community merchandise">
        <Cards items={[
          { icon: Boxes, title: "No bulk pre-buy", text: "Products can be offered without the organisation purchasing a large size and colour mix in advance." },
          { icon: Store, title: "Central ordering", text: "Customers use one storefront instead of scattered forms, messages and spreadsheets." },
          { icon: BadgeCheck, title: "Consistent branding", text: "Approved products and artwork help keep community merchandise visually consistent." },
          { icon: CircleDollarSign, title: "Fundraising margin", text: "Where configured, the selling price can include an estimated creator or fundraising amount." },
          { icon: Truck, title: "Fulfilment support", text: "Order and production information is routed through the platform fulfilment workflow." },
          { icon: Users, title: "Direct customer ordering", text: "Members and supporters can place their own orders through the store link." },
        ]} />
      </Section>
    </PageShell>
  );
}

export function CreatorEarningsPage() {
  return (
    <PageShell eyebrow="Creator earnings" title="Understand the estimated creator amount before publishing a product." intro="The live Creator Studio calculation is the source of truth for current product costs, production costs, selling prices and estimated creator earnings." primaryLabel="Start Creating" primaryTo="/register/creator" secondaryLabel="Products and Pricing" secondaryTo="/products-and-pricing">
      <Section eyebrow="How it is shown" title="A transparent pricing sequence">
        <div className="grid md:grid-cols-4 gap-4">
          {[
            ["Selling price", "The customer-facing price selected for the product."],
            ["Product and production cost", "The calculated base product and artwork-production amount."],
            ["Applicable platform costs", "Any platform-controlled pricing components included by the live calculation."],
            ["Estimated creator earnings", "The creator amount displayed before the product is submitted or published."],
          ].map(([title, text], index) => <article key={title} className="card"><div className="font-display text-4xl text-[var(--ff-primary)] mb-3">{index + 1}</div><h3 className="font-display text-2xl uppercase mb-2">{title}</h3><p className="text-sm text-[var(--ff-muted-text)]">{text}</p></article>)}
        </div>
      </Section>
    </PageShell>
  );
}

export function ShippingReturnsPage() {
  const topics = [
    ["Production lead times", "Lead times depend on the selected product, artwork and production method. Confirmed timing must be communicated through the applicable product and order workflow."],
    ["Shipping options", "Available delivery methods and charges are presented through the current checkout configuration."],
    ["Tracking", "Tracking information is recorded when the selected courier or fulfilment method provides it."],
    ["Incorrect addresses", "Customers must provide complete delivery information. Address-correction and failed-delivery costs depend on the delivery provider."],
    ["Product defects", "Defect reports must be submitted through support with the order information and clear evidence of the issue."],
    ["Custom-product returns", "Made-to-order and customised products are handled under the published returns and refund policy."],
    ["Refunds and creator earnings", "Refund and cancellation effects must follow the current order, payment and creator-payout rules."],
    ["Support", "Use the public support contact details configured for this FandomForge instance."],
  ];

  return (
    <PageShell eyebrow="Shipping, production and returns" title="Clear expectations from checkout to delivery and support." intro="Only operationally confirmed promises are published. Product-specific production and delivery information remains tied to the live catalogue, checkout and order workflow." primaryLabel="View Shipping Policy" primaryTo="/shipping-policy" secondaryLabel="View Returns Policy" secondaryTo="/returns">
      <Section eyebrow="Customer information" title="What buyers and creators need to know">
        <div className="grid md:grid-cols-2 gap-4">
          {topics.map(([title, text]) => <article key={title} className="card"><h3 className="font-display text-2xl uppercase mb-2">{title}</h3><p className="text-sm text-[var(--ff-muted-text)]">{text}</p></article>)}
        </div>
      </Section>
      <Section eyebrow="Policies" title="Use the current published policy set" narrow>
        <div className="flex flex-wrap gap-3">
          <Link to="/shipping-policy" className="btn-secondary">Shipping Policy</Link>
          <Link to="/returns" className="btn-secondary">Returns Policy</Link>
          <Link to="/privacy" className="btn-secondary">Privacy Policy</Link>
          <Link to="/contact" className="btn-secondary">Contact Support</Link>
        </div>
      </Section>
    </PageShell>
  );
}

export function CreatorFaqPage() {
  const faqs = [
    ["Who can create a FandomForge store?", "Creators, designers, clubs, schools, bands, events, organisations, associations, small brands and community leaders can use the creator workflow where registration is enabled."],
    ["Do I need to buy stock before I start?", "The platform is designed around made-to-order product creation, so creators do not need to purchase a bulk size and colour mix before listing approved products."],
    ["Can I create products myself?", "Yes. The Creator Studio lets you choose products, select variations, upload artwork, add text, position the design, review pricing and save a draft."],
    ["Can I use custom text?", "Yes. Text layers can be created in the Builder and are stored as production artwork files when the product is saved."],
    ["Who owns the artwork?", "Creators must have the legal right to use all uploaded artwork, names, logos and other intellectual property and must accept the current creator and prohibited-content rules."],
    ["How is pricing calculated?", "The live Creator Studio combines the selected product and production information and shows the current pricing result before publication."],
    ["Can I choose my selling price?", "Creators can set a selling price subject to the platform pricing controls and minimum viable price checks."],
    ["How do I see estimated earnings?", "The pricing and review stages display the estimated creator amount calculated for the product."],
    ["When are creators paid?", "Creator payouts are processed weekly through Paystack into the creator's linked Paystack account."],
    ["How does production work?", "Approved order information includes the product, variation, artwork files, placement, manufacturing profile and costing snapshot required for fulfilment."],
    ["How is shipping charged?", "Available shipping methods and costs are presented through checkout based on the configured fulfilment options."],
    ["What happens if a product is defective?", "The customer should contact support with the order details and evidence so the issue can be assessed under the returns policy."],
    ["Can clubs and schools use the platform?", "Yes. The platform supports community stores, team apparel, school spirit wear, fundraising and event merchandise."],
    ["Does my account need approval?", "The answer depends on the live creator-signup configuration. The registration and onboarding flow will show the required next step."],
    ["Where do I get support?", "Use the contact details configured in the platform footer and contact page."],
  ];

  return (
    <PageShell eyebrow="Frequently asked questions" title="Answers to the questions that block creator signup and product launch." intro="These answers describe the current platform workflow without promising unconfirmed turnaround times, earnings or delivery coverage." primaryLabel="Create an Account" primaryTo="/register/creator" secondaryLabel="Contact Support" secondaryTo="/contact">
      <Section eyebrow="Creator FAQ" title="Registration, products, pricing, fulfilment and support" narrow>
        <div className="space-y-3">
          {faqs.map(([question, answer]) => (
            <details key={question} className="card">
              <summary className="font-display text-2xl uppercase cursor-pointer">{question}</summary>
              <p className="mt-3 text-sm text-[var(--ff-muted-text)]">{answer}</p>
            </details>
          ))}
        </div>
      </Section>
    </PageShell>
  );
}
