import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { KnowledgeGraph } from "@/components/graph";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="h-screen flex flex-col bg-bg-primary">
      {/* Navigation */}
      <nav className="border-b border-border-subtle shrink-0">
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg tracking-tight hover:text-text-primary">
              orbex
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/dashboard"
                className="text-text-tertiary hover:text-text-secondary"
              >
                Ingest
              </Link>
              <span className="text-text-primary">Graph</span>
            </div>
          </div>
          <span className="text-sm text-text-tertiary">{user.email}</span>
        </div>
      </nav>

      {/* Graph - full height */}
      <div className="flex-1 min-h-0">
        <KnowledgeGraph />
      </div>
    </main>
  );
}
