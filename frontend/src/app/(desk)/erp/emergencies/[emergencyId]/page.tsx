import { EmergencyDetail } from "@/features/desk/ops-screens";

export default async function Page({ params }: { params: Promise<{ emergencyId: string }> }) {
  const { emergencyId } = await params;
  return <EmergencyDetail emergencyId={emergencyId} />;
}
