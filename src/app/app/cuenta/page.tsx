import type { Metadata } from "next";
import { CuentaScreen } from "./CuentaScreen";

export const metadata: Metadata = { title: "Corpus — Perfil" };

// Página real de cuenta/perfil (antes redirigía a /app/ajustes).
// Foto de perfil (solo UI) · nombre visible · email de la cuenta · contraseña.
export default function CuentaPage() {
  return <CuentaScreen />;
}
