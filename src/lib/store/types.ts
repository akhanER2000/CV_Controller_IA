import type { Profile } from "@/lib/cv/serialize";

/** Un "perfil" = una persona (yo / mi pareja), con su master y sus variantes. */
export interface PersonProfile {
  id: string;
  label: string;
  data: Profile;
}

export interface AppState {
  profiles: PersonProfile[];
  currentId: string;
}

export const STORE_KEY = "corpus.appstate.v1";
