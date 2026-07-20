import { Aurora } from "@/components/Aurora";
import { UserMenu } from "@/components/UserMenu";

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
 * · <UserMenu> — avatar + toggles idioma/tema + menú Perfil · Ajustes · Cerrar
 *   sesión, fijo arriba a la derecha; su CSS oculta los .hd-av/.hd-lang
 *   estáticos de cada pantalla.
 *
 * La protección de sesión la hace el middleware de Supabase.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Aurora />
      <UserMenu />
      {children}
    </>
  );
}
