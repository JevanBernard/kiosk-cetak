import type { PriceConfig } from "@kioskcetak/shared";

export function toPriceConfig(s: Record<string, any>): PriceConfig {
  return {
    price_bw_single: s.price_bw_single,
    price_bw_duplex: s.price_bw_duplex,
    price_color_single: s.price_color_single,
    price_color_duplex: s.price_color_duplex,
    rounding: s.rounding,
    max_copies: s.max_copies,
    min_total: s.min_total,
    allow_color: s.allow_color,
    allow_duplex: s.allow_duplex,
    allow_nup: s.allow_nup,
  };
}
