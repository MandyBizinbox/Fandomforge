import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Eraser, Search, ShieldCheck } from "lucide-react";
import { http } from "../lib/api";

const formatStatus = (value) => String(value || "").replaceAll("_", " ");
const money = (value) => `R ${Number(value || 0).toFixed(2)}`;

function SignaturePad({ onSigned, resetKey }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPoint = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    onSigned(false);
  }, [resetKey, onSigned]);

  const point = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvasRef.current.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvasRef.current.height,
    };
  };
  const start = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    const current = point(event);
    lastPoint.current = current;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(current.x, current.y, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = "#111827";
    ctx.fill();
    onSigned(true);
  };
  const move = (event) => {
    if (!drawing.current) return;
    event.preventDefault();
    const current = point(event);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    lastPoint.current = current;
  };
  const finish = (event) => {
    if (drawing.current) event.preventDefault();
    drawing.current = false;
    lastPoint.current = null;
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    onSigned(false);
  };
  return <div>
    <div className="flex items-center justify-between gap-3 mb-2">
      <label className="font-semibold text-sm" htmlFor="collection-signature">Customer signature</label>
      <button type="button" className="ff-admin-button text-sm" onClick={clear}><Eraser size={15} /> Clear</button>
    </div>
    <canvas id="collection-signature" ref={canvasRef} width={900} height={300}
      aria-label="Draw your signature with a finger, pen or mouse"
      onPointerDown={start} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={finish} onLostPointerCapture={finish}
      className="block w-full bg-white rounded border-2 border-neutral-400"
      style={{ height: 185, touchAction: "none", cursor: "crosshair" }} />
    <div className="text-xs ff-admin-muted mt-2">Sign inside the box using a finger or stylus.</div>
  </div>;
}

