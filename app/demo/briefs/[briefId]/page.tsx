import { notFound } from "next/navigation";
import { DemoBriefDetailPage } from "@/components/demo/DemoBriefDetailPage";
import { BRIEFS } from "@/lib/demo/demo-data";

export default function DemoBriefRoutePage({
  params,
}: {
  params: { briefId: string };
}) {
  if (!BRIEFS.some((brief) => brief.id === params.briefId)) {
    notFound();
  }

  return <DemoBriefDetailPage briefId={params.briefId} />;
}
