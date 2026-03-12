import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import SignOutButtonClient from "./SignOutButtonClient";

export default async function AuthButton() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    return (
      <div className="flex items-center gap-6">
        <span className="text-sm text-text-tertiary">{user.email}</span>
        <SignOutButtonClient />
      </div>
    );
  }

  return (
    <Link
      href="/auth/login"
      className="btn btn-primary text-sm py-2 px-4"
    >
      Sign in
    </Link>
  );
}
