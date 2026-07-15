"use client";

/* ============================================================================
   Cuenta / Perfil — /app/cuenta (antes un redirect a /app/ajustes; ahora la
   página real). Gestiona lo que ES de la cuenta, no del CV:

     · Foto de perfil (bucket privado 'avatars', SOLO para el menú — nunca al CV)
     · Nombre visible (user_settings.display_name) y email de la cuenta
     · Cambio de contraseña (solo si la cuenta es email/contraseña; si entró por
       Google/GitHub, se oculta y se explica por qué)

   Reutiliza el sistema de diseño (.c-header, .c-input, .c-btn, .t-overline…) y
   los textos bilingües del motor i18n (useT). Al guardar dispara el evento
   'corpus:profile-updated' para que el UserMenu del layout se refresque.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";
import { useT } from "@/lib/i18n";
import "./cuenta.css";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

function initialsFrom(name: string | null, email: string | null): string {
  const src = (name && name.trim()) || (email ? email.split("@")[0] : "");
  if (!src) return "··";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : src.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2);
  return (letters || src.slice(0, 2)).toUpperCase();
}

function notify() {
  window.dispatchEvent(new CustomEvent("corpus:profile-updated"));
}

export function CuentaScreen() {
  const t = useT();

  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isEmailProvider, setIsEmailProvider] = useState(false);

  const [name, setName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [email, setEmail] = useState("");
  const [initialEmail, setInitialEmail] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);

  const [savingId, setSavingId] = useState(false);
  const [idMsg, setIdMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!supabaseEnabled) {
      setReady(true);
      return;
    }
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setAuthed(false);
      setReady(true);
      return;
    }
    setAuthed(true);
    setUserId(user.id);
    setEmail(user.email ?? "");
    setInitialEmail(user.email ?? "");
    setIsEmailProvider(
      user.app_metadata?.provider === "email" ||
        (user.identities?.some((i) => i.provider === "email") ?? false),
    );

    const { data } = await sb
      .from("user_settings")
      .select("display_name, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();

    const dn = (data?.display_name as string | null) ?? "";
    setName(dn);
    setInitialName(dn);

    const path = (data?.avatar_url as string | null) ?? null;
    setAvatarPath(path);
    if (path) {
      const { data: signed } = await sb.storage.from("avatars").createSignedUrl(path, 3600);
      setAvatarSrc(signed?.signedUrl ?? null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Foto ──
  function pickPhoto() {
    setPhotoErr(null);
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file || !userId) return;
    setPhotoErr(null);

    if (!file.type.startsWith("image/")) {
      setPhotoErr(t("cuenta.photo.notImage"));
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setPhotoErr(t("cuenta.photo.tooBig"));
      return;
    }

    setPhotoBusy(true);
    try {
      const sb = createClient();
      const path = `${userId}/avatar`; // ruta estable; upsert sobreescribe
      const up = await sb.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;

      const patch = await sb
        .from("user_settings")
        .upsert({ user_id: userId, avatar_url: path }, { onConflict: "user_id" });
      if (patch.error) throw patch.error;

      setAvatarPath(path);
      const { data: signed } = await sb.storage.from("avatars").createSignedUrl(path, 3600);
      setAvatarSrc(signed?.signedUrl ?? null);
      notify();
    } catch {
      setPhotoErr(t("cuenta.photo.error"));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!userId || !avatarPath) return;
    setPhotoBusy(true);
    setPhotoErr(null);
    try {
      const sb = createClient();
      await sb.storage.from("avatars").remove([avatarPath]);
      await sb
        .from("user_settings")
        .upsert({ user_id: userId, avatar_url: null }, { onConflict: "user_id" });
      setAvatarPath(null);
      setAvatarSrc(null);
      notify();
    } catch {
      setPhotoErr(t("cuenta.photo.error"));
    } finally {
      setPhotoBusy(false);
    }
  }

  // ── Identidad ──
  async function saveIdentity() {
    if (!userId) return;
    setSavingId(true);
    setIdMsg(null);
    try {
      const sb = createClient();

      if (name !== initialName) {
        const r = await sb
          .from("user_settings")
          .upsert({ user_id: userId, display_name: name || null }, { onConflict: "user_id" });
        if (r.error) throw r.error;
        setInitialName(name);
      }

      let emailChanged = false;
      if (email && email !== initialEmail) {
        const r = await sb.auth.updateUser({ email });
        if (r.error) throw r.error;
        emailChanged = true;
      }

      notify();
      setIdMsg({ kind: "ok", text: emailChanged ? t("cuenta.email.confirm") : t("cuenta.saved") });
    } catch {
      setIdMsg({ kind: "err", text: t("cuenta.saveError") });
    } finally {
      setSavingId(false);
    }
  }

  // ── Contraseña ──
  async function changePassword() {
    setPwMsg(null);
    if (pw.length < 8) {
      setPwMsg({ kind: "err", text: t("cuenta.password.tooShort") });
      return;
    }
    if (pw !== pw2) {
      setPwMsg({ kind: "err", text: t("cuenta.password.mismatch") });
      return;
    }
    setPwBusy(true);
    try {
      const r = await createClient().auth.updateUser({ password: pw });
      if (r.error) throw r.error;
      setPw("");
      setPw2("");
      setPwMsg({ kind: "ok", text: t("cuenta.password.changed") });
    } catch {
      setPwMsg({ kind: "err", text: t("cuenta.saveError") });
    } finally {
      setPwBusy(false);
    }
  }

  const idDirty = name !== initialName || (email !== initialEmail && email.length > 0);
  const initials = initialsFrom(name || initialName, email || initialEmail);

  return (
    <div className="c-page">
      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <nav className="hd-nav">
            <Link href="/app">Panel</Link>
            <Link href="/app/master">Master</Link>
            <Link href="/app/variantes">Variantes</Link>
            <Link href="/app/fuentes">Fuentes</Link>
          </nav>
          <div className="hd-right" />
        </div>
      </header>

      <main className="cu-main c-wall" data-screen-label="cuenta">
        <div className="c-container cu-col">
          <h2 className="cu-title">{t("cuenta.title")}</h2>
          <p className="cu-sub">{t("cuenta.subtitle")}</p>

          {!supabaseEnabled || (ready && !authed) ? (
            <p className="cu-need">{t("cuenta.needAuth")}</p>
          ) : (
            <>
              {/* ── Foto de perfil ── */}
              <section className="cu-g" data-screen-label="cuenta-foto">
                <div className="cu-gh">
                  <span className="t-overline">{t("cuenta.photo.overline")}</span>
                </div>
                <div className="cu-rows">
                  <div className="cu-row cu-photo">
                    <div className="cu-av" aria-hidden="true">
                      {avatarSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarSrc} alt="" />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>
                    <div className="cu-photo-controls">
                      <div className="cu-photo-btns">
                        <button
                          type="button"
                          className="c-btn"
                          onClick={pickPhoto}
                          disabled={photoBusy}
                        >
                          {photoBusy ? t("cuenta.photo.uploading") : t("cuenta.photo.change")}
                        </button>
                        {avatarPath ? (
                          <button
                            type="button"
                            className="c-btn c-btn--quiet"
                            onClick={removePhoto}
                            disabled={photoBusy}
                          >
                            {t("cuenta.photo.remove")}
                          </button>
                        ) : null}
                      </div>
                      <span className="cu-hint">{t("cuenta.photo.hint")}</span>
                      {photoErr ? (
                        <span className="cu-msg cu-msg--err" role="alert">
                          {photoErr}
                        </span>
                      ) : null}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={onFile}
                    />
                  </div>
                </div>
              </section>

              {/* ── Identidad ── */}
              <section className="cu-g" data-screen-label="cuenta-identidad">
                <div className="cu-gh">
                  <span className="t-overline">{t("cuenta.identity.overline")}</span>
                </div>
                <div className="cu-rows">
                  <div className="cu-row">
                    <span className="k">
                      <b>{t("cuenta.name.label")}</b>
                      <span>{t("cuenta.name.hint")}</span>
                    </span>
                    <span className="v">
                      <input
                        className="c-input"
                        style={{ maxWidth: "320px" }}
                        aria-label={t("cuenta.name.label")}
                        placeholder={t("cuenta.name.placeholder")}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </span>
                  </div>
                  <div className="cu-row">
                    <span className="k">
                      <b>{t("cuenta.email.label")}</b>
                      <span>{t("cuenta.email.hint")}</span>
                    </span>
                    <span className="v">
                      <input
                        className="c-input"
                        type="email"
                        autoComplete="email"
                        style={{ maxWidth: "320px" }}
                        aria-label={t("cuenta.email.label")}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </span>
                  </div>
                </div>
                <div className="cu-actions">
                  <button
                    type="button"
                    className="c-btn c-btn--patina"
                    onClick={saveIdentity}
                    disabled={savingId || !idDirty}
                  >
                    {savingId ? t("cuenta.saving") : t("cuenta.save")}
                  </button>
                  {idMsg ? (
                    <span
                      className={`cu-msg ${idMsg.kind === "err" ? "cu-msg--err" : "cu-msg--ok"}`}
                      role="status"
                    >
                      {idMsg.text}
                    </span>
                  ) : null}
                </div>
              </section>

              {/* ── Contraseña (solo cuentas email/contraseña) ── */}
              <section className="cu-g" data-screen-label="cuenta-password">
                <div className="cu-gh">
                  <span className="t-overline">{t("cuenta.password.overline")}</span>
                  <span className="cu-gh-note">{t("cuenta.password.hint")}</span>
                </div>

                {isEmailProvider ? (
                  <>
                    <div className="cu-rows">
                      <div className="cu-row">
                        <span className="k">
                          <b>{t("cuenta.password.new")}</b>
                        </span>
                        <span className="v">
                          <input
                            className="c-input"
                            type="password"
                            autoComplete="new-password"
                            placeholder={t("cuenta.password.placeholder")}
                            style={{ maxWidth: "320px" }}
                            aria-label={t("cuenta.password.new")}
                            value={pw}
                            onChange={(e) => setPw(e.target.value)}
                          />
                        </span>
                      </div>
                      <div className="cu-row">
                        <span className="k">
                          <b>{t("cuenta.password.repeat")}</b>
                        </span>
                        <span className="v">
                          <input
                            className="c-input"
                            type="password"
                            autoComplete="new-password"
                            placeholder={t("cuenta.password.placeholder")}
                            style={{ maxWidth: "320px" }}
                            aria-label={t("cuenta.password.repeat")}
                            value={pw2}
                            onChange={(e) => setPw2(e.target.value)}
                          />
                        </span>
                      </div>
                    </div>
                    <div className="cu-actions">
                      <button
                        type="button"
                        className="c-btn"
                        onClick={changePassword}
                        disabled={pwBusy || pw.length === 0}
                      >
                        {pwBusy ? t("cuenta.password.changing") : t("cuenta.password.change")}
                      </button>
                      {pwMsg ? (
                        <span
                          className={`cu-msg ${pwMsg.kind === "err" ? "cu-msg--err" : "cu-msg--ok"}`}
                          role="status"
                        >
                          {pwMsg.text}
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="cu-oauth">{t("cuenta.password.oauthOnly")}</p>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
