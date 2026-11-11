import { PosReceiptScreen } from "@/features/desk/pos-screens";

export default async function Page({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <PosReceiptScreen reference={decodeURIComponent(reference)} />;
}
