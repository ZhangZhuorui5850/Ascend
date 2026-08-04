import { MotionProvider } from "@/components/ui/MotionProvider";
import { TrailShell } from "@/components/redesign/TrailShell";

export const metadata = {
  title: "登峰 · 山径预览",
};

export default function RedesignLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionProvider>
      <TrailShell>{children}</TrailShell>
    </MotionProvider>
  );
}
