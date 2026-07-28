import Link from "next/link";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { NotificationsBell } from "@/features/notifications/components/notifications-bell";

export interface DashboardNavItem {
  href: string;
  label: string;
}

export function DashboardShell({
  title,
  navItems,
  userLabel,
  children,
}: {
  title: string;
  navItems: DashboardNavItem[];
  userLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Blink<span className="text-primary">Job</span>
            </Link>
            <span className="text-sm text-muted-foreground">{title}</span>
          </div>
          <div className="flex items-center gap-4">
            {userLabel && <span className="text-sm text-muted-foreground">{userLabel}</span>}
            <NotificationsBell />
            <LogoutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-4 px-4 pb-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
