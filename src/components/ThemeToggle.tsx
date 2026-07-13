"use client";

import { useEffect, useState } from "react";

/**
 * Obsidiana (oscuro, por defecto) ⇄ Porcelana (claro).
 * tokens.css activa el tema claro con [data-theme="porcelain"]; sin atributo =
 * obsidiana. Persistimos la elección en localStorage.
 */
export function ThemeToggle() {
  const [porcelain, setPorcelain] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("corpus-theme");
    if (saved === "porcelain") {
      document.documentElement.setAttribute("data-theme", "porcelain");
      setPorcelain(true);
    }
  }, []);

  function toggle() {
    const el = document.documentElement;
    const next = el.getAttribute("data-theme") === "porcelain" ? "obsidian" : "porcelain";
    if (next === "porcelain") el.setAttribute("data-theme", "porcelain");
    else el.removeAttribute("data-theme");
    localStorage.setItem("corpus-theme", next);
    setPorcelain(next === "porcelain");
  }

  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-pressed={porcelain}>
      {porcelain ? "Obsidiana" : "Porcelana"}
    </button>
  );
}
