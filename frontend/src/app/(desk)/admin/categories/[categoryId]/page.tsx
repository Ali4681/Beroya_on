import { CategoryDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  return <CategoryDetail categoryId={categoryId} />;
}
