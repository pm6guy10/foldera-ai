import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/meeting-prep/auth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const matter_id = searchParams.get("matter_id");

  if (!matter_id) {
    return NextResponse.json({ error: "matter_id is required" }, { status: 400 });
  }

  try {
    // Initialize Supabase client only if environment variables are available
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        )
      : null;

    if (supabase) {
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
    } else {
      // Return mock data when Supabase is not configured
      return NextResponse.json({ 
        total: 5, 
        factors: { 
          timeliness: 2, 
          completeness: 3, 
          good_faith: 1, 
          privilege_logs: 2, 
          redactions: 4, 
          exemptions: 3 
        } 
      });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
