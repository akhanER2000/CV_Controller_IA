import { redirect } from "next/navigation";

// El diseño nuevo tiene la salud POR VARIANTE (/app/variantes/[id]/salud).
// /app/salud es heredada: redirige al listado de variantes.
export default function SaludPage() {
  redirect("/app/variantes");
}
