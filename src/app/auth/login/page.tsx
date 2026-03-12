"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-bg-primary bg-dot-grid flex items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        {/* Header */}
        <div className="text-center mb-12">
          <Link href="/" className="inline-block mb-8">
            <h1 className="text-xl tracking-tight">orbex</h1>
          </Link>
          <h2 className="text-2xl mb-2">Welcome back</h2>
          <p className="text-text-tertiary text-sm">
            Sign in to continue to your knowledge graph
          </p>
        </div>

        {/* Form Card */}
        <div className="card p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-solid w-full"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-text-tertiary mt-8">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="text-text-secondary hover:text-text-primary">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
