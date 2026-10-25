import { describe, expect, it } from "vitest";
import { describeRate, parseExchangeRateApi, parseFrankfurter, usdInPhp } from "./fx";

describe("exchange rates", () => {
  it("reads Frankfurter's European Central Bank rate", () => {
    expect(parseFrankfurter({ amount: 1, base: "USD", date: "2026-10-23", rates: { PHP: 63.642 } })).toEqual({
      rate: 63.642,
      date: "2026-10-23",
      source: "European Central Bank",
    });
    expect(parseFrankfurter({ base: "EUR", date: "2026-10-23", rates: { PHP: 70 } })).toBeNull();
    expect(parseFrankfurter({ base: "USD", date: "2026-10-23", rates: {} })).toBeNull();
  });

  it("reads ExchangeRate-API's open rate", () => {
    expect(
      parseExchangeRateApi({ result: "success", base_code: "USD", time_last_update_unix: 1792886551, rates: { PHP: 63.7 } }),
    ).toEqual({ rate: 63.7, date: "2026-10-25", source: "ExchangeRate-API" });
    expect(parseExchangeRateApi({ result: "error" })).toBeNull();
  });

  it("refuses rates that can't be right", () => {
    expect(parseFrankfurter({ base: "USD", date: "2026-10-23", rates: { PHP: 0 } })).toBeNull();
    expect(parseFrankfurter({ base: "USD", date: "2026-10-23", rates: { PHP: "63" } })).toBeNull();
  });

  it("shows dollars in whole pesos, or dollars without a rate", () => {
    const rate = { rate: 63.642, date: "2026-10-23", source: "European Central Bank" } as const;
    expect(usdInPhp(68.23, rate)).toBe("₱4,342");
    expect(usdInPhp(2, rate)).toBe("₱127");
    expect(usdInPhp(68.23, null)).toBe("$68.23");
    expect(describeRate(rate)).toBe("₱63.64 per US dollar");
  });
});
