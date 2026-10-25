import { csvRows, parsePayFastExport, reconcilePayFastOrders } from "./payfastReconciliation";

const csv = [
  "Date,Type,Sign,Name,Description,Gross,M Payment ID,PF Payment ID",
  '2026-10-24,Funds Received,Credit,FandomForge Order MF-48AC28F6,Order MF-48AC28F6,450.00,mf_abc,336181209',
  '2026-10-24,Funds Received,Credit,Raffle: Summer Fundraiser,,180.00,RF-123,336181210',
].join("\n");
const order = (id, ref, amount, status = "paid") => ({
  id, order_number: ref, total: amount, payment_status: status
});
test("parses other platforms safely without matching their payments", () => {
  expect(csvRows('one,"two,three",four\n')[0][1]).toBe("two,three");
  const parsed = parsePayFastExport(csv);
  expect(parsed.transactions).toHaveLength(1);
  const matched = reconcilePayFastOrders([
    order("a","MF-48AC28F6",450), order("b","MF-OTHER",180)
  ], parsed);
  expect(matched.a).toBe("gateway_matched");
  expect(matched.b).toBe("not_in_export");
});
test("amount mismatch prevents gateway confirmation", () => {
  const result = reconcilePayFastOrders([order("a","MF-48AC28F6",451)], parsePayFastExport(csv));
  expect(result.a).toBe("gateway_exception");
});
test("two credited gateway payments for one order require review", () => {
  const two = csv + "\n2026-10-24,Funds Received,Credit,FandomForge Order MF-48AC28F6,,450.00,mf_def,336181211";
  expect(reconcilePayFastOrders([order("a","MF-48AC28F6",450)],parsePayFastExport(two)).a).toBe("gateway_exception");
});
test("quoted multiline entries and malformed exports are handled", () => {
  expect(csvRows('a,b\n"line\none",two')).toHaveLength(2);
  expect(() => parsePayFastExport("foo,bar\n1,2")).toThrow();
});
