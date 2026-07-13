"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfiles } from "@/lib/store/store";

const NAV = [
  { href: "/app", label: "Panel" },
  { href: "/app/master", label: "Master" },
  { href: "/app/cv", label: "CV" },
];

function toggleTheme() {
  const el = document.documentElement;
  const next = el.getAttribute("data-theme") === "porcelain" ? "obsidian" : "porcelain";
  if (next === "porcelain") el.setAttribute("data-theme", "porcelain");
  else el.removeAttribute("data-theme");
  try { localStorage.setItem("corpus-theme", next); } catch { /* noop */ }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profiles, currentId, setCurrentId } = useProfiles();
  const path = usePathname();

  return (
    <div className="shell">
      <header className="shell__top">
        <Link href="/app" className="shell__brand">Corpus</Link>
        <nav className="shell__nav">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`shell__link${path === n.href ? " is-active" : ""}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="shell__right">
          <label className="shell__switch">
            <span>Perfil</span>
            <select value={currentId} onChange={(e) => setCurrentId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="shell__theme" onClick={toggleTheme} aria-label="Cambiar tema">◐</button>
        </div>
      </header>
      <main className="shell__main c-wall">{children}</main>
    </div>
  );
}
