import { StaffDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  return <StaffDetail staffId={staffId} />;
}
