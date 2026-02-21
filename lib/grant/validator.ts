import { ExtractedConstraints } from "./types";
import { NormalizedSpend } from "./csv-ingest";

export interface Violation {
  code: string;
  message: string;
  category?: string;
  amount?: number;
  cap?: number;
}

export interface Warning {
  code: string;
  message: string;
  category?: string;
  amount?: number;
  cap?: number;
  percentUsed?: number;
}

export interface ValidationResult {
  compliant: boolean;
  violations: Violation[];
  warnings: Warning[];
}

function canonicalizeCategory(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateBudget(
  constraints: ExtractedConstraints,
  currentSpend: NormalizedSpend
): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];

  const canonicalCaps: Record<string, { amount: number; percentage?: number }> = {};
  for (const key in constraints.category_caps ?? {}) {
    canonicalCaps[canonicalizeCategory(key)] = constraints.category_caps![key];
  }

  const canonicalRestricted = (constraints.restricted_categories ?? []).map(
    canonicalizeCategory
  );

  // 1. Total award check
  if (currentSpend.totalSpent > constraints.total_award) {
    violations.push({
      code: "TOTAL_EXCEEDED",
      message: `Total spend $${currentSpend.totalSpent.toLocaleString()} exceeds award of $${constraints.total_award.toLocaleString()}`,
    });
  }

  // 2. Category cap checks
  for (const [cat, cap] of Object.entries(canonicalCaps)) {
    const matchedKey = Object.keys(currentSpend.categories).find(
      (k) => canonicalizeCategory(k) === cat
    );
    const actual = matchedKey ? currentSpend.categories[matchedKey].spent : 0;

    if (actual > cap.amount) {
      violations.push({
        code: "CATEGORY_CAP_EXCEEDED",
        message: `${matchedKey ?? cat}: spent $${actual.toLocaleString()} exceeds cap of $${cap.amount.toLocaleString()}`,
        category: matchedKey ?? cat,
        amount: actual,
        cap: cap.amount,
      });
    }

    if (cap.percentage) {
      const maxAllowed = (cap.percentage / 100) * constraints.total_award;
      if (actual > maxAllowed) {
        violations.push({
          code: "PERCENTAGE_CAP_EXCEEDED",
          message: `${matchedKey ?? cat}: $${actual.toLocaleString()} exceeds ${cap.percentage}% cap ($${maxAllowed.toLocaleString()})`,
          category: matchedKey ?? cat,
          amount: actual,
          cap: maxAllowed,
        });
      }
    }

    if (actual > cap.amount * 0.9 && actual <= cap.amount) {
      const percentUsed = Math.round((actual / cap.amount) * 100);
      warnings.push({
        code: "APPROACHING_CAP",
        message: `${matchedKey ?? cat}: at ${percentUsed}% of cap — approaching limit`,
        category: matchedKey ?? cat,
        amount: actual,
        cap: cap.amount,
        percentUsed,
      });
    }
  }

  // 3. Restricted category check
  for (const spentCat of Object.keys(currentSpend.categories)) {
    const spentCanonical = canonicalizeCategory(spentCat);
    if (canonicalRestricted.some((r) => spentCanonical.includes(r))) {
      violations.push({
        code: "RESTRICTED_CATEGORY",
        message: `Restricted category detected: "${spentCat}" matches a restricted term`,
        category: spentCat,
        amount: currentSpend.categories[spentCat].spent,
      });
    }
  }

  // 4. Unknown category warning — catches messy real-world books
  for (const spentCat of Object.keys(currentSpend.categories)) {
    const spentCanonical = canonicalizeCategory(spentCat);
    const isRestricted = canonicalRestricted.some((r) =>
      spentCanonical.includes(r)
    );
    if (!canonicalCaps[spentCanonical] && !isRestricted) {
      warnings.push({
        code: "UNKNOWN_CATEGORY",
        message: `Unrecognized category in spend: "${spentCat}" not defined in award caps`,
        category: spentCat,
        amount: currentSpend.categories[spentCat].spent,
      });
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
  };
}
