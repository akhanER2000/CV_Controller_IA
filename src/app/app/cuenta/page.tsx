"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfiles } from "@/lib/store/store";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";

export default function CuentaPage() {
  const { profiles, current, addProfile, deleteProfile, renameCurrent } = useProfiles();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseEnabled) return;
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? "");
        setName((data.user.user_metadata?.name as string) ?? "");
      }
    });
  }, []);

  async function saveName() {
    setMsg(null);
    const { error } = await createClient().auth.updateUser({ data: { name } });
    setMsg(error ? error.message : "Nombre actualizado.");
  }
  async function changePw() {
    setMsg(null);
    if (pw.length < 6) { setMsg("La contraseña debe tener al menos 6 caracteres."); return; }
    const { error } = await createClient().auth.updateUser({ password: pw });
    setPw("");
    setMsg(error ? error.message : "Contraseña actualizada.");
  }
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }
  async function del() {
    if (!confirm("Esto borra tu cuenta y todos tus datos. No se puede deshacer. ¿Continuar?")) return;
    const r = await fetch("/api/account/delete", { method: "POST" });
    if (r.ok) { await createClient().auth.signOut(); router.push("/"); }
    else setMsg("No se pudo borrar la cuenta.");
  }

  return (
    <div className="page">
      <header className="page__head">
        <p className="page__eyebrow">Ajustes</p>
        <h1 className="page__title">Cuenta y perfiles</h1>
      </header>

      <section className="ed__sec">
        <div className="ed__sechead">
          <h2 className="ed__h2">Perfiles</h2>
          <button className="ed__add" onClick={() => addProfile()}>+ Nuevo perfil</button>
        </div>
        {profiles.map((p) => (
          <div className="ed__row3" key={p.id}>
            <label className="field">
              <span>Perfil {p.id === current.id ? "(activo)" : ""}</span>
              <input
                value={p.id === current.id ? current.label : p.label}
                onChange={(e) => p.id === current.id && renameCurrent(e.target.value)}
                disabled={p.id !== current.id}
              />
            </label>
            <span />
            {profiles.length > 1 ? (
              <button className="ed__remove" onClick={() => deleteProfile(p.id)}>Eliminar</button>
            ) : <span />}
          </div>
        ))}
        <p className="page__foot">Cambia el perfil activo con el selector de arriba. Solo se renombra el activo.</p>
      </section>

      {supabaseEnabled ? (
        <>
          <section className="ed__sec">
            <h2 className="ed__h2">Tu cuenta</h2>
            <div className="ed__grid2">
              <label className="field"><span>Email</span><input value={email} disabled /></label>
              <label className="field"><span>Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
            </div>
            <button className="btn btn--ghost" onClick={saveName}>Guardar nombre</button>
          </section>

          <section className="ed__sec">
            <h2 className="ed__h2">Contraseña</h2>
            <label className="field" style={{ maxWidth: 360 }}>
              <span>Nueva contraseña</span>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            </label>
            <div style={{ marginTop: "var(--space-3)" }}>
              <button className="btn btn--ghost" onClick={changePw}>Cambiar contraseña</button>
            </div>
          </section>

          <section className="ed__sec">
            <h2 className="ed__h2">Sesión</h2>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <button className="btn btn--ghost" onClick={signOut}>Cerrar sesión</button>
              <button className="ed__remove" onClick={del}>Eliminar cuenta</button>
            </div>
          </section>
        </>
      ) : (
        <section className="ed__sec">
          <h2 className="ed__h2">Login</h2>
          <p className="page__sub" style={{ maxWidth: "60ch" }}>
            El login por correo y contraseña se activa cuando configuras Supabase (mira el README /
            DEPLOY.md). Por ahora la app corre solo en este navegador; tus datos viven aquí.
          </p>
        </section>
      )}

      {msg ? <p className="auth__ok" style={{ marginTop: "var(--space-4)" }}>{msg}</p> : null}
    </div>
  );
}
