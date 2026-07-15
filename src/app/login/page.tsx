import type { Metadata } from "next";
import { AuthScreen } from "@/components/screens/AuthScreen";

export const metadata: Metadata = { title: "Corpus — Entrar" };

// Puerta de entrada (login). Ver docs/spec/pantallas/auth.md.
// La autenticación real (Supabase) se cablea en la fase de auth conservando
// este markup y sus clases (c-btn--forge / span.c-forge).
export default function LoginPage() {
  return <AuthScreen initial="login" />;
}
