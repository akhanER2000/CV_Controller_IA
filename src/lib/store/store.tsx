"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Profile } from "@/lib/cv/serialize";
import { type AppState, type PersonProfile, STORE_KEY } from "./types";
import { seedProfiles } from "./seed";

/**
 * Estado de la app en localStorage. Sin backend, sin login: funciona al instante
 * en el navegador. Cuando enchufemos Supabase, este provider se cambia por uno que
 * sincroniza — la API que consumen las pantallas no cambia.
 */
interface Ctx {
  profiles: PersonProfile[];
  current: PersonProfile;
  currentId: string;
  setCurrentId: (id: string) => void;
  updateCurrentData: (updater: (d: Profile) => Profile) => void;
  renameCurrent: (label: string) => void;
  resetCurrent: () => void;
}

const StoreContext = createContext<Ctx | null>(null);

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);

  // Carga (o siembra) al montar. Solo cliente.
  useEffect(() => {
    let initial: AppState;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) initial = JSON.parse(raw) as AppState;
      else {
        const seeded = seedProfiles();
        initial = { profiles: seeded, currentId: seeded[0]!.id };
      }
    } catch {
      const seeded = seedProfiles();
      initial = { profiles: seeded, currentId: seeded[0]!.id };
    }
    setState(initial);
  }, []);

  // Persiste en cada cambio.
  useEffect(() => {
    if (state) localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }, [state]);

  const setCurrentId = useCallback((id: string) => {
    setState((s) => (s ? { ...s, currentId: id } : s));
  }, []);

  const updateCurrentData = useCallback((updater: (d: Profile) => Profile) => {
    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        profiles: s.profiles.map((p) => (p.id === s.currentId ? { ...p, data: updater(p.data) } : p)),
      };
    });
  }, []);

  const renameCurrent = useCallback((label: string) => {
    setState((s) => {
      if (!s) return s;
      return { ...s, profiles: s.profiles.map((p) => (p.id === s.currentId ? { ...p, label } : p)) };
    });
  }, []);

  const resetCurrent = useCallback(() => {
    updateCurrentData(() => ({
      basics: { name: "", targetTitleDefault: "", contacts: [], summaries: [] },
      work: [], skills: [], education: [], projects: [], certifications: [], languages: [], variants: [],
    }));
  }, [updateCurrentData]);

  if (!state) return null; // primer render (SSR/hidratación): el provider aún no cargó localStorage

  const current = state.profiles.find((p) => p.id === state.currentId) ?? state.profiles[0]!;

  return (
    <StoreContext.Provider
      value={{ profiles: state.profiles, current, currentId: current.id, setCurrentId, updateCurrentData, renameCurrent, resetCurrent }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useProfiles(): Ctx {
  const c = useContext(StoreContext);
  if (!c) throw new Error("useProfiles debe usarse dentro de <ProfilesProvider>");
  return c;
}
