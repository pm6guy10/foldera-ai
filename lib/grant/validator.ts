import { ExtractedConstraints } from "./types";
import { NormalizedSpend } from "./csv-ingest";

export interface Violation {
  code: string;
  message: string;
}

export interface Warning {
  code: string;
  message: string;
  category?: string;
  amount?: number;
}

export interface ValidationResult {
  compliant: boolean;
  violations: Violation[];
  warnings: Warning[];
}

export function validateBudget(
  constraints: ExtractedConstraints,
  currentSpend: NormalizedSpend
): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];

  // 1. Total award check
  if (currentSpend.totalSpent > constraints.total_award) {
    violations.push({
      code: "TOTAL_EXCEEDED",
      message: `Total spend $${currentSpend.totalSpent.toLocaleString()} exceeds award of $${constraints.total_award.toLocaleString()}`,
    });
  }

  // 2. Category cap checks
  for (const [cat, cap] of Object.entries(constraints.category_caps ?? {})) {
    const actual = currentSpend.categories[cat]?.spent ?? 0;

    if (actual > cap.amount) {
      violations.push({
        code: "CATEGORY_CAP_EXCEEDED",
        message: `${cat}: spent $${actual.toLocaleString()} exceeds cap of $${cap.amount.toLocaleString()}`,
      });
    }

    if (cap.percentage) {
      const maxAllowed = (cap.percentage / 100) * constraints.total_award;
      if (actual > maxAllowed) {
        violations.push({
          code: "PERCENTAGE_CAP_EXCEEDED",
          message: `${cat}: $${actual.toLocaleString()} exceeds ${cap.percentage}% cap ($${maxAllowed.toLocaleString()})`,
        });
      }
    }

    // Warning at 90% of cap
    if (actual > cap.amount * 0.9 && actual <= cap.amount) {
      warnings.push({
        code: "APPROACHING_CAP",
        message: `${cat}: at ${Math.round((actual / cap.amount) * 100)}% of cap — approaching limit`,
      });
    }
  }

  // 3. Restricted category check
  for (const restricted of constraints.restricted_categories ?? []) {
    for (const spentCat of Object.keys(currentSpend.categories)) {
      if (spentCat.toLowerCase().includes(restricted.toLowerCase())) {
        violations.push({
          code: "RESTRICTED_CATEGORY",
          message: `Restricted category detected: "${spentCat}" matches restricted term "${restricted}"`,
        });
      }
    }
  }

  // 4. Unknown category warning — catches messy real-world books
  for (const spentCat of Object.keys(currentSpend.categories)) {
    const isRestricted = constraints.restricted_categories?.some((r) =>
      spentCat.toLowerCase().includes(r.toLowerCase())
    );

    if (!constraints.category_caps?.[spentCat] && !isRestricted) {
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
