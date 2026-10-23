import type { Metadata } from "next";
import { LeaveWaitlist } from "./leave-waitlist";

export const metadata: Metadata = {
  title: "Sair da lista de espera — AgendFined",
  robots: { index: false, follow: false },
};

// Nothing is looked up here: the private token lives in the URL fragment,
// which never reaches the server, and only the leave action resolves it.
export default async function LeaveWaitlistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center px-4 py-12">
      <div className="w-full rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <LeaveWaitlist slug={slug} />
      </div>
    </main>
  );
}
