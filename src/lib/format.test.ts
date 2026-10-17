import { describe, expect, it } from "vitest";
import { formatPercent, formatPhp } from "./format";

describe("formatPhp", () => {
  it("shows whole pesos without decimals", () => {
    expect(formatPhp(90)).toBe("₱90");
    expect(formatPhp(12730)).toBe("₱12,730");
  });

  it("always shows two decimals when there are centavos", () => {
    expect(formatPhp(589.7)).toBe("₱589.70");
    expect(formatPhp(111.02)).toBe("₱111.02");
  });

  it("treats floating-point noise from adding prices as whole pesos", () => {
    expect(formatPhp(0.1 * 3 * 100)).toBe("₱30");
  });
});

describe("formatPercent", () => {
  it("rounds to whole percents, keeping a decimal below 1%", () => {
    expect(formatPercent(0.834)).toBe("83%");
    expect(formatPercent(0.0008)).toBe("0.1%");
    expect(formatPercent(0)).toBe("0%");
  });
});
