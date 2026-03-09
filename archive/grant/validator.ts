import { ExtractedConstraints, Violation, Warning, ValidationResult } from "./types";
import { NormalizedSpend } from "./csv-ingest";

export type { Violation, Warning, ValidationResult };

function canonicalizeCategory(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Build a helper to find the best cap match for a spend category
function findCapMatch(
  spentCanonical: string,
  canonicalCaps: Record<string, { amount: number; percentage?: number }>
): string | undefined {
  return Object.keys(canonicalCaps).find(
    (capKey) =>
      capKey.includes(spentCanonical) || spentCanonical.includes(capKey)
  );
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
      constraintId: "total_award",
      computedValue: currentSpend.totalSpent,
      threshold: constraints.total_award,
      comparisonOperator: "gt",
      calculationInputs: [
        { label: "Total Spent", value: currentSpend.totalSpent },
        { label: "Award Ceiling", value: constraints.total_award },
      ],
    });
  }

  // 2. Category cap checks
  for (const [cat, cap] of Object.entries(canonicalCaps)) {
    const matchedKey = Object.keys(currentSpend.categories).find(
      (k) => canonicalizeCategory(k) === cat ||
             cat.includes(canonicalizeCategory(k)) ||
             canonicalizeCategory(k).includes(cat)
    );
    const actual = matchedKey ? currentSpend.categories[matchedKey].spent : 0;

    if (actual > cap.amount) {
      violations.push({
        code: "CATEGORY_CAP_EXCEEDED",
        message: `${matchedKey ?? cat}: spent $${actual.toLocaleString()} exceeds cap of $${cap.amount.toLocaleString()}`,
        category: matchedKey ?? cat,
        constraintId: `category_cap.${matchedKey ?? cat}`,
        computedValue: actual,
        threshold: cap.amount,
        comparisonOperator: "gt",
        calculationInputs: [
          { label: "Category Spent", value: actual },
          { label: "Category Cap", value: cap.amount },
        ],
      });
    }

    if (cap.percentage) {
      const maxAllowed = (cap.percentage / 100) * constraints.total_award;
      if (actual > maxAllowed) {
        violations.push({
          code: "PERCENTAGE_CAP_EXCEEDED",
          message: `${matchedKey ?? cat}: $${actual.toLocaleString()} exceeds ${cap.percentage}% cap ($${maxAllowed.toLocaleString()})`,
          category: matchedKey ?? cat,
          constraintId: `percentage_cap.${matchedKey ?? cat}`,
          computedValue: actual,
          threshold: maxAllowed,
          comparisonOperator: "gt",
          calculationInputs: [
            { label: "Category Spent", value: actual },
            { label: "Percentage Cap", value: cap.percentage },
            { label: "Award Total", value: constraints.total_award },
            { label: "Max Allowed", value: maxAllowed },
          ],
        });
      }
    }

    if (actual > cap.amount * 0.9 && actual <= cap.amount) {
      const percentUsed = Math.round((actual / cap.amount) * 100);
      warnings.push({
        code: "APPROACHING_CAP",
        message: `${matchedKey ?? cat}: at ${percentUsed}% of cap — approaching limit`,
        category: matchedKey ?? cat,
        constraintId: `category_cap.${matchedKey ?? cat}`,
        computedValue: actual,
        threshold: cap.amount,
        percentUsed,
      });
    }
  }

  // 3. Restricted category check
  for (const spentCat of Object.keys(currentSpend.categories)) {
    const spentCanonical = canonicalizeCategory(spentCat);
    if (canonicalRestricted.some((r) => spentCanonical.includes(r))) {
      const spent = currentSpend.categories[spentCat].spent;
      violations.push({
        code: "RESTRICTED_CATEGORY",
        message: `Restricted category detected: "${spentCat}" matches a restricted term`,
        category: spentCat,
        constraintId: `restricted.${spentCat}`,
        computedValue: spent,
        threshold: 0,
        comparisonOperator: "gt",
        calculationInputs: [
          { label: "Restricted Spend", value: spent },
        ],
      });
    }
  }

  // Unknown category detection (fuzzy-aware)
  for (const [k, v] of Object.entries(currentSpend.categories)) {
    const spentCanonical = canonicalizeCategory(k);

    const capMatch = findCapMatch(spentCanonical, canonicalCaps);

    const isRestricted = canonicalRestricted.some((r) =>
      spentCanonical.includes(r)
    );

    if (!capMatch && !isRestricted) {
      warnings.push({
        code: "UNKNOWN_CATEGORY",
        message: `Unrecognized category in spend: "${k}" not defined in award caps`,
        category: k,
        constraintId: `unknown.${k}`,
        computedValue: v.spent,
        threshold: 0,
      });
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
  };
}
