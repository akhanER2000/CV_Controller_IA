"use client";

/* ============================================================================
   BarraSuperior — la barra del shell (Forja v2): RUTA · BÚSQUEDA · USUARIO.

   · Ruta: "Corpus / Variantes / La variante" y el nombre de la sección en grande.
     Los nombres salen del mismo mapa que el botón volver (Breadcrumb.backLabelKey)
     para que una pantalla no se llame de dos maneras.
   · Búsqueda: "Ir a…" salta entre destinos sin pasar por el lateral (menos clics).
     Ctrl/⌘+K la enfoca desde cualquier pantalla. Busca DESTINOS, no contenido:
     buscar dentro del master es trabajo de la pantalla Master, no del shell.
   · Usuario: el menú de cuenta (CuentaMenu, en UserMenu.tsx).

   Va en el flujo (no fija): las pantallas siguen teniendo su <header> pegajoso
   con top: var(--header-h), y una barra fija encima lo taparía (DA-SV2).
   ============================================================================ */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLang, useT } from "@/lib/i18n";
import { backLabelKey } from "@/components/Breadcrumb";
import { CuentaMenu } from "@/components/UserMenu";
import { Icono } from "./Icono";

type Destino = { href: string; key: string };

const DESTINOS: Destino[] = [
  { href: "/app", key: "nav.panel" },
  { href: "/app/master", key: "nav.master" },
  { href: "/app/staging", key: "nav.staging" },
  { href: "/app/variantes", key: "nav.variantes" },
  { href: "/app/fuentes", key: "nav.fuentes" },
  { href: "/app/importar", key: "nav.importar" },
  { href: "/app/ajustes", key: "nav.ajustes" },
  { href: "/app/cuenta", key: "nav.cuenta" },
];

const TXT = {
  es: { ir: "Ir a…", aria: "Ir a una pantalla", nada: "Sin destinos con ese nombre", ruta: "Ruta" },
  en: { ir: "Go to…", aria: "Go to a screen", nada: "No screen with that name", ruta: "Path" },
} as const;

/** Migas de la ruta actual: /app/variantes/abc → Variantes › La variante.
 *  Una ruta fuera del mapa (p. ej. /app/muestrario) se rotula con su segmento. */
function migas(ruta: string): { href: string; key: string }[] {
  const out: { href: string; key: string }[] = [];
  const partes = ruta.split("?")[0]!.split("/").filter(Boolean); // ["app", "variantes", "abc"]
  for (let i = 2; i <= partes.length; i++) {
    const href = "/" + partes.slice(0, i).join("/");
    const key = backLabelKey(href);
    if (key !== "nav.back" && !out.some((m) => m.key === key)) out.push({ href, key });
  }
  if (out.length === 0) {
    const ultimo = partes[partes.length - 1];
    out.push(partes.length > 1 && ultimo ? { href: ruta, key: `=${ultimo}` } : { href: "/app", key: "nav.panel" });
  }
  return out;
}

const normal = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function BarraSuperior() {
  const ruta = usePathname() || "/app";
  const router = useRouter();
  const t = useT();
  const { lang } = useLang();
  const tx = TXT[lang === "en" ? "en" : "es"];
  const lista = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState(false);
  const [activo, setActivo] = useState(0);

  const m = migas(ruta);
  // "=segmento" = sin clave i18n: se muestra el segmento tal cual, con mayúscula.
  const rotulo = (key: string) =>
    key.startsWith("=") ? key.charAt(1).toUpperCase() + key.slice(2) : t(key);
  const actual = m[m.length - 1]!;

  const opciones = useMemo(() => {
    const n = normal(q.trim());
    return DESTINOS.filter((d) => !n || normal(t(d.key)).includes(n));
  }, [q, t]);

  useEffect(() => {
    function atajo(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setAbierta(true);
      }
    }
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, []);

  // Al navegar, la búsqueda se vacía y se cierra.
  useEffect(() => {
    setQ("");
    setAbierta(false);
  }, [ruta]);

  function ir(d: Destino | undefined) {
    if (!d) return;
    setAbierta(false);
    setQ("");
    input.current?.blur();
    router.push(d.href);
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierta(true);
      setActivo((a) => (opciones.length ? (a + 1) % opciones.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => (opciones.length ? (a - 1 + opciones.length) % opciones.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ir(opciones[activo] ?? opciones[0]);
    } else if (e.key === "Escape") {
      setAbierta(false);
      input.current?.blur();
    }
  }

  return (
    <div className="tb-barra">
      <div className="tb-ruta">
        <nav aria-label={tx.ruta} className="tb-migas">
          <Link href="/app">Corpus</Link>
          {m.map((x, i) => (
            <span key={x.href}>
              <span className="tb-sep" aria-hidden="true">
                /
              </span>
              {i === m.length - 1 ? (
                <span aria-current="page">{rotulo(x.key)}</span>
              ) : (
                <Link href={x.href}>{rotulo(x.key)}</Link>
              )}
            </span>
          ))}
        </nav>
        <p className="tb-titulo">{rotulo(actual.key)}</p>
      </div>

      <div className="tb-buscar" data-abierta={abierta || undefined}>
        <Icono nombre="buscar" className="tb-lupa" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label={tx.aria}
          aria-expanded={abierta}
          aria-controls={lista}
          aria-autocomplete="list"
          aria-activedescendant={abierta && opciones[activo] ? `${lista}-${activo}` : undefined}
          placeholder={tx.ir}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActivo(0);
            setAbierta(true);
          }}
          onFocus={() => setAbierta(true)}
          onBlur={() => setTimeout(() => setAbierta(false), 120)}
          onKeyDown={teclado}
        />
        <kbd className="tb-kbd" aria-hidden="true">
          Ctrl K
        </kbd>
        {abierta ? (
          <ul id={lista} role="listbox" className="tb-lista" aria-label={tx.aria}>
            {opciones.length === 0 ? (
              <li className="tb-nada" role="presentation">
                {tx.nada}
              </li>
            ) : (
              opciones.map((d, i) => (
                <li
                  key={d.href}
                  id={`${lista}-${i}`}
                  role="option"
                  aria-selected={i === activo}
                  className="tb-op"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    ir(d);
                  }}
                  onMouseEnter={() => setActivo(i)}
                >
                  {t(d.key)}
                  <span className="tb-op-ruta">{d.href.replace("/app", "") || "/"}</span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      <CuentaMenu />
    </div>
  );
}
