import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import StatusBadge from "../StatusBadge";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function optionLabel(option) {
  if (!option) return "Unknown option";
  return [option.print_method, option.print_size].filter(Boolean).join(" · ") || option.id;
}

function optionOutputLabel(option) {
  if (!option) return "No print option selected";
  const parts = [];

  if (option.standard_print_size_key) parts.push(option.standard_print_size_key);
  if (option.width_mm && option.height_mm) parts.push(`${option.width_mm}×${option.height_mm}mm`);
  if (option.dpi) parts.push(`${option.dpi}DPI`);
  if (option.fit_mode) parts.push(`${option.fit_mode} fit`);

  return parts.length ? parts.join(" · ") : "No production metadata set";
}

function areaLabel(area) {
  if (!area) return "Any print area";
  return [area.name, area.print_size].filter(Boolean).join(" · ") || area.id;
}

function areaOutputLabel(area) {
  if (!area) return "Applies to any allowed area on this template";
  const parts = [];

  if (area.area_key) parts.push(area.area_key);
  if (area.standard_print_size_key) parts.push(area.standard_print_size_key);
  if (area.width_mm && area.height_mm) parts.push(`${area.width_mm}×${area.height_mm}mm`);
  if (area.dpi) parts.push(`${area.dpi}DPI`);
  if (area.fit_mode) parts.push(`${area.fit_mode} fit`);

  return parts.length ? parts.join(" · ") : area.print_size || "No area production metadata";
}

function rowKey(areaId, optionId) {
  return `${areaId || ""}::${optionId || ""}`;
}

function templateBlankCost(template) {
  return Number(template?.base_blank_cost || template?.base_price || 0);
}

function blankPayout(template) {
  return Math.round(templateBlankCost(template) * 1.10 * 100) / 100;
}

const defaultGridRow = {
  enabled: true,
  print_price: "",
  production_notes: "",
  status: "active",
};

