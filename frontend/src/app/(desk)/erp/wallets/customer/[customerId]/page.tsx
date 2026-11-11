import { CustomerWalletDetail } from "@/features/desk/finance-screens";

export default async function Page({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <CustomerWalletDetail customerId={customerId} />;
}
