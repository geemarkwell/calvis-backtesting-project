"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const routes = [
  { href: "/", label: "Backtest", shortLabel: "BT", description: "Replay console" },
  {
    href: "/discover-problems",
    label: "Discover Problems",
    shortLabel: "DP",
    description: "Diagnose lenses",
    children: [
      { href: "/discover-problems/runs", label: "History", shortLabel: "HI", description: "" },
      { href: "/discover-problems/activity", label: "Activity", shortLabel: "AC", description: "" },
    ],
  },
  { href: "/eval-suite", label: "Eval Suite", shortLabel: "EV", description: "Test criteria" },
  { href: "/analytics", label: "Analytics", shortLabel: "AN", description: "Lens outcomes" },
];

export default function GlobalSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={collapsed ? "global-sidebar is-collapsed" : "global-sidebar"}
      aria-label="Primary navigation"
    >
      <div className="global-sidebar__brand">
        <span>C</span>
        <strong>CIE</strong>
      </div>

      <button
        className="global-sidebar__toggle"
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? "→" : "←"}
      </button>

      <nav className="global-sidebar__nav">
        {routes.map((route) => {
          const active =
            route.href === "/"
              ? pathname === "/"
              : pathname === route.href || pathname.startsWith(`${route.href}/`);

          return (
            <div className="global-sidebar__group" key={route.href}>
              <Link
                className={active ? "global-sidebar__link is-active" : "global-sidebar__link"}
                href={route.href}
                title={collapsed ? route.label : undefined}
              >
                <b>{route.shortLabel}</b>
                <span>{route.label}</span>
                <small>{route.description}</small>
              </Link>
              {route.children && !collapsed && active && (
                <div className="global-sidebar__children">
                  {route.children.map((child) => {
                    const childActive = pathname === child.href;
                    return (
                      <Link
                        className={childActive ? "global-sidebar__child-link is-active" : "global-sidebar__child-link"}
                        href={child.href}
                        key={child.href}
                      >
                        <b>{child.shortLabel}</b>
                        <span>{child.label}</span>
                        {child.description && <small>{child.description}</small>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <Link
        className="global-sidebar__debug-link"
        href="/?debug=1"
        title={collapsed ? "Debug" : undefined}
      >
        <b>DG</b>
        <span>DEBUG</span>
        <small>Manual controls</small>
      </Link>
    </aside>
  );
}
