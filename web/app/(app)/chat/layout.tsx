import { AppBodyClass } from "@/components/chat/AppBodyClass";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppBodyClass />
      {children}
    </>
  );
}
