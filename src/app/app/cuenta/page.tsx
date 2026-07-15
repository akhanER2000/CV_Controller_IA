import { redirect } from "next/navigation";

// El diseño nuevo unifica la cuenta en /app/ajustes. /app/cuenta es heredada.
// (Las operaciones reales —cerrar sesión, borrar cuenta— se re-cablearán en la
// pantalla de ajustes al integrar el backend de settings.)
export default function CuentaPage() {
  redirect("/app/ajustes");
}
