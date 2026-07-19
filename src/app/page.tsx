import { listTemplates } from "@/lib/cv/templates";
import { LandingScreen, type TemplateSummary } from "@/components/landing/LandingScreen";

/* ============================================================================
   `/` — la puerta pública. Antes redirigía a /login porque no había producto que
   enseñar; ahora sí lo hay. El dashboard sigue viviendo en /app y el middleware
   no toca `/` (su matcher es ["/app/:path*", "/login", "/signup"]), así que esta
   ruta se sirve a cualquiera sin sesión y sin cambiar nada del control de acceso.

   Este componente es de SERVIDOR a propósito: el catálogo de plantillas se lee
   aquí, en tiempo de build, y baja a la landing como números YA CONTADOS. Es la
   única forma honesta de titular "N plantillas" — si el catálogo crece o encoge,
   el titular cambia con él, y nadie puede escribir a mano una cifra que luego no
   cuadre con el producto.
   ============================================================================ */

export default function Home() {
  const all = listTemplates();
  const templates: TemplateSummary = {
    total: all.length,
    ats: all.filter((t) => t.gama === "ats").length,
    visual: all.filter((t) => t.gama === "visual").length,
    items: all.map((t) => ({ id: t.id, name: t.name, gama: t.gama })),
  };

  return <LandingScreen templates={templates} />;
}
