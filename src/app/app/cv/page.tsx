import { redirect } from "next/navigation";

// El diseño nuevo muestra el documento (PDF + rayos-X del ATS) dentro del editor
// de variante. /app/cv es heredada: redirige a las variantes.
export default function CvPage() {
  redirect("/app/variantes");
}
