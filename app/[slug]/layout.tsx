import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function PublicBookingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* pb-16 keeps the end of the page clear of the floating Suporte button. */}
      <footer className="mt-auto flex flex-wrap items-center justify-center gap-3 border-t border-border px-4 pt-6 pb-16">
        <span className="text-xs text-muted-foreground">Reservas por</span>
        <Link href="/" className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4">
          <BrandLogo className="w-[130px]" />
        </Link>
      </footer>
    </>
  );
}
