import { CustomerDetail } from "@/features/desk/ops-screens";

export default async function Page({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <CustomerDetail customerId={customerId} />;
}
