import type { Metadata } from "next";
import { EditorVarianteScreen } from "@/components/screens/EditorVarianteScreen";

export const metadata: Metadata = { title: "Corpus — Editor de variante" };

// El editor de variante — la pantalla más importante (MURO, 3 paneles, rayos-X,
// override por campo, preview que ES el PDF). Ver docs/spec/pantallas/editor-variante.md.
// El [id] se ignora como dato (maqueta): solo alimenta los enlaces por-variante.
export default async function EditorVariantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorVarianteScreen variantId={id} />;
}
