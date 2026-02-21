import Papa from "papaparse";

export interface SpendRow {
  category: string;
  amount: number;
  date?: string;
  description?: string;
}

export interface NormalizedSpend {
  categories: {
    [categoryName: string]: { spent: number };
  };
  totalSpent: number;
  date?: string;
  rawRows: SpendRow[];
}

const CATEGORY_ALIASES: Record<string, string> = {
  "salaries": "Personnel",
  "salary": "Personnel",
  "wages": "Personnel",
  "personnel": "Personnel",
  "benefits": "Personnel",
  "travel": "Travel",
  "mileage": "Travel",
  "transportation": "Travel",
  "equipment": "Equipment",
  "indirect": "Indirect Costs",
  "overhead": "Indirect Costs",
  "indirect costs": "Indirect Costs",
  "fringe": "Indirect Costs",
};

// Fuzzy match — handles "Personnel - Admin", "Staff Salaries", etc.
function normalizeCategory(raw: string): string {
  const lower = raw.toLowerCase().trim();

  for (const key of Object.keys(CATEGORY_ALIASES)) {
    if (lower.includes(key)) {
      return CATEGORY_ALIASES[key];
    }
  }

  return raw.trim();
}

function parseAmount(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function parseCSV(csvText: string): NormalizedSpend {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const rows: SpendRow[] = result.data.map((row) => {
    const category =
      row["category"] ?? row["expense category"] ?? row["type"] ?? "Unknown";
    const amount =
      row["amount"] ?? row["spent"] ?? row["total"] ?? row["cost"] ?? "0";
    const date = row["date"] ?? row["month"] ?? undefined;
    const description = row["description"] ?? row["memo"] ?? undefined;

    return {
      category: normalizeCategory(category),
      amount: parseAmount(amount),
      date,
      description,
    };
  });

  const categories: Record<string, { spent: number }> = {};
  let totalSpent = 0;

  for (const row of rows) {
    if (!categories[row.category]) {
      categories[row.category] = { spent: 0 };
    }
    categories[row.category].spent += row.amount;
    totalSpent += row.amount;
  }

  return { categories, totalSpent, rawRows: rows };
}
