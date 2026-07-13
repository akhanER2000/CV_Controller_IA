import type { Profile } from "@/lib/cv/serialize";
import { emptyProfile } from "@/lib/cv/serialize";
import type { PersonProfile } from "./types";
import example from "@/lib/cv/fixtures/datos-ejemplo.json";

/**
 * Semilla inicial: dos perfiles. El primero trae el ejemplo completo (para que se
 * vea funcionando y puedas exportar un CV al instante); edítalo con tus datos. El
 * segundo está vacío, para tu pareja.
 */
export function seedProfiles(): PersonProfile[] {
  return [
    { id: "p1", label: "Mi perfil", data: example as unknown as Profile },
    { id: "p2", label: "Perfil de mi pareja", data: emptyProfile("") },
  ];
}
