import React, { useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";
import { Mail, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

const SUPPORT_EMAIL = "info@theforgeza.co.za";
const WHATSAPP_DISPLAY = "071 211 6050";
const WHATSAPP_LINK = "https://wa.me/27712116050";

function Section({ title, children }) {
  return (
    <section className="card space-y-3">
      <h2 className="font-display text-3xl uppercase">{title}</h2>
      <div className="space-y-3 text-sm sm:text-base leading-relaxed text-[var(--ff-muted-text)]">
        {children}
      </div>
    </section>
  );
}

function BulletList({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-2">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function ContactForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    topic: "General enquiry",
    message: "",
  });
  const [sending, setSending] = useState(false);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();

    setSending(true);
    try {
      await http.post("/public/contact", form);
      toast.success("Message sent", {
        description: "Thanks — we received your enquiry and will respond as soon as possible.",
      });
      setForm({
        name: "",
        email: "",
        phone: "",
        topic: "General enquiry",
        message: "",
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not send your message");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4" data-testid="contact-form">
      <div>
        <p className="overline mb-2">Contact form</p>
        <h2 className="font-display text-3xl uppercase">Send us a message</h2>
        <p className="text-sm text-[var(--ff-muted-text)] mt-2">
          Send us your enquiry and we will respond during support hours. You can also contact us directly by email or WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Name</label>
          <input className="input-base" value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input-base" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Phone / WhatsApp</label>
          <input className="input-base" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div>
          <label className="label">Topic</label>
          <select className="input-base" value={form.topic} onChange={(e) => set("topic", e.target.value)}>
            <option>General enquiry</option>
            <option>Order support</option>
            <option>Creator support</option>
            <option>Delivery query</option>
            <option>Refund or return query</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Message</label>
        <textarea className="input-base" rows={6} value={form.message} onChange={(e) => set("message", e.target.value)} required />
      </div>

      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={sending}>
        <Send size={16} /> {sending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}

function ContactPage() {
  return (
    <>
      <PageHero
        overline="Contact Us"
        title="Need help?"
        subtitle="Send us your question and we’ll get back to you as soon as possible."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <ContactForm />

        <aside className="card h-fit space-y-5">
          <div>
            <div className="overline mb-2">Support</div>
            <p className="text-sm text-[var(--ff-muted-text)]">
              Our support hours are Monday to Friday, 9am to 4pm. We aim to respond within 24 hours.
            </p>
          </div>

          <div className="space-y-3 text-sm">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 hover:text-[var(--ff-primary)]">
              <Mail size={16} /> {SUPPORT_EMAIL}
            </a>
            <a href={WHATSAPP_LINK} className="flex items-center gap-2 hover:text-[var(--ff-primary)]">
              <MessageCircle size={16} /> WhatsApp {WHATSAPP_DISPLAY}
            </a>
          </div>

          <div className="border-t border-[var(--ff-card-border)] pt-4 text-sm text-[var(--ff-muted-text)]">
            <p>FandomForge (PTY) Ltd</p>
            <p>Reg: 2024/705706/07</p>
            <p>Durbanville, South Africa</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function DeliveryTermsPage() {
  return (
    <>
      <PageHero
        overline="Delivery Terms"
        title="How delivery works"
        subtitle="Production and delivery times can vary, but these are the standard FandomForge launch delivery terms."
      />

      <Section title="Production time">
        <p>
          FandomForge products are generally made to order. Standard production time is usually 2–3 business days after payment has been confirmed, unless a product page or order update says otherwise.
        </p>
      </Section>

      <Section title="Courier delivery">
        <p>
          Standard courier delivery after production is usually 4–5 days. Courier delivery is handled by third-party delivery companies and is subject to each courier company’s own terms and conditions.
        </p>
        <p>
          Once an order has been handed over to a courier, delivery timing and parcel movement are no longer fully under FandomForge’s control. Courier-related delivery queries may need to be followed up with the relevant courier company.
        </p>
      </Section>

      <Section title="Group Delivery">
        <p>
          Group Delivery is a free batched delivery option set by each creator. Orders are delivered to the creator’s selected collection address, and the address shown at checkout is the location where orders will be ready for collection as arranged by that creator or group.
        </p>
        <p>
          FandomForge does not control the creator’s collection arrangements, collection times, or internal group handover process. Customers must check the batch date and collection address shown at checkout before placing the order.
        </p>
      </Section>

      <Section title="Local pickup">
        <p>
          Local pickup may be available depending on the creator, group, or fulfilment setup. If local pickup is available, the available option and details will be shown during checkout.
        </p>
      </Section>

      <Section title="Incorrect delivery address">
        <p>
          Customers are responsible for entering the correct delivery details at checkout. If an incorrect address is entered and the parcel needs to be resent, a new delivery fee may apply.
        </p>
      </Section>

      <Section title="Returned or uncollected parcels">
        <p>
          Returned or uncollected parcels may need to be resent at an additional delivery fee. We will assist where possible, but additional courier or handling costs remain the customer’s responsibility.
        </p>
      </Section>

      <Section title="South Africa only">
        <p>
          FandomForge currently ships within South Africa only. We do not offer international shipping at this stage.
        </p>
      </Section>
    </>
  );
}

function ShopTermsPage() {
  return (
    <>
      <PageHero
        overline="Shop Terms"
        title="Shopping on FandomForge"
        subtitle="These terms explain how made-to-order merch, cancellations, returns and disputes work."
      />

      <Section title="Made-to-order products">
        <p>
          FandomForge products are made to order. This means production starts after an order and payment have been received, and stock may not be held in advance.
        </p>
      </Section>

      <Section title="Cancellations">
        <p>
          Customers may request cancellation before an order enters production. Once production has started, the order can no longer be cancelled.
        </p>
        <p>
          Order updates and tracking details are sent by email where available. Customers should contact us as soon as possible if they need to request a cancellation.
        </p>
      </Section>

      <Section title="Returns and refunds">
        <BulletList items={[
          "If the wrong size was ordered by the customer, a return may be accepted if the item is returned within 7 days.",
          "Damaged, faulty, or incorrect items may be returned within 7 days and, where approved, a replacement item will be sent.",
          "Returned items must be unused, unworn, and in a condition suitable for assessment.",
          "No exchanges are offered on undamaged goods unless FandomForge approves the return."
        ]} />
      </Section>

      <Section title="Mockups and colours">
        <p>
          Product images and mockups are provided as close visual guides. Colours, placement and print appearance may vary slightly due to screen settings, garment batches, production methods and supplier availability.
        </p>
      </Section>

      <Section title="Disputes">
        <p>
          FandomForge handles order disputes, returns and refund queries for purchases placed through the FandomForge platform. Creators may assist with product or collection information, but customer order disputes should be directed to FandomForge support.
        </p>
      </Section>
    </>
  );
}

function PrivacyPolicyPage() {
  return (
    <>
      <PageHero
        overline="Privacy Policy"
        title="Your information"
        subtitle="This policy explains what information FandomForge collects and how it is used to process orders and support platform accounts."
      />

      <Section title="Who we are">
        <p>
          FandomForge is operated by FandomForge (PTY) Ltd, registration number 2024/705706/07, based in Durbanville, South Africa.
        </p>
      </Section>

      <Section title="Information we collect">
        <p>
          We may collect names, email addresses, phone numbers, delivery addresses, account details, order details, payment references and support messages when customers, creators or platform users interact with FandomForge.
        </p>
      </Section>

      <Section title="How we use information">
        <BulletList items={[
          "To create and manage customer and creator accounts.",
          "To process orders and payments.",
          "To produce, pack, deliver and support orders.",
          "To send order updates by email or WhatsApp.",
          "To respond to support requests.",
          "To improve platform performance, security and customer experience."
        ]} />
      </Section>

      <Section title="Payments">
        <p>
          Payments may be processed through third-party payment providers including PayFast, Paystack, Payflex, ZeroPay and PayJustNow where those options are enabled. FandomForge does not store full card details on the website.
        </p>
      </Section>

      <Section title="Sharing information">
        <p>
          We may share the order information required to fulfil an order with creators, printers, couriers, delivery partners and payment providers. We only share information needed to process payments, produce orders, deliver orders, or provide customer support.
        </p>
      </Section>

      <Section title="Analytics and infrastructure">
        <p>
          FandomForge may use tools such as Google Analytics and Cloudflare to understand site performance, improve security, measure traffic and keep the platform running reliably.
        </p>
      </Section>

      <Section title="Contact about privacy">
        <p>
          For privacy questions or account information requests, contact us at <a className="text-[var(--ff-primary)]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </Section>
    </>
  );
}

function PageHero({ overline, title, subtitle }) {
  return (
    <header className="mb-8">
      <p className="overline mb-2">{overline}</p>
      <h1 className="font-display text-4xl sm:text-6xl uppercase leading-none">{title}</h1>
      {subtitle && <p className="text-[var(--ff-muted-text)] mt-4 max-w-3xl">{subtitle}</p>}
    </header>
  );
}

export default function StaticContentPage({ pageKey }) {
  const page = useMemo(() => {
    if (pageKey === "contact") return <ContactPage />;
    if (pageKey === "delivery-terms") return <DeliveryTermsPage />;
    if (pageKey === "shop-terms") return <ShopTermsPage />;
    if (pageKey === "privacy-policy") return <PrivacyPolicyPage />;
    return <ContactPage />;
  }, [pageKey]);

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-16 max-w-5xl mx-auto px-4 sm:px-6 md:px-10 space-y-6">
        {page}
      </main>
    </div>
  );
}