export default function PrinterPricingManager({ mode = "printer" }) {
  const isAdmin = mode === "admin";

  const [templates, setTemplates] = useState([]);
  const [printOptions, setPrintOptions] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [prices, setPrices] = useState([]);

  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [gridRows, setGridRows] = useState({});
  const [bulkPrice, setBulkPrice] = useState("");
  const [savingGrid, setSavingGrid] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);
  const selectedPrinter = printers.find((item) => item.id === selectedPrinterId);

  const templateAreas = asArray(selectedTemplate?.print_areas);
  const payoutBlank = blankPayout(selectedTemplate);
  const supplierBlank = templateBlankCost(selectedTemplate);

  const workspacePrices = useMemo(() => {
    return prices.filter((row) => {
      if (isAdmin && selectedPrinterId && row.printer_id !== selectedPrinterId) return false;
      if (selectedTemplateId && row.product_template_id !== selectedTemplateId) return false;
      return true;
    });
  }, [prices, isAdmin, selectedPrinterId, selectedTemplateId]);

  const activePrices = workspacePrices.filter((row) => (row.status || "active") === "active");

  const pricingMatrix = useMemo(() => {
    if (!selectedTemplate) return [];

    const rows = [];

    for (const area of templateAreas) {
      const allowedIds = asArray(area.allowed_print_option_ids);
      const allowedOptions = allowedIds.length
        ? printOptions.filter((option) => allowedIds.includes(option.id))
        : [];

      for (const option of allowedOptions) {
        const existing = workspacePrices.find((price) => (
          price.print_area_id === area.id &&
          price.print_option_id === option.id
        ));

        rows.push({
          key: rowKey(area.id, option.id),
          area,
          option,
          existing,
        });
      }
    }

    return rows;
  }, [selectedTemplate, templateAreas, printOptions, workspacePrices]);

  useEffect(() => {
    loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const next = {};

    for (const item of pricingMatrix) {
      next[item.key] = {
        ...defaultGridRow,
        enabled: Boolean(item.existing),
        print_price: item.existing ? Number(item.existing.print_price || 0) : "",
        production_notes: item.existing?.production_notes || "",
        status: item.existing?.status || "active",
      };
    }

    setGridRows(next);
  }, [pricingMatrix.length, selectedPrinterId, selectedTemplateId]);

  async function loadBaseData() {
    setLoading(true);
    try {
      const requests = [
        http.get(isAdmin ? "/admin/product-templates" : "/product-templates"),
        http.get("/print-options"),
      ];

      if (isAdmin) {
        requests.push(http.get("/admin/printers"));
      }

      const [templateRes, optionRes, printerRes] = await Promise.all(requests);

      const nextTemplates = asArray(templateRes.data);
      const nextOptions = asArray(optionRes.data);
      const nextPrinters = asArray(printerRes?.data);

      setTemplates(nextTemplates);
      setPrintOptions(nextOptions);
      setPrinters(nextPrinters);

      if (isAdmin && nextPrinters.length === 1) {
        setSelectedPrinterId(nextPrinters[0].id);
      }

      if (nextTemplates.length === 1) {
        setSelectedTemplateId(nextTemplates[0].id);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load pricing setup data");
    } finally {
      setLoading(false);
    }
  }

  async function loadPrices() {
    try {
      const endpoint = isAdmin ? "/admin/printer-prices" : "/printer-dash/template-prices";
      const response = await http.get(endpoint);
      setPrices(asArray(response.data));
    } catch (error) {
      setPrices([]);
      toast.error(error.response?.data?.detail || "Could not load printer pricing");
    }
  }

  function updateGridRow(key, patch) {
    setGridRows((current) => ({
      ...current,
      [key]: {
        ...(current[key] || defaultGridRow),
        ...patch,
      },
    }));
  }

  function applyBulkPriceToEnabled() {
    if (bulkPrice === "" || Number.isNaN(Number(bulkPrice))) {
      toast.error("Enter a valid print price first");
      return;
    }

    setGridRows((current) => {
      const next = { ...current };

      for (const key of Object.keys(next)) {
        if (next[key].enabled) {
          next[key] = { ...next[key], print_price: Number(bulkPrice) };
        }
      }

      return next;
    });
  }

  function applyMaxPriceToAll() {
    const next = {};

    for (const item of pricingMatrix) {
      next[item.key] = {
        ...(gridRows[item.key] || defaultGridRow),
        enabled: true,
        print_price: Number(item.option.print_cost_max || 0),
      };
    }

    setGridRows(next);
  }

  function enableAllRows() {
    setGridRows((current) => {
      const next = { ...current };

      for (const item of pricingMatrix) {
        next[item.key] = {
          ...(next[item.key] || defaultGridRow),
          enabled: true,
        };
      }

      return next;
    });
  }

  function disableUnpricedRows() {
    setGridRows((current) => {
      const next = { ...current };

      for (const item of pricingMatrix) {
        const row = next[item.key] || defaultGridRow;
        if (row.print_price === "" || Number(row.print_price || 0) <= 0) {
          next[item.key] = {
            ...row,
            enabled: false,
          };
        }
      }

      return next;
    });
  }

  async function saveGrid() {
    if (isAdmin && !selectedPrinterId) {
      toast.error("Select a printer first");
      return;
    }

    if (!selectedTemplateId) {
      toast.error("Select a product template first");
      return;
    }

    const enabledRows = pricingMatrix
      .map((item) => ({
        ...item,
        draft: gridRows[item.key] || defaultGridRow,
      }))
      .filter((item) => item.draft.enabled);

    if (!enabledRows.length) {
      toast.error("Enable at least one pricing row");
      return;
    }

    const invalid = enabledRows.find((item) => {
      const printPrice = Number(item.draft.print_price || 0);
      const max = Number(item.option.print_cost_max || 0);
      return printPrice < 0 || (max > 0 && printPrice > max);
    });

    if (invalid) {
      toast.error(`${optionLabel(invalid.option)} exceeds platform print cost`);
      return;
    }

    setSavingGrid(true);

    try {
      for (const item of enabledRows) {
        const payload = {
          product_template_id: selectedTemplateId,
          print_area_id: item.area.id,
          print_option_id: item.option.id,
          blank_price: payoutBlank,
          print_price: Number(item.draft.print_price || 0),
          production_notes: item.draft.production_notes || "",
          status: item.draft.status || "active",
        };

        if (item.existing) {
          if (isAdmin) {
            await http.patch(`/admin/printer-prices/${item.existing.id}?printer_id=${encodeURIComponent(selectedPrinterId)}`, payload);
          } else {
            await http.patch(`/printer-dash/template-prices/${item.existing.id}`, payload);
          }
        } else {
          if (isAdmin) {
            await http.post(`/admin/printer-prices?printer_id=${encodeURIComponent(selectedPrinterId)}`, payload);
          } else {
            await http.post("/printer-dash/template-prices", payload);
          }
        }
      }

      toast.success("Capabilities grid saved");
      await loadPrices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save pricing grid");
    } finally {
      setSavingGrid(false);
    }
  }

  async function deletePrice(row) {
    if (!window.confirm("Delete this printer price?")) return;

    try {
      if (isAdmin) {
        await http.delete(`/admin/printer-prices/${row.id}`);
      } else {
        await http.delete(`/printer-dash/template-prices/${row.id}`);
      }

      toast.success("Capabilities deleted");
      await loadPrices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not delete pricing");
    }
  }

  function printerName(id) {
    return printers.find((item) => item.id === id)?.company_name || id || "—";
  }

  if (loading) {
    return <div className="card text-zinc-400">Loading pricing...</div>;
  }

  return (
    <div data-testid={`${mode}-printer-pricing`} className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="overline mb-2">Printer production coverage</div>
          <h1 className="font-display text-5xl uppercase">Printer Capability / Legacy Capabilities Grid</h1>
          <p className="text-zinc-400 mt-3 max-w-4xl">
            Temporary legacy grid. Capabilities is now controlled by platform Print Options; this will become the capability matrix.
          </p>
        </div>

        <button type="button" onClick={saveGrid} disabled={savingGrid || (isAdmin && !selectedPrinterId) || !selectedTemplateId} className="btn-primary">
          <Save size={14} /> {savingGrid ? "Saving…" : "Save Grid"}
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <SummaryCard label="Templates" value={templates.length} />
        <SummaryCard label="Print options" value={printOptions.length} />
        <SummaryCard label="Printers" value={isAdmin ? printers.length : "—"} />
        <SummaryCard label="Active visible prices" value={activePrices.length} />
      </div>

      <div className="card grid lg:grid-cols-2 gap-4">
        {isAdmin && (
          <div>
            <label className="label">1. Printer</label>
            <select
              className="input-base"
              value={selectedPrinterId}
              onChange={(event) => {
                setSelectedPrinterId(event.target.value);
              }}
            >
              <option value="">Select printer</option>
              {printers.map((printer) => (
                <option key={printer.id} value={printer.id}>{printer.company_name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">{isAdmin ? "2." : "1."} Product template</label>
          <select
            className="input-base"
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
          >
            <option value="">Select template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </div>

        {selectedTemplate && (
          <div className="lg:col-span-2 grid md:grid-cols-4 gap-3 text-sm">
            <InfoCard label="Template" title={selectedTemplate.name} value={`${selectedTemplate.brand || "No brand"} · ${selectedTemplate.category || "No category"}`} />
            <InfoCard label="Blank payout" title={money(payoutBlank)} value={`Supplier cost ${money(supplierBlank)} + 10%`} />
            <InfoCard label="Print areas" title={templateAreas.length} value="Configured production placements" />
            <InfoCard label="Grid rows" title={pricingMatrix.length} value="Allowed combinations" />
          </div>
        )}

        {isAdmin && selectedPrinter && (
          <div className="lg:col-span-2 border border-white/10 bg-black/20 rounded-xl p-4 text-sm text-zinc-400">
            Capabilities on behalf of: <span className="font-bold text-white">{selectedPrinter.company_name}</span>
          </div>
        )}
      </div>

      {selectedTemplate && (
        <div className="space-y-6">
          <div className="card grid lg:grid-cols-[1fr_220px_220px_180px] gap-4 items-end">
            <div>
              <div className="overline mb-2">Fast input tools</div>
              <p className="text-sm text-zinc-500">
                Enable rows, apply one price across enabled rows, or fill every row with its platform max price.
              </p>
            </div>

            <div>
              <label className="label">Bulk print price</label>
              <input
                className="input-base"
                type="number"
                step="0.01"
                min="0"
                value={bulkPrice}
                onChange={(event) => setBulkPrice(event.target.value)}
                placeholder="Example: 45"
              />
            </div>

            <button type="button" className="btn-secondary justify-center" onClick={applyBulkPriceToEnabled}>
              Apply to enabled
            </button>

            <button type="button" className="btn-secondary justify-center" onClick={applyMaxPriceToAll}>
              Apply max to all
            </button>

            <div className="lg:col-span-4 flex flex-wrap gap-2">
              <button type="button" className="border border-white/15 px-3 py-2 text-xs uppercase tracking-widest text-zinc-300 hover:text-white" onClick={enableAllRows}>
                Enable all rows
              </button>
              <button type="button" className="border border-white/15 px-3 py-2 text-xs uppercase tracking-widest text-zinc-300 hover:text-white" onClick={disableUnpricedRows}>
                Disable unpriced rows
              </button>
            </div>
          </div>

          <div className="border border-white/15 overflow-x-auto">
            <table className="table-brutal min-w-[1320px]">
              <thead>
                <tr>
                  <th>Use</th>
                  <th>Print area</th>
                  <th>Print option</th>
                  <th>Output</th>
                  <th>Blank payout</th>
                  <th>Platform print cost</th>
                  <th>Print price</th>
                  <th>Total payout</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Existing</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {pricingMatrix.map((item) => {
                  const row = gridRows[item.key] || defaultGridRow;
                  const printPrice = Number(row.print_price || 0);
                  const max = Number(item.option.print_cost_max || 0);
                  const exceedsMax = max > 0 && printPrice > max;
                  const total = payoutBlank + printPrice;

                  return (
                    <tr key={item.key} className={row.enabled ? "" : "opacity-50"}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(row.enabled)}
                          onChange={(event) => updateGridRow(item.key, { enabled: event.target.checked })}
                        />
                      </td>
                      <td>
                        <div className="font-bold">{areaLabel(item.area)}</div>
                        <div className="text-xs text-zinc-500">{areaOutputLabel(item.area)}</div>
                      </td>
                      <td>
                        <div className="font-bold">{optionLabel(item.option)}</div>
                        <div className="text-xs text-zinc-500">{item.option.method_key || "no method key"}</div>
                      </td>
                      <td className="text-xs text-zinc-500">{optionOutputLabel(item.option)}</td>
                      <td className="font-bold">{money(payoutBlank)}</td>
                      <td>{money(max)}</td>
                      <td>
                        <input
                          className={`input-base min-w-[110px] ${exceedsMax ? "border-[#FF3B30]" : ""}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.print_price}
                          onChange={(event) => updateGridRow(item.key, { print_price: event.target.value, enabled: true })}
                        />
                        {exceedsMax && <div className="text-xs text-[#FF3B30] mt-1">Above max</div>}
                      </td>
                      <td className="font-bold">{money(total)}</td>
                      <td>
                        <select
                          className="input-base min-w-[120px]"
                          value={row.status || "active"}
                          onChange={(event) => updateGridRow(item.key, { status: event.target.value })}
                        >
                          <option value="active">Active</option>
                          <option value="pending">Pending</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="input-base min-w-[220px]"
                          value={row.production_notes || ""}
                          onChange={(event) => updateGridRow(item.key, { production_notes: event.target.value })}
                          placeholder="Production note"
                        />
                      </td>
                      <td>
                        {item.existing ? <StatusBadge status={item.existing.status || "active"} /> : <span className="text-xs text-zinc-500">New</span>}
                      </td>
                      <td className="text-right">
                        {item.existing && (
                          <button
                            type="button"
                            onClick={() => deletePrice(item.existing)}
                            className="text-xs uppercase tracking-widest text-zinc-400 hover:text-[#FF3B30] font-bold"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {pricingMatrix.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-10 text-center text-zinc-500 overline">
                      No allowed print-area/option combinations for this template. Fix the template print area allowed options first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={saveGrid} disabled={savingGrid || (isAdmin && !selectedPrinterId) || !selectedTemplateId} className="btn-primary">
              <Save size={14} /> {savingGrid ? "Saving…" : "Save Grid"}
            </button>
          </div>
        </div>
      )}

      {!selectedTemplate && (
        <div className="card text-center text-zinc-500">
          Select a product template to open the pricing grid.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">{label}</div>
      <div className="font-display text-3xl uppercase text-white">{value}</div>
    </div>
  );
}

function InfoCard({ label, title, value }) {
  return (
    <div className="border border-white/10 bg-black/20 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
      <div className="font-bold text-sm text-white">{title || "Not selected"}</div>
      <div className="text-xs text-zinc-500 mt-1">{value}</div>
    </div>
  );
}
