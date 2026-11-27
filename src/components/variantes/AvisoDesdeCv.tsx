"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import "./aviso-desde-cv.css";

/* ============================================================================
   El aviso al abrir el editor de una variante recién creada desde el CV anterior
   (DA-V7): «Variante creada desde tu CV anterior: N items, M nuevos en tu master».
   La puerta deja los números en sessionStorage; esto los lee UNA vez y los
   borra. Va junto al editor (en su page.tsx), no dentro: el editor no se toca.
   ============================================================================ */

export const CLAVE_AVISO_DESDE_CV = "corpus.desdeCv";

export function AvisoDesdeCv({ variantId }: { variantId: string }) {
  const t = useT();
  const [datos, setDatos] = useState<{ items: number; nuevos: number } | null>(null);

  useEffect(() => {
    try {
      const clave = `${CLAVE_AVISO_DESDE_CV}.${variantId}`;
      const crudo = window.sessionStorage.getItem(clave);
      if (!crudo) return;
      window.sessionStorage.removeItem(clave);
      const j = JSON.parse(crudo) as { items?: unknown; nuevos?: unknown };
      setDatos({ items: Number(j.items) || 0, nuevos: Number(j.nuevos) || 0 });
    } catch {
      /* sin sessionStorage o dato roto: sin aviso */
    }
  }, [variantId]);

  if (!datos) return null;
  return (
    <div className="aviso-desde-cv" role="status" data-testid="aviso-desde-cv">
      <span>
        {t("variantes.cv.aviso").replace("{n}", String(datos.items)).replace("{m}", String(datos.nuevos))}
      </span>
      <button type="button" className="aviso-desde-cv-x" aria-label={t("variantes.cv.avisoCerrar")} onClick={() => setDatos(null)}>
        ×
      </button>
    </div>
  );
}
