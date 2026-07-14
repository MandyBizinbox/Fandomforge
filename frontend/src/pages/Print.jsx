import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { ArrowRight, ClipboardList, FileImage, Printer, ShieldCheck, Truck } from "lucide-react";
import { usePlatformConfig } from "../lib/platform";

export default function Print() {
  const { platform } = usePlatformConfig();
  const platformName = platform.platform_name || "Fandom Forge";

  useEffect(() => {
    const selector = 'meta[name="robots"][data-print-page="true"]';
    document.querySelector(selector)?.remove();

    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    meta.setAttribute("data-print-page", "true");
    document.head.appendChild(meta);

    return () => document.querySelector(selector)?.remove();
  }, []);

  return (
    <div className="min-h-screen page-shell">
      <Navbar />

      <section className="pt-32 pb-20 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="overline mb-4">For production partners</p>
            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl uppercase leading-[0.9] mb-6">
              Help fulfil made-to-order community merchandise.
            </h1>
            <p className="text-[var(--ff-muted-text)] text-lg max-w-xl mb-8">
              {platformName} works with approved South African production partners to print, package and dispatch orders created through creator stores.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/register/printer" className="btn-primary">
                Apply As Printer <ArrowRight size={18} />
              </Link>
              <Link to="/contact" className="btn-secondary">Contact Us</Link>
            </div>
          </div>

          <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-8">
            <p className="overline mb-4">Fulfilment workflow</p>
            <div className="space-y-5">
              <Step icon={<ClipboardList />} title="Receive approved jobs" text="Production work is routed through the platform once orders are ready for fulfilment." />
              <Step icon={<FileImage />} title="Use supplied artwork" text="Order details include the product, variation, production notes and stored artwork files, including generated text artwork." />
              <Step icon={<Printer />} title="Produce consistently" text="Partners work to controlled product and quality standards." />
              <Step icon={<Truck />} title="Update fulfilment" text="Production and dispatch updates keep creators and customers informed." />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <p className="overline mb-2">Partner fit</p>
          <h2 className="font-display text-4xl md:text-5xl uppercase mb-8">Built for reliable local production</h2>

          <div className="grid md:grid-cols-3 gap-6">
            <Feature title="Controlled jobs" text="Orders arrive through a fulfilment workflow instead of public product browsing." />
            <Feature title="Production clarity" text="Printer tasks focus on approved products, artwork, variations and dispatch details." />
            <Feature title="South African fulfilment" text={`${platformName} is designed around local production and delivery expectations.`} />
            <Feature title="Dashboard workflow" text="Approved partners can manage production statuses and completed work from their dashboard." />
            <Feature title="Quality standards" text="Consistent production keeps creator stores trustworthy for their own communities." />
            <Feature title="No public catalogue role" text="Printer participation supports fulfilment; it is not a public marketplace listing." />
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6 md:px-10 text-center">
          <p className="overline mb-2">Join the network</p>
          <h2 className="font-display text-5xl uppercase mb-6">Apply As A Printer</h2>
          <p className="text-[var(--ff-muted-text)] mb-8">
            Submit your details and production capabilities so {platformName} can assess whether your service is a fit for the fulfilment network.
          </p>
          <Link to="/register/printer" className="btn-primary">
            Apply Now <ArrowRight size={18} />
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
      <ShieldCheck className="text-[var(--ff-primary)] mb-4" />
      <h3 className="font-display text-2xl uppercase mb-2">{title}</h3>
      <p className="text-[var(--ff-muted-text)] text-sm">{text}</p>
    </div>
  );
}
