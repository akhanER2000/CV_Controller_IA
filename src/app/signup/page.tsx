import type { Metadata } from "next";
import { AuthScreen } from "@/components/screens/AuthScreen";

export const metadata: Metadata = { title: "Corpus — Crear cuenta" };

// La misma pantalla de auth, en modo signup. Ver docs/spec/pantallas/auth.md.
export default function SignupPage() {
  return <AuthScreen initial="signup" />;
}
