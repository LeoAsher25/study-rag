import { MainLayout } from "@/components/layout/main-layout";

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
