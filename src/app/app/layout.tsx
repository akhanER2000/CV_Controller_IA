import { UserMenu } from "@/components/UserMenu";

/*
 * Layout del área /app.
 *
 * El motor de i18n (<LangProvider>) vive en el layout RAÍZ (src/app/layout.tsx)
 * para envolver toda la app —incluidas las rutas de auth, que también usan
 * useT()—, así que aquí NO se vuelve a montar.
 *
 * Aquí solo vive la pieza persistente del área autenticada: <UserMenu> (avatar +
 * toggles idioma/tema + menú Perfil · Ajustes · Cerrar sesión), fijo arriba a la
 * derecha; su CSS oculta los .hd-av/.hd-lang estáticos de cada pantalla.
 * La protección de sesión la hace el middleware de Supabase.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <UserMenu />
      {children}
    </>
  );
}
