import { NextRequest, NextResponse } from "next/server";
import { parseCSV } from "@/lib/grant/csv-ingest";
import { validateBudget } from "@/lib/grant/validator";
import { ExtractedConstraintsSchema } from "@/lib/grant/types";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("csv") as File;
  const constraintsRaw = formData.get("constraints") as string;

  if (!file || !constraintsRaw) {
    return NextResponse.json(
      { error: "Missing csv or constraints" },
      { status: 400 }
    );
  }

  const csvText = await file.text();
  let constraints;
  try {
    const parsed = JSON.parse(constraintsRaw);
    const validation = ExtractedConstraintsSchema.safeParse(parsed);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid constraints object' }, { status: 400 });
    }
    constraints = validation.data;
  } catch {
    return NextResponse.json({ error: 'Invalid constraints object' }, { status: 400 });
  }
  const currentSpend = parseCSV(csvText);
  console.log(
    "DEBUG currentSpend.categories:",
    JSON.stringify(currentSpend.categories, null, 2)
  );
  const result = validateBudget(constraints, currentSpend);

  return NextResponse.json({ spend: currentSpend, validation: result });
}
