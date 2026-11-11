import { RideDetail } from "@/features/desk/ops-screens";

export default async function Page({ params }: { params: Promise<{ rideId: string }> }) {
  const { rideId } = await params;
  return <RideDetail rideId={rideId} />;
}
