import AuthButton from "@/components/AuthButton";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg-primary">
      {/* Navigation */}
      <nav className="border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <h1 className="text-lg tracking-tight">orbex</h1>
          <AuthButton />
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-dot-grid">
        <div className="max-w-6xl mx-auto px-6 py-32">
          <div className="max-w-2xl">
            <h2 className="text-5xl leading-[1.1] mb-6">
              Your Newsfeed
              <br />
              <span className="text-text-secondary">Second Brain</span>
            </h2>
            <p className="text-lg text-text-secondary leading-relaxed mb-12">
              A personal knowledge graph that auto-populates from your content feeds,
              extracts entities and relationships, and visualizes them as an interactive web.
            </p>
            <div className="flex gap-4">
              <a href="/auth/signup" className="btn btn-solid">
                Get started
              </a>
              <a href="/auth/login" className="btn btn-primary">
                Sign in
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card p-6">
              <div className="text-text-tertiary text-xs uppercase tracking-wider mb-4">
                01 / Ingest
              </div>
              <h3 className="text-lg mb-2">Auto-populate</h3>
              <p className="text-text-tertiary text-sm">
                Connect RSS feeds, podcasts, and newsletters. Content flows in automatically.
              </p>
            </div>
            <div className="card p-6">
              <div className="text-text-tertiary text-xs uppercase tracking-wider mb-4">
                02 / Extract
              </div>
              <h3 className="text-lg mb-2">AI-powered</h3>
              <p className="text-text-tertiary text-sm">
                Entities, relationships, and concepts are extracted and organized by AI.
              </p>
            </div>
            <div className="card p-6">
              <div className="text-text-tertiary text-xs uppercase tracking-wider mb-4">
                03 / Visualize
              </div>
              <h3 className="text-lg mb-2">Knowledge graph</h3>
              <p className="text-text-tertiary text-sm">
                Explore connections as an interactive web. See how ideas relate.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <p className="text-text-tertiary text-sm">
            orbex — knowledge infrastructure
          </p>
        </div>
      </footer>
    </main>
  );
}
