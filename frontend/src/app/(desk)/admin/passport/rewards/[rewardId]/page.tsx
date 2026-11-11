import { PassportRewardDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ rewardId: string }> }) {
  const { rewardId } = await params;
  return <PassportRewardDetail rewardId={rewardId} />;
}
