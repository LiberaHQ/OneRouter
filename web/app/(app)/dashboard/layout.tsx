import { AppBodyClass } from "@/components/chat/AppBodyClass";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppBodyClass />
      {children}
    </>
  );
}
