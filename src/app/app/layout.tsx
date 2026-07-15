/*
 * Layout del área /app en el diseño nuevo.
 *
 * Cada pantalla es autocontenida y renderiza su propio <header class="c-header">.
 * Ya no hay AppShell ni store global de perfiles: las pantallas son maquetas con
 * datos locales hasta que se cablee el backend (Fases 2+). Este layout es un
 * pass-through; la protección de sesión la hace el middleware de Supabase.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
