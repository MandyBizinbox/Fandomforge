import React, { useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import PrintAreaInspector from "./PrintAreaInspector";

function findButton(container, text) {
  return Array.from(container.querySelectorAll("button"))
    .find((button) => button.textContent.includes(text));
}

function findInputByLabel(container, labelText) {
  const label = Array.from(container.querySelectorAll("label"))
    .find((item) => item.textContent.includes(labelText));
  return label?.querySelector("input, textarea, select") || null;
}

function setInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value"
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function Harness() {
  const [area, setArea] = useState({
    id: "area-front",
    name: "Front",
    area_key: "front",
    view_key: "front",
    geometry_type: "rectangle",
    shape_type: "rectangle",
    x: 10,
    y: 10,
    width: 50,
    height: 50,
    x_pct: 10,
    y_pct: 10,
    width_pct: 50,
    height_pct: 50,
    width_mm: 200,
    height_mm: 250,
    dpi: 300,
    allowed_print_option_ids: [],
    notes: "",
  });

  return (
    <>
      <PrintAreaInspector
        selectedArea={area}
        printOptions={[
          { id: "dtf-a4", status: "active", print_method: "DTF", print_positions: ["front"] },
          { id: "htv-front", status: "active", print_method: "HTV", print_positions: ["front"] },
        ]}
        onChange={setArea}
      />
      <output data-testid="area-state">{JSON.stringify(area)}</output>
    </>
  );
}

describe("Template production workspace", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
      root.render(<Harness />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("keeps print-area edits while switching inspector tabs", () => {
    const xInput = findInputByLabel(container, "X %");
    expect(xInput).toBeTruthy();

    act(() => setInputValue(xInput, "22"));

    const outputTab = findButton(container, "Output dimensions");
    expect(outputTab).toBeTruthy();
    act(() => outputTab.click());

    const widthInput = findInputByLabel(container, "Width mm");
    expect(widthInput).toBeTruthy();
    act(() => setInputValue(widthInput, "315"));

    const rulesTab = findButton(container, "Manufacturing rules");
    act(() => rulesTab.click());

    const allowAll = findButton(container, "Allow all active");
    expect(allowAll).toBeTruthy();
    act(() => allowAll.click());

    act(() => findButton(container, "Placement").click());

    const state = JSON.parse(container.querySelector('[data-testid="area-state"]').textContent);
    expect(state.x).toBe(22);
    expect(state.width_mm).toBe(315);
    expect(state.allowed_print_option_ids).toEqual(["dtf-a4", "htv-front"]);
  });

  test("supports keyboard navigation between inspector tabs", () => {
    const placement = findButton(container, "Placement");
    expect(placement.getAttribute("role")).toBe("tab");
    expect(placement.getAttribute("aria-selected")).toBe("true");

    act(() => {
      placement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    const output = findButton(container, "Output dimensions");
    expect(output.getAttribute("aria-selected")).toBe("true");
  });
});
