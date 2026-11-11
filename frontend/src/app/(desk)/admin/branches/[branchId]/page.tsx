import { BranchDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  return <BranchDetail branchId={branchId} />;
}
