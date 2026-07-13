import { ProfilesProvider } from "@/lib/store/store";
import { AppShell } from "@/components/AppShell";

// El shell autenticado-en-el-futuro. Hoy sin login: el provider carga los perfiles
// desde localStorage. Cuando enchufemos Supabase, este provider se sustituye.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProfilesProvider>
      <AppShell>{children}</AppShell>
    </ProfilesProvider>
  );
}
