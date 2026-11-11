import { PassportLevelDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ levelId: string }> }) {
  const { levelId } = await params;
  return <PassportLevelDetail levelId={levelId} />;
}
