import type { Profile } from "@/lib/cv/serialize";
import { emptyProfile } from "@/lib/cv/serialize";
import type { PersonProfile } from "./types";
import example from "@/lib/cv/fixtures/datos-ejemplo.json";
import { supabaseEnabled } from "@/lib/supabase/config";

/**
 * Semilla inicial del MODO LOCAL (sin Supabase). El primer perfil trae el ejemplo
 * completo (Diego Gatica) para que la app se vea funcionando y puedas exportar un
 * CV al instante; edítalo con tus datos. El segundo está vacío, para tu pareja.
 *
 * ★ La demo SOLO existe en modo local. Con Supabase configurado, una cuenta nueva
 * arranca vacía: devolvemos un único perfil en blanco por si algo llamara a esta
 * función por error, para que JAMÁS se filtre la persona ficticia a una cuenta real.
 */
export function seedProfiles(): PersonProfile[] {
  if (supabaseEnabled) {
    return [{ id: "p1", label: "Mi perfil", data: emptyProfile("") }];
  }
  return [
    { id: "p1", label: "Mi perfil", data: example as unknown as Profile },
    { id: "p2", label: "Perfil de mi pareja", data: emptyProfile("") },
  ];
}