export default function MobileOrderCollection() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [order, setOrder] = useState(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signaturePresent, setSignaturePresent] = useState(false);
  const [handoverConfirmed, setHandoverConfirmed] = useState(false);
  const [success, setSuccess] = useState(null);
  const [padKey, setPadKey] = useState(0);
  // Stable callback avoids erasing an in-progress signature on re-render.
  const onSigned = useCallback((present) => setSignaturePresent(present), []);

  const search = async (event) => {
    event?.preventDefault?.();
    if (query.trim().length < 3 || searching) return;
    setSearching(true);
    setResults([]);
    setOrder(null);
    setSuccess(null);
    setError("");
    try {
      const response = await http.post("/admin/collection/lookup", { query: query.trim() });
      setResults(response.data?.orders || []);
      if ((response.data?.orders || []).length === 0) setError("No orders found for that email or order number.");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not find orders.");
    } finally {
      setSearching(false);
    }
  };

  const openOrder = async (candidate) => {
    setError("");
    setSuccess(null);
    setOrder(null);
    try {
      const response = await http.get(`/admin/collection/orders/${encodeURIComponent(candidate.id)}`);
      setOrder(response.data);
      setSignerName(response.data.customer_name || "");
      setSignaturePresent(false);
      setHandoverConfirmed(false);
      setPadKey((value) => value + 1);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not open order.");
    }
  };

  const complete = async () => {
    if (!order?.can_collect || !signaturePresent || !handoverConfirmed || signerName.trim().length < 2 || submitting) return;
    const canvas = document.getElementById("collection-signature");
    if (!canvas) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await http.post(
        `/admin/collection/orders/${encodeURIComponent(order.id)}/complete`,
        {
          signer_name: signerName.trim(),
          signature_data_url: canvas.toDataURL("image/png"),
          handover_confirmed: true,
        },
      );
      setSuccess({ orderNumber: order.order_number, signedAt: response.data.signed_at });
      setOrder(null);
      setResults([]);
      setQuery("");
      setSignaturePresent(false);
      setHandoverConfirmed(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Collection could not be completed. Order was not changed.");
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="min-h-screen bg-[var(--ff-page-bg,#101010)] text-[var(--ff-card-text,#f9fafb)]">
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10" data-testid="mobile-order-collection">
      <div className="flex items-center justify-between gap-3 mb-8">
        <div><div className="overline">FandomForge / Fulfilment</div>
          <h1 className="font-display text-3xl sm:text-5xl uppercase">Order Collection</h1></div>
        <Link to="/admin/fulfilment/orders" className="ff-admin-button text-sm"><ArrowLeft size={16} /> Orders</Link>
      </div>

      {success && <div role="status" className="bg-green-900/30 border-2 border-green-600 p-6 mb-6 rounded">
        <CheckCircle2 size={36} className="text-green-400 mb-3" />
        <h2 className="text-2xl font-bold">Collection completed</h2>
        <p>Order <strong>{success.orderNumber}</strong> is completed. The customer signature has been saved.</p>
        <button type="button" onClick={() => setSuccess(null)} className="ff-admin-button ff-admin-button--primary mt-5 w-full justify-center min-h-12">Next collection</button>
      </div>}

      {!order && !success && <form onSubmit={search} className="ff-admin-card p-5 sm:p-7 mb-6 space-y-4">
        <label htmlFor="collection-lookup" className="block font-semibold text-lg">Customer email or order number</label>
        <input id="collection-lookup" type="text" inputMode="email" autoComplete="off"
          className="ff-admin-control w-full text-lg min-h-14"
          placeholder="example@email.com or MF-12345678"
          value={query} onChange={event => setQuery(event.target.value)} />
        <button type="submit" disabled={searching || query.trim().length < 3}
          className="ff-admin-button ff-admin-button--primary min-h-14 w-full justify-center text-lg">
          <Search size={20} /> {searching ? "Searching…" : "Find order"}
        </button>
      </form>}

      {error && <div role="alert" className="border border-red-600 bg-red-950/30 p-4 mb-5 text-sm">{error}</div>}

      {!order && !success && results.length > 0 && <div className="space-y-3">
        <h2 className="text-lg font-bold">Matching orders ({results.length})</h2>
        {results.map(result => <button type="button" key={result.id} onClick={() => openOrder(result)}
          className="ff-admin-card p-4 w-full text-left flex items-center justify-between gap-4 min-h-20">
          <div><strong className="text-lg">{result.order_number}</strong>
            <div className="text-sm">{result.customer_name || result.buyer_email}</div>
            <div className="text-xs ff-admin-muted">{formatStatus(result.status)} · {result.payment_status}</div>
          </div>
          <span className="text-sm font-semibold">{result.can_collect ? "Open" : "View"}</span>
        </button>)}
      </div>}

      {order && <div className="space-y-5">
        <button type="button" className="ff-admin-button" onClick={() => { setOrder(null); setError(""); }}>
          <ArrowLeft size={15} /> Back to results
        </button>
        <section className="ff-admin-card p-5 sm:p-7">
          <div className="flex flex-wrap justify-between gap-3">
            <div><div className="text-xs uppercase ff-admin-muted">Order</div>
              <div className="font-display text-3xl">{order.order_number}</div>
              <div className="text-sm mt-2">{order.customer_name || "Customer"}</div>
              <div className="text-sm">{order.buyer_email}</div>
              {order.customer_phone && <div className="text-sm">{order.customer_phone}</div>}
            </div>
            <div className="text-right"><div className="font-bold text-xl">{money(order.total)}</div>
              <div className="text-sm">Payment: {formatStatus(order.payment_status)}</div>
              <div className="text-sm">Status: {formatStatus(order.status)}</div>
            </div>
          </div>
          <h2 className="mt-6 mb-2 font-bold text-lg">Items to hand over</h2>
          <div className="divide-y divide-[var(--ff-card-border,#444)]">
            {(order.items || []).map((item, index) => <div key={item.id || index} className="py-3 flex justify-between gap-4">
              <div><strong>{item.product_title}</strong><div className="text-sm ff-admin-muted">{[item.size, item.color].filter(Boolean).join(" / ")}</div></div>
              <div className="font-semibold whitespace-nowrap">× {item.quantity}</div>
            </div>)}
          </div>
        </section>

        {!order.can_collect ? <div role="status" className="ff-admin-card p-5 border-l-4 border-amber-500">
          <strong>Collection unavailable</strong>
          <p className="mt-2 text-sm">The order must be paid and marked <strong>Ready for dispatch</strong> before it can be signed out. Completed, cancelled and previously collected orders cannot be collected again.</p>
        </div> : <section className="ff-admin-card p-5 sm:p-7 space-y-5">
          <div className="flex items-center gap-2"><ShieldCheck size={19} /><h2 className="text-xl font-bold">Customer handover</h2></div>
          <label className="block text-sm font-semibold" htmlFor="collection-signer-name">Name of person collecting</label>
          <input id="collection-signer-name" type="text" autoComplete="name" className="ff-admin-control w-full min-h-12 text-lg"
            value={signerName} maxLength={120} onChange={event => setSignerName(event.target.value)} />
          <SignaturePad onSigned={onSigned} resetKey={padKey} />
          <label className="flex gap-3 items-start text-sm cursor-pointer">
            <input type="checkbox" className="w-6 h-6 mt-0.5 shrink-0" checked={handoverConfirmed}
              onChange={event => setHandoverConfirmed(event.target.checked)} />
            <span>I confirm that every item shown above has been handed to the person signing.</span>
          </label>
          <button type="button" disabled={submitting || !signaturePresent || !handoverConfirmed || signerName.trim().length < 2}
            onClick={complete} className="ff-admin-button ff-admin-button--primary min-h-16 w-full justify-center text-lg">
            <CheckCircle2 size={21} /> {submitting ? "Completing…" : "Complete Collection"}
          </button>
          <p className="text-xs ff-admin-muted text-center">Completing saves the signature, staff identity and time, and marks the order completed.</p>
        </section>}
      </div>}
    </div>
  </div>;
}
