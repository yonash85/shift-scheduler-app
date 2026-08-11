import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getWorkerById } from "@/lib/data";
import AppShell from "@/components/AppShell";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "◧" },
  { href: "/admin/people", label: "People", icon: "◐" },
  { href: "/admin/rules", label: "Rules", icon: "≣" },
  { href: "/admin/availability", label: "Availability", icon: "▦" },
  { href: "/admin/notes", label: "Notes", icon: "✎" },
  { href: "/admin/history", label: "History", icon: "◷" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/me");
  const me = await getWorkerById(session.workerId);

  return (
    <AppShell role="Admin" userName={me?.name ?? "Admin"} navItems={NAV} crossLink={{ href: "/me", label: "My Schedule", icon: "▦" }}>
      {children}
    </AppShell>
  );
}
