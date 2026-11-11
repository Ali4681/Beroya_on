import { CommandCenterScreen } from "@/features/desk/command-center";

export default async function Page({ searchParams }: { searchParams: Promise<{ cell?: string | string[] }> }) {
  const { cell } = await searchParams;
  return <CommandCenterScreen initialCell={typeof cell === "string" && cell ? cell : null} />;
}
