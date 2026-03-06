import { MainLayout } from "@/components/layout/main-layout";

export default function ContractsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
