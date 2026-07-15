import { ProfilesProvider } from "@/lib/store/store";

/*
 * Layout del área /app durante el rediseño.
 *
 * El AppShell viejo (chrome dorado) se retira: en el diseño nuevo cada pantalla
 * renderiza su propio <header class="c-header"> (no hay un shell persistente).
 * Se conserva ProfilesProvider para que las pantallas viejas todavía-no-portadas
 * (dashboard, master, staging…) sigan compilando hasta su reconstrucción.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ProfilesProvider>{children}</ProfilesProvider>;
}
