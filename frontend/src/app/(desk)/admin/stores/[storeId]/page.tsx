import { StoreDetailScreen } from "@/features/desk/stores-screens";

export default async function Page({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return <StoreDetailScreen storeId={storeId} />;
}
