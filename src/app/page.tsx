import { redirect } from "next/navigation";

// Fase 0: la landing pública llega en la Fase 7. Por ahora entramos por /auth,
// que es la primera impresión del producto (capa atmosférica, aurora viva).
export default function Home() {
  redirect("/auth");
}
