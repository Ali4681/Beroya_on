import { PassportRuleDetail } from "@/features/desk/admin-screens";

export default async function Page({ params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await params;
  return <PassportRuleDetail ruleId={ruleId} />;
}
