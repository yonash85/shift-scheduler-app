"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export default function AppShell({
  role,
  userName,
  navItems,
  crossLink,
  children,
}: {
  role: "Admin" | "Worker";
  userName: string;
  navItems: NavItem[];
  crossLink?: NavItem;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <nav className="w-[196px] shrink-0 bg-surface border-r border-border flex flex-col p-2.5 sticky top-0 h-screen">
        <div className="flex items-center gap-2 px-2 pb-4 pt-1.5">
          <div className="w-[26px] h-[26px] rounded-[7px] bg-accent text-accent-ink flex items-center justify-center font-bold text-[13px] shrink-0">
            S
          </div>
          <div>
            <div className="font-semibold text-[13.5px] text-text">Shift Scheduler</div>
            <div className="text-[10.5px] uppercase tracking-wide text-text-muted">Support Team</div>
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wide text-text-muted px-2.5 pt-1 pb-1">{role}</div>
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[13px] ${
                  active ? "bg-accent-soft text-accent-strong font-semibold" : "text-text hover:bg-surface-2"
                }`}
              >
                <span className="w-4 text-center opacity-85 text-[13px]">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
        {crossLink && (
          <div className="mt-2 pt-2 border-t border-border">
            <Link
              href={crossLink.href}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[13px] text-text hover:bg-surface-2"
            >
              <span className="w-4 text-center opacity-85 text-[13px]">{crossLink.icon}</span>
              {crossLink.label}
            </Link>
          </div>
        )}
        <div className="mt-auto pt-2.5 border-t border-border px-1">
          <div className="text-[12px] text-text px-1.5 py-1 truncate">{userName}</div>
          <form action={logout}>
            <button type="submit" className="w-full text-left text-[12px] text-text-muted px-1.5 py-1 hover:text-text">
              Log out
            </button>
          </form>
        </div>
      </nav>
      <main className="flex-1 min-w-0">
        <div className="max-w-[1180px] px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
