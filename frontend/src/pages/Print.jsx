import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { ClipboardList, FileImage, Printer, Truck, ArrowRight } from "lucide-react";

export default function Print() {
  return (
    <div className="min-h-screen page-shell">
      <Navbar />

      <section className="pt-32 pb-20 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="overline mb-4">For print partners</p>
            <h1 className="font-display text-6xl md:text-8xl uppercase leading-[0.9] mb-6">
              Get Paid To Fulfil Orders
            </h1>
            <p className="text-[var(--ff-muted-text)] text-lg max-w-xl mb-8">
              Join the FandomForge fulfilment network and receive ready-to-produce orders with artwork attached.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/register/printer" className="btn-primary">
                Apply As Printer <ArrowRight size={18} />
              </Link>
              <Link to="/shop" className="btn-secondary">
                View Marketplace
              </Link>
            </div>
          </div>

          <div className="border border-[var(--ff-card-border)] bg-white/[0.03] p-8">
            <p className="overline mb-4">Printer workflow</p>
            <div className="space-y-5">
              <Step icon={<ClipboardList />} title="Receive jobs" text="Accepted jobs appear in your printer dashboard." />
              <Step icon={<FileImage />} title="Download artwork" text="Each order includes the required print artwork and order details." />
              <Step icon={<Printer />} title="Produce the item" text="Print according to the product, size, colour and production notes." />
              <Step icon={<Truck />} title="Dispatch and update" text="Mark production status and add tracking where required." />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <p className="overline mb-2">Why join</p>
          <h2 className="font-display text-4xl md:text-5xl uppercase mb-8">More Production Work, Less Admin</h2>

          <div className="grid md:grid-cols-3 gap-6">
            <Feature title="Ready-to-print jobs" text="Orders arrive with product details, artwork and customer order information." />
            <Feature title="No marketplace setup" text="You focus on fulfilment while creators and fans use the platform." />
            <Feature title="Production dashboard" text="Track active jobs, production status and completed orders." />
            <Feature title="Payout tracking" text="See what is due and what has been paid." />
            <Feature title="Quality standards" text="Work within a controlled fulfilment network." />
            <Feature title="Scalable order flow" text="Handle more work as the marketplace grows." />
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[var(--ff-card-border)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <p className="overline mb-2">Best fit</p>
          <h2 className="font-display text-4xl md:text-5xl uppercase mb-8">Who Should Apply?</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <Requirement title="DTF, vinyl, screen print or embroidery capability" />
            <Requirement title="Reliable turnaround times" />
            <Requirement title="Consistent product quality" />
            <Requirement title="Ability to package and dispatch orders" />
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6 md:px-10 text-center">
          <p className="overline mb-2">Join the network</p>
          <h2 className="font-display text-5xl uppercase mb-6">Apply As A Printer</h2>
          <p className="text-[var(--ff-muted-text)] mb-8">
            Submit your details and production capabilities so we can route suitable jobs to you.
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
      <h3 className="font-display text-2xl uppercase mb-2">{title}</h3>
      <p className="text-[var(--ff-muted-text)] text-sm">{text}</p>
    </div>
  );
}

function Requirement({ title }) {
  return (
    <div className="border border-[var(--ff-card-border)] bg-white/[0.03] p-6">
      <p className="font-display text-2xl uppercase">{title}</p>
    </div>
  );
}