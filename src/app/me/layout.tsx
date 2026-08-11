import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getWorkerById } from "@/lib/data";
import AppShell from "@/components/AppShell";

const NAV = [
  { href: "/me", label: "Weekly Schedule", icon: "▦" },
  { href: "/me/availability", label: "My Availability", icon: "◐" },
  { href: "/me/notes", label: "My Notes", icon: "✎" },
];

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const me = await getWorkerById(session.workerId);
  if (!me) redirect("/login");

  return (
    <AppShell
      role="Worker"
      userName={me.name}
      navItems={NAV}
      crossLink={session.isAdmin ? { href: "/admin", label: "Admin Console", icon: "◧" } : undefined}
    >
      {children}
    </AppShell>
  );
}
