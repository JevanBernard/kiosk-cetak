import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePageRange, priceFile, orderTotal, DEFAULT_OPTIONS, type PriceConfig } from "./index";

const cfg: PriceConfig = {
  price_bw_single: 500, price_bw_duplex: 400, price_color_single: 1500, price_color_duplex: 1300,
  rounding: 500, max_copies: 50, min_total: 1000, allow_color: true, allow_duplex: true, allow_nup: true,
};

test("rentang halaman", () => {
  assert.deepEqual(parsePageRange("1-3, 5, 8-10", 10), { pages: [1, 2, 3, 5, 8, 9, 10] });
  assert.equal(parsePageRange("", 3).pages?.length ?? 0, 3);
  assert.ok("error" in parsePageRange("5-3", 10));
  assert.ok("error" in parsePageRange("1-11", 10));
  assert.ok("error" in parsePageRange("a", 10));
});

test("N-up menghitung sisi fisik, bukan halaman asli (PRD F-14)", () => {
  const r = priceFile({ ...DEFAULT_OPTIONS, nup: 4 }, 40, cfg);
  assert.ok(!("error" in r));
  if (!("error" in r)) { assert.equal(r.sides, 10); assert.equal(r.total, 5000); }
});

test("salinan dan pembulatan total", () => {
  const r = priceFile({ ...DEFAULT_OPTIONS, duplex: true, copies: 3, range: "1-3" }, 10, cfg);
  assert.ok(!("error" in r));
  if (!("error" in r)) assert.equal(r.total, 3 * 400 * 3);
  assert.equal(orderTotal([3600, 100], cfg).total, 4000);
});

test("batas salinan dan opsi nonaktif", () => {
  assert.ok("error" in priceFile({ ...DEFAULT_OPTIONS, copies: 51 }, 5, cfg));
  assert.ok("error" in priceFile({ ...DEFAULT_OPTIONS, color: true }, 5, { ...cfg, allow_color: false }));
});
