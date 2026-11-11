import { CompensationDetail } from "@/features/desk/finance-screens";

export default async function Page({ params }: { params: Promise<{ compensationId: string }> }) {
  const { compensationId } = await params;
  return <CompensationDetail compensationId={compensationId} />;
}
