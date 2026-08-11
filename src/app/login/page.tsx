import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  const { data: workers, error } = await supabaseAdmin()
    .from("workers")
    .select("id, name")
    .eq("excluded", false)
    .order("name");
  if (error) throw error;

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-lg bg-accent text-accent-ink flex items-center justify-center font-bold text-sm">S</div>
          <div>
            <div className="font-semibold text-sm text-text">Shift Scheduler</div>
            <div className="text-[10px] uppercase tracking-wide text-text-muted">Support Team</div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <h1 className="text-base font-semibold text-text mb-1">Log in</h1>
          <p className="text-sm text-text-muted mb-5">Pick your name and enter your PIN.</p>
          <LoginForm workers={workers ?? []} />
        </div>
      </div>
    </main>
  );
}
