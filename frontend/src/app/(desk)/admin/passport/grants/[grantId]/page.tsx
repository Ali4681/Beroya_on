import { PassportGrantDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ grantId: string }> }) {
  const { grantId } = await params;
  return <PassportGrantDetail grantId={grantId} />;
}
