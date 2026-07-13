"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/cv/serialize";
import { emptyProfile } from "@/lib/cv/serialize";
import { type AppState, type PersonProfile, STORE_KEY } from "./types";
import { seedProfiles } from "./seed";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";

/**
 * Estado de la app. DOBLE MODO, transparente para las pantallas:
 *  - Sin Supabase → localStorage (sin login, funciona al instante).
 *  - Con Supabase → una fila jsonb por usuario en `user_state` (RLS por usuario).
 * La API que consumen las pantallas es idéntica en ambos modos.
 */
interface Ctx {
  profiles: PersonProfile[];
  current: PersonProfile;
  currentId: string;
  setCurrentId: (id: string) => void;
  updateCurrentData: (updater: (d: Profile) => Profile) => void;
  renameCurrent: (label: string) => void;
  addProfile: (label?: string) => void;
  deleteProfile: (id: string) => void;
}

const StoreContext = createContext<Ctx | null>(null);
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.round(Math.random() * 1e6)}`);

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const supaRef = useRef<ReturnType<typeof createClient> | null>(null);
  const loaded = useRef(false);

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      if (supabaseEnabled) {
        const supa = createClient();
        supaRef.current = supa;
        const { data: { user } } = await supa.auth.getUser();
        let initial: AppState;
        if (user) {
          const { data } = await supa.from("user_state").select("state").eq("user_id", user.id).maybeSingle();
          const saved = data?.state as AppState | undefined;
          if (saved?.profiles?.length) {
            initial = saved;
          } else {
            const name = (user.user_metadata?.name as string) || "";
            initial = { profiles: [{ id: "p1", label: name || "Mi perfil", data: emptyProfile(name) }], currentId: "p1" };
            await supa.from("user_state").upsert({ user_id: user.id, state: initial });
          }
        } else {
          // El middleware debería haber redirigido; estado mínimo por seguridad.
          initial = { profiles: [{ id: "p1", label: "Mi perfil", data: emptyProfile("") }], currentId: "p1" };
        }
        if (active) { setState(initial); loaded.current = true; }
      } else {
        let initial: AppState;
        try {
          const raw = localStorage.getItem(STORE_KEY);
          if (raw) initial = JSON.parse(raw) as AppState;
          else { const s = seedProfiles(); initial = { profiles: s, currentId: s[0]!.id }; }
        } catch {
          const s = seedProfiles();
          initial = { profiles: s, currentId: s[0]!.id };
        }
        if (active) { setState(initial); loaded.current = true; }
      }
    })();
    return () => { active = false; };
  }, []);

  // ── Persistencia ──────────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state || !loaded.current) return;
    if (supabaseEnabled) {
      const supa = supaRef.current;
      if (!supa) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const { data: { user } } = await supa.auth.getUser();
        if (user) await supa.from("user_state").upsert({ user_id: user.id, state, updated_at: new Date().toISOString() });
      }, 700);
    } else {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    }
  }, [state]);

  const setCurrentId = useCallback((id: string) => setState((s) => (s ? { ...s, currentId: id } : s)), []);

  const updateCurrentData = useCallback((updater: (d: Profile) => Profile) => {
    setState((s) => s ? { ...s, profiles: s.profiles.map((p) => (p.id === s.currentId ? { ...p, data: updater(p.data) } : p)) } : s);
  }, []);

  const renameCurrent = useCallback((label: string) => {
    setState((s) => s ? { ...s, profiles: s.profiles.map((p) => (p.id === s.currentId ? { ...p, label } : p)) } : s);
  }, []);

  const addProfile = useCallback((label = "Nuevo perfil") => {
    setState((s) => {
      if (!s) return s;
      const p: PersonProfile = { id: uid(), label, data: emptyProfile("") };
      return { profiles: [...s.profiles, p], currentId: p.id };
    });
  }, []);

  const deleteProfile = useCallback((id: string) => {
    setState((s) => {
      if (!s || s.profiles.length <= 1) return s; // nunca dejar cero perfiles
      const profiles = s.profiles.filter((p) => p.id !== id);
      const currentId = s.currentId === id ? profiles[0]!.id : s.currentId;
      return { profiles, currentId };
    });
  }, []);

  if (!state) return null;
  const current = state.profiles.find((p) => p.id === state.currentId) ?? state.profiles[0]!;

  return (
    <StoreContext.Provider
      value={{ profiles: state.profiles, current, currentId: current.id, setCurrentId, updateCurrentData, renameCurrent, addProfile, deleteProfile }}
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
