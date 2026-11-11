import { DriverWalletDetail } from "@/features/desk/finance-screens";

export default async function Page({ params }: { params: Promise<{ driverId: string }> }) {
  const { driverId } = await params;
  return <DriverWalletDetail driverId={driverId} />;
}
