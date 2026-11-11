import { AuditDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  return <AuditDetail auditId={auditId} />;
}
