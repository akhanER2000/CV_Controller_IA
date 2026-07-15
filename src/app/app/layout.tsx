import { LangProvider } from "@/lib/i18n";
import { UserMenu } from "@/components/UserMenu";

/*
 * Layout del área /app.
 *
 * Cada pantalla es autocontenida y renderiza su propio <header class="c-header">
 * con un avatar estático de maqueta. Aquí montamos DOS piezas persistentes que
 * viven una sola vez para toda el área:
 *
 *   · <LangProvider> — el motor de i18n. Cambiar el idioma re-renderiza en vivo
 *     cualquier pantalla que consuma useT()/useLang(). Idioma inicial: 'es'
 *     (default de user_settings); el provider lo reconcilia con la sesión.
 *   · <UserMenu> — avatar + toggles (idioma/tema) + menú (Perfil · Ajustes ·
 *     Cerrar sesión), fijo arriba a la derecha. Su CSS oculta los .hd-av/.hd-lang
 *     estáticos y duplicados de cada pantalla.
 *
 * La protección de sesión la sigue haciendo el middleware de Supabase.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <UserMenu />
      {children}
    </LangProvider>
  );
}
