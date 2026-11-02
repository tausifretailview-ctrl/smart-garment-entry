import { describe, expect, it } from "vitest";
import {
  buildAmazonStockFile,
  groupByOrder,
  isOrdersReport,
  isReturnsReport,
  parseReportText,
  readOrderLines,
  readReturnLines,
} from "../src/utils/amazonReports";

const ORDERS = [
  "amazon-order-id\tmerchant-order-id\tpurchase-date\torder-status\tfulfillment-channel\tsku\tquantity\titem-price",
  "171-1111111-1111111\t\t2026-11-01T10:00:00+00:00\tShipped\tMerchant\tKURTA-RED-M\t1\t999.00",
  "171-1111111-1111111\t\t2026-11-01T10:00:00+00:00\tShipped\tMerchant\tKURTA-RED-L\t2\t1998.00",
  "171-2222222-2222222\t\t2026-11-01T11:00:00+00:00\tCancelled\tMerchant\tKURTA-RED-M\t1\t999.00",
  "171-3333333-3333333\t\t2026-11-01T12:00:00+00:00\tShipped\tAmazon\tKURTA-RED-M\t1\t999.00",
  "171-4444444-4444444\t\t2026-11-01T12:00:00+00:00\tPending\tMerchant\tKURTA-RED-M\t1\t999.00",
].join("\n");

describe("Amazon report files", () => {
  it("reads an All Orders report and skips cancelled, FBA and pending lines", () => {
    const t = parseReportText(ORDERS);
    expect(isOrdersReport(t)).toBe(true);
    expect(isReturnsReport(t)).toBe(false);
    const { lines, skipped } = readOrderLines(t);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ orderId: "171-1111111-1111111", sku: "KURTA-RED-L", quantity: 2, amount: 1998 });
    expect(skipped.map((s) => s.orderId)).toEqual(["171-2222222-2222222", "171-3333333-3333333", "171-4444444-4444444"]);
    const orders = groupByOrder(lines);
    expect(orders).toHaveLength(1);
    expect(orders[0].lines).toHaveLength(2);
  });

  it("reads the seller-fulfilled order report column names", () => {
    const t = parseReportText("order-id\torder-item-id\tpurchase-date\tsku\tquantity-purchased\titem-price\n402-1\t555\t2026-11-01\tA1\t3\t300");
    expect(isOrdersReport(t)).toBe(true);
    expect(readOrderLines(t).lines[0]).toMatchObject({ lineKey: "402-1|555", quantity: 3, amount: 300 });
  });

  it("reads a Manage Returns report saved as CSV", () => {
    const csv = 'Order ID,Return request status,Amazon RMA ID,Merchant SKU,Return quantity,Return Reason\n402-1,Approved,RMA9,A1,1,"Too small, need M"\n402-2,Rejected,RMA10,A2,1,x';
    const t = parseReportText(csv);
    expect(isReturnsReport(t)).toBe(true);
    expect(isOrdersReport(t)).toBe(false);
    expect(readReturnLines(t)).toEqual([
      { orderId: "402-1", lineKey: "402-1|RMA9|A1", sku: "A1", quantity: 1, reason: "Too small, need M", returnDate: null },
    ]);
  });

  it("makes the price-and-quantity upload file with empty prices", () => {
    expect(buildAmazonStockFile([{ sku: "A1", quantity: 4.6 }, { sku: "A2", quantity: -1 }])).toBe(
      "sku\tprice\tminimum-seller-allowed-price\tmaximum-seller-allowed-price\tquantity\thandling-time\tfulfillment-channel\r\n" +
        "A1\t\t\t\t4\t\t\r\nA2\t\t\t\t0\t\t\r\n",
    );
  });
});
