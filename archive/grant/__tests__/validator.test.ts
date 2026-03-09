import { describe, it, expect } from "vitest";
import { validateBudget } from "../validator";
import type { ExtractedConstraints } from "../types";
import type { NormalizedSpend } from "../csv-ingest";

function spend(categories: Record<string, number>): NormalizedSpend {
  const catEntries = Object.fromEntries(
    Object.entries(categories).map(([name, amount]) => [name, { spent: amount }])
  );
  const totalSpent = Object.values(categories).reduce((a, b) => a + b, 0);
  return {
    categories: catEntries,
    totalSpent,
    rawRows: [],
  };
}

describe("validateBudget", () => {
  it("TOTAL_EXCEEDED: totalSpent 70000, total_award 60000", () => {
    const constraints: ExtractedConstraints = {
      total_award: 60000,
      category_caps: {},
    };
    const currentSpend = spend({ Personnel: 40000, Travel: 30000 });
    const result = validateBudget(constraints, currentSpend);

    expect(result.compliant).toBe(false);
    const v = result.violations.find((x) => x.code === "TOTAL_EXCEEDED");
    expect(v).toBeDefined();
    expect(v!.computedValue).toBe(70000);
    expect(v!.threshold).toBe(60000);
    expect(v!.constraintId).toBe("total_award");
    expect(v!.comparisonOperator).toBe("gt");
    expect(v!.calculationInputs).toEqual([
      { label: "Total Spent", value: 70000 },
      { label: "Award Ceiling", value: 60000 },
    ]);
  });

  it("CATEGORY_CAP_EXCEEDED: Personnel cap 35000, spent 40000", () => {
    const constraints: ExtractedConstraints = {
      total_award: 100000,
      category_caps: { Personnel: { amount: 35000 } },
    };
    const currentSpend = spend({ Personnel: 40000 });
    const result = validateBudget(constraints, currentSpend);

    expect(result.compliant).toBe(false);
    const v = result.violations.find((x) => x.code === "CATEGORY_CAP_EXCEEDED");
    expect(v).toBeDefined();
    expect(v!.constraintId).toBe("category_cap.Personnel");
    expect(v!.computedValue).toBe(40000);
    expect(v!.threshold).toBe(35000);
  });

  it("PERCENTAGE_CAP_EXCEEDED: Personnel 58%, total_award 60000, spent 38000", () => {
    const constraints: ExtractedConstraints = {
      total_award: 60000,
      category_caps: { Personnel: { amount: 50000, percentage: 58 } },
    };
    const currentSpend = spend({ Personnel: 38000 });
    const result = validateBudget(constraints, currentSpend);

    const maxAllowed = (58 / 100) * 60000; // 34800
    expect(result.compliant).toBe(false);
    const v = result.violations.find((x) => x.code === "PERCENTAGE_CAP_EXCEEDED");
    expect(v).toBeDefined();
    expect(v!.threshold).toBe(34800);
    expect(v!.computedValue).toBe(38000);
  });

  it("RESTRICTED_CATEGORY: restricted_categories lobbying, spend Lobbying Event", () => {
    const constraints: ExtractedConstraints = {
      total_award: 100000,
      category_caps: {},
      restricted_categories: ["lobbying"],
    };
    const currentSpend = spend({ "Lobbying Event": 5000 });
    const result = validateBudget(constraints, currentSpend);

    expect(result.compliant).toBe(false);
    const v = result.violations.find((x) => x.code === "RESTRICTED_CATEGORY");
    expect(v).toBeDefined();
    expect(v!.category).toBe("Lobbying Event");
    expect(v!.constraintId).toBe("restricted.Lobbying Event");
  });

  it("APPROACHING_CAP (warning): cap 10000, spent 9500", () => {
    const constraints: ExtractedConstraints = {
      total_award: 50000,
      category_caps: { Operations: { amount: 10000 } },
    };
    const currentSpend = spend({ Operations: 9500 });
    const result = validateBudget(constraints, currentSpend);

    expect(result.compliant).toBe(true);
    const w = result.warnings.find((x) => x.code === "APPROACHING_CAP");
    expect(w).toBeDefined();
    expect(w!.percentUsed).toBe(95);
    expect(w!.computedValue).toBe(9500);
    expect(w!.threshold).toBe(10000);
    expect(w!.constraintId).toBe("category_cap.Operations");
  });

  it("UNKNOWN_CATEGORY (warning): no cap for Miscellaneous Supplies", () => {
    const constraints: ExtractedConstraints = {
      total_award: 100000,
      category_caps: { Personnel: { amount: 50000 } },
    };
    const currentSpend = spend({
      Personnel: 10000,
      "Miscellaneous Supplies": 500,
    });
    const result = validateBudget(constraints, currentSpend);

    const w = result.warnings.find((x) => x.code === "UNKNOWN_CATEGORY");
    expect(w).toBeDefined();
    expect(w!.category).toBe("Miscellaneous Supplies");
    expect(w!.constraintId).toBe("unknown.Miscellaneous Supplies");
    expect(w!.computedValue).toBe(500);
    expect(w!.threshold).toBe(0);
  });

  it("COMPLIANT: all spend within caps, no restricted", () => {
    const constraints: ExtractedConstraints = {
      total_award: 100000,
      category_caps: {
        Personnel: { amount: 50000 },
        Travel: { amount: 20000 },
      },
    };
    const currentSpend = spend({ Personnel: 30000, Travel: 10000 });
    const result = validateBudget(constraints, currentSpend);

    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("EDGE: zero spend", () => {
    const constraints: ExtractedConstraints = {
      total_award: 100000,
      category_caps: { Personnel: { amount: 50000 } },
    };
    const currentSpend = spend({ Personnel: 0 });
    const result = validateBudget(constraints, currentSpend);

    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("EDGE: rounding — cap 10000, spent 10000.01 fires CATEGORY_CAP_EXCEEDED", () => {
    const constraints: ExtractedConstraints = {
      total_award: 50000,
      category_caps: { Supplies: { amount: 10000 } },
    };
    const currentSpend = spend({ Supplies: 10000.01 });
    const result = validateBudget(constraints, currentSpend);

    expect(result.compliant).toBe(false);
    const v = result.violations.find((x) => x.code === "CATEGORY_CAP_EXCEEDED");
    expect(v).toBeDefined();
    expect(v!.computedValue).toBe(10000.01);
    expect(v!.threshold).toBe(10000);
  });
});
