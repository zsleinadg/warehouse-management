import { MainLayout } from "@/components/layout/MainLayout";

export default function DashboardLayout({ children }: React.PropsWithChildren) {
  return <MainLayout>{children}</MainLayout>;
}