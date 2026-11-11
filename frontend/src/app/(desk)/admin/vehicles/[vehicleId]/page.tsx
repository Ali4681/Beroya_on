import { VehicleDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  return <VehicleDetail vehicleId={vehicleId} />;
}
