import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import SignOutButton from "./SignOutButton";
import ArticleIngest from "./ArticleIngest";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen bg-bg-primary">
      {/* Navigation */}
      <nav className="border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg tracking-tight">orbex</h1>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-text-primary">Ingest</span>
              <Link
                href="/dashboard/graph"
                className="text-text-tertiary hover:text-text-secondary"
              >
                Graph
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-sm text-text-tertiary">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="bg-dot-grid min-h-[calc(100vh-64px)]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="mb-8">
            <h2 className="text-2xl mb-2">Ingest Article</h2>
            <p className="text-text-tertiary">
              Add an article URL to extract and view its content
            </p>
          </div>

          <ArticleIngest />
        </div>
      </div>
    </main>
  );
}
