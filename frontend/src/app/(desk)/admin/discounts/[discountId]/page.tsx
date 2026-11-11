import { DiscountDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ discountId: string }> }) {
  const { discountId } = await params;
  return <DiscountDetail discountId={discountId} />;
}
