import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const matter_id = searchParams.get("matter_id");

  if (!matter_id) {
    return NextResponse.json({ error: "matter_id is required" }, { status: 400 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { count, error: countErr } = await supabase
      .from("violations")
      .select("*", { count: "exact", head: true })
      .eq("matter_id", matter_id);

    if (countErr) throw countErr;

    const { data: factors, error: factorErr } = await supabase.rpc(
      "score_yousoufian_factors",
      { matter_id_param: matter_id }
    );

    if (factorErr) throw factorErr;

    return NextResponse.json({ total: count ?? 0, factors: factors[0] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
