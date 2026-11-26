import { Aurora } from "@/components/Aurora";
import { UserMenu } from "@/components/UserMenu";
import { IngestaEnCurso } from "@/components/IngestaEnCurso";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { Transicion } from "@/components/ui/Transicion";
import "@/components/ui/ui.css";

/*
 * Layout del área /app.
 *
 * El motor de i18n (<LangProvider>) vive en el layout RAÍZ (src/app/layout.tsx)
 * para envolver toda la app —incluidas las rutas de auth, que también usan
 * useT()—, así que aquí NO se vuelve a montar.
 *
 * Aquí viven las dos piezas persistentes del área autenticada:
 *
 * · <Aurora> — EL ÚNICO MONTAJE del fondo vivo para las diez pantallas (Panel ·
 *   Master · Variantes · Editor · Staging · Tailoring · Salud · Fuentes ·
 *   Importar · Ajustes). La atmósfera no es una decoración por pantalla: está
 *   siempre. Lo que cambia entre pestañas es la INTENSIDAD, que cada pantalla
 *   declara con <AuroraTune> (0.55 al hojear · 0.22 en trabajo denso), y la
 *   SUPERFICIE sobre la que vive el contenido (.c-wall / .c-panel).
 *   Montarla aquí una vez —en lugar de diez veces en diez pantallas— es lo que
 *   evita el baile de pause/resume: una razón pausada y nunca levantada dejaba
 *   el fondo congelado toda la sesión, y eso ya pasó de verdad.
 *   Si alguna pantalla vuelve a montar <Aurora> por su cuenta, sobra: quítala.
 *
 * · <UserMenu> — EL LATERAL del shell (rediseño "Forja"): navegación principal,
 *   identidad con su menú Perfil · Ajustes · Cerrar sesión, la tarjeta «Una
 *   oferta nueva» y los toggles de idioma y tema. Su CSS oculta la nav, el logo
 *   y los .hd-av/.hd-lang estáticos que cada pantalla pinta en su <header>, y
 *   .sh-main desplaza el contenido lo que ocupa el lateral.
 *
 * · <IngestaEnCurso> — el trabajo de ingesta, visible desde CUALQUIER pantalla.
 *   Va aquí y no en Importar porque la promesa del producto es que cambiar de
 *   pantalla no cancela nada: si el indicador viviera solo en la pantalla que
 *   lanzó la ingesta, salir de ella sería quedarse sin saber si sigue viva. Y
 *   hay una segunda razón, menos obvia y más importante: este componente es
 *   también el que RETOMA el trabajo cuando una invocación se queda sin
 *   presupuesto (ver lib/ingesta/useIngesta.ts). Montado en el shell, la ingesta
 *   avanza mientras el usuario navega por donde quiera.
 *   No pinta nada cuando no hay trabajo en marcha.
 *
 * · <BarraSuperior> — Forja v2: ruta, «Ir a…» (Ctrl/⌘+K) y la cuenta. Va en
 *   el flujo de .sh-main, encima de la pantalla, no fija (DA-SV2).
 * · <Transicion> — la entrada de cada página (clave = ruta; sin movimiento con
 *   prefers-reduced-motion).
 *
 * La protección de sesión la hace el middleware de Supabase.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Aurora />
      <UserMenu />
      <IngestaEnCurso />
      {/* .sh-main desplaza cada pantalla lo que ocupa el lateral (UserMenu.css). */}
      <div className="sh-main">
        <BarraSuperior />
        <Transicion>{children}</Transicion>
      </div>
    </>
  );
}
