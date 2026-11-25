import { describe, it, expect } from "vitest";
import { formatWorkerRate, workerHasCreatorPrice, creatorPriceDefaults } from "./workRates.js";

describe("workRates", () => {
  it("formats hourly and flat rates", () => {
    expect(formatWorkerRate({ price_type: "hourly", hourly_rate: 80 })).toBe("$80/hr");
    expect(formatWorkerRate({ price_type: "flat", flat_rate: 250 })).toBe("$250");
  });

  it("prefers package from-price", () => {
    expect(formatWorkerRate({
      packages: [{ price: 400 }, { price: 250 }],
    })).toBe("from $250");
    expect(formatWorkerRate({
      packages: [{ price: 300 }],
    })).toBe("$300");
  });

  it("detects creator pricing", () => {
    expect(workerHasCreatorPrice({})).toBe(false);
    expect(workerHasCreatorPrice({ hourly_rate: 50 })).toBe(true);
    expect(workerHasCreatorPrice({ packages: [{ price: 100 }] })).toBe(true);
  });

  it("prefills package then hourly defaults", () => {
    const pkg = creatorPriceDefaults({
      packages: [{ worker_package_id: 9, price: 400, duration_hours: 4 }],
      hourly_rate: 90,
    });
    expect(pkg.packageId).toBe(9);
    expect(pkg.price).toBe("400");
    expect(pkg.durationHours).toBe(4);

    const hr = creatorPriceDefaults({ price_type: "hourly", hourly_rate: 75, packages: [] });
    expect(hr.useWorkerRate).toBe(true);
    expect(hr.priceType).toBe("hourly");
    expect(hr.price).toBe("75");
  });
});
