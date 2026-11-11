import { DriverDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ driverId: string }> }) {
  const { driverId } = await params;
  return <DriverDetail driverId={driverId} />;
}
