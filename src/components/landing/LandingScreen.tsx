"use client";

import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import { useLang, useT } from "@/lib/i18n";
import { DemoIngesta } from "./DemoIngesta";
import { SplitAts } from "./SplitAts";
import { bi, demoProvenance } from "./demo-data";
import { useLandingMotion } from "./motion";
import "./landing.css";

/* ============================================================================
   LA LANDING · la puerta pública de Corpus (/).

   El argumento, en este orden y sin adornos:
     1 · el problema en una frase (hero);
     2 · el momento mágico: pegas un texto y el perfil se puebla (demo PREGRABADA);
     3 · ★ el split «tu PDF» ⇄ «lo que el ATS realmente lee» — el bloque
         protagonista, y lo único que nadie puede copiar sin construir el producto;
     — las tres cifras que sostienen el punto 3, cada una CON su fuente y su
       límite a la vista;
     4 · la promesa anti-alucinación;
     5 · el catálogo de plantillas (el número sale del catálogo real, no del copy);
     6 · precio honesto: la descarga siempre gratis.

   NI UN DATO INVENTADO. Las cifras citadas son las tres que están en
   prompts/00-INVESTIGACION.md, con la fuente que ahí figura, y
   tests/landing-claims.test.ts falla si alguien mete una cuarta.

   Gramática de fondo (aurora.css): las secciones de LECTURA son muro (c-wall) y
   las de respiración son ventana (c-window). El split es ventana con paneles de
   vidrio: es el bloque que se mira, no el que se lee de corrido.
   ============================================================================ */

export interface TemplateCard {
  id: string;
  name: string;
  gama: "ats" | "visual";
}

export interface TemplateSummary {
  total: number;
  ats: number;
  visual: number;
  items: TemplateCard[];
}

export function LandingScreen({ templates }: { templates: TemplateSummary }) {
  const t = useT();
  const { lang, setLang } = useLang();
  const heroRef = useLandingMotion<HTMLElement>();

  const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

  return (
    <div className="c-page ls">
      <Aurora state="calm" />

      {/* Sin JS no hay runtime de movimiento y los estados iniciales del reveal
          dejarían el texto invisible. La página se sirve entera desde el
          servidor: que se vea, aunque no se mueva. */}
      <noscript>
        <style>{`[data-reveal],[data-io]{opacity:1!important;filter:none!important;transform:none!important}`}</style>
      </noscript>

      <a className="ls-skip" href="#ls-main">
        {t("landing.skipToContent")}
      </a>

      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/">
            Corpus
          </Link>
          <nav className="hd-nav">
            <a href="#demo">{t("landing.nav.demo")}</a>
            <a href="#ats">{t("landing.nav.ats")}</a>
            <a href="#plantillas">{t("landing.nav.plantillas")}</a>
            <a href="#precio">{t("landing.nav.precio")}</a>
          </nav>
          <div className="hd-right">
            <div className="hd-lang" role="group" aria-label={t("landing.lang.aria")}>
              <button
                type="button"
                data-on={lang === "es" ? "" : undefined}
                aria-pressed={lang === "es"}
                onClick={() => setLang("es")}
              >
                ES
              </button>
              <button
                type="button"
                data-on={lang === "en" ? "" : undefined}
                aria-pressed={lang === "en"}
                onClick={() => setLang("en")}
              >
                EN
              </button>
            </div>
            <Link className="ls-hd-login" href="/login">
              {t("landing.cta.login")}
            </Link>
            <Link className="c-btn" href="/signup">
              {t("landing.cta.signup")}
            </Link>
          </div>
        </div>
      </header>

      <main id="ls-main">
        {/* ── 1 · EL PROBLEMA ──────────────────────────────────────────────── */}
        <section className="ls-hero c-window" ref={heroRef}>
          <div className="c-container ls-hero__in">
            <span className="t-overline" data-reveal>
              {t("landing.hero.overline")}
            </span>
            <h1 data-reveal style={d(90)}>
              {t("landing.hero.title")}
            </h1>
            <p className="t-lead t-muted ls-hero__lead" data-reveal style={d(200)}>
              {t("landing.hero.lead")}
            </p>
            <div className="ls-hero__cta" data-reveal style={d(320)}>
              <span className="c-forge">
                <Link className="c-btn c-btn--forge c-btn--hero" href="/signup">
                  {t("landing.hero.cta")}
                </Link>
              </span>
              <a className="c-btn c-btn--quiet c-btn--lg" href="#ats">
                {t("landing.hero.ctaAlt")} ↓
              </a>
            </div>
            <p className="ls-hero__fine" data-reveal style={d(420)}>
              {t("landing.hero.fine")}
            </p>
          </div>
        </section>

        <hr className="c-divider" data-io />

        {/* ── 2 · EL MOMENTO MÁGICO ────────────────────────────────────────── */}
        <section className="ls-sec c-wall" id="demo">
          <div className="c-container">
            <header className="ls-head" data-io data-reveal="soft">
              <span className="t-overline">{t("landing.demo.overline")}</span>
              <h2>{t("landing.demo.title")}</h2>
              <p className="t-lead t-muted">{t("landing.demo.lead")}</p>
            </header>

            <div data-io data-reveal="soft">
              <DemoIngesta />
            </div>

            <p className="ls-note" data-io data-reveal="soft">
              {t("landing.demo.disclaimer")}
            </p>
          </div>
        </section>

        <hr className="c-divider c-divider--patina" data-io />

        {/* ── 3 · ★ EL SPLIT ──────────────────────────────────────────────── */}
        <section className="ls-sec ls-sec--star c-window" id="ats">
          <div className="c-container">
            <header className="ls-head ls-head--wide" data-io data-reveal="soft">
              <span className="t-overline">{t("landing.split.overline")}</span>
              <h2 className="ls-h2--big">{t("landing.split.title")}</h2>
              <p className="t-lead t-muted">{t("landing.split.lead")}</p>
            </header>

            <div data-io data-reveal="far">
              <SplitAts />
            </div>

            <p className="ls-hint" data-io data-reveal="soft">
              {t("landing.split.hint")}
            </p>
            <p className="ls-note" data-io data-reveal="soft">
              {t("landing.split.foot")}
            </p>
          </div>
        </section>

        <hr className="c-divider" data-io />

        {/* ── LAS TRES CIFRAS (con fuente y límites) ───────────────────────── */}
        <section className="ls-sec c-wall">
          <div className="c-container">
            <header className="ls-head" data-io data-reveal="soft">
              <span className="t-overline">{t("landing.ev.overline")}</span>
              <h2>{t("landing.ev.title")}</h2>
            </header>

            <div className="ls-ev c-stagger-css">
              {(["a", "b", "c"] as const).map((k) => (
                <article className="ls-ev__c c-card" key={k} data-io data-reveal="soft">
                  <p className="ls-ev__fig t-accent">{t(`landing.ev.${k}.figure`)}</p>
                  <p className="ls-ev__claim">{t(`landing.ev.${k}.claim`)}</p>
                  <p className="ls-ev__src">
                    <span className="t-overline">{t("landing.ev.sourceLabel")}</span>
                    {t(`landing.ev.${k}.source`)}
                  </p>
                  <p className="ls-ev__caveat">
                    <span className="t-overline">{t("landing.ev.caveatLabel")}</span>
                    {t(`landing.ev.${k}.caveat`)}
                  </p>
                </article>
              ))}
            </div>

            <p className="ls-note" data-io data-reveal="soft">
              {t("landing.ev.foot")}
            </p>
          </div>
        </section>

        <hr className="c-divider" data-io />

        {/* ── 4 · ANTI-ALUCINACIÓN ─────────────────────────────────────────── */}
        <section className="ls-sec c-wall">
          <div className="c-container">
            <header className="ls-head ls-head--wide" data-io data-reveal="soft">
              <span className="t-overline">{t("landing.anti.overline")}</span>
              <h2 className="ls-h2--big">{t("landing.anti.title")}</h2>
              <p className="t-lead t-muted">{t("landing.anti.lead")}</p>
            </header>

            <div className="ls-anti">
              <div className="ls-anti__cards c-stagger-css">
                {(["a", "b", "c"] as const).map((k) => (
                  <article className="ls-anti__c c-card" key={k} data-io data-reveal="soft">
                    <h3>{t(`landing.anti.${k}.title`)}</h3>
                    <p className="t-muted">{t(`landing.anti.${k}.body`)}</p>
                  </article>
                ))}
              </div>

              <div className="ls-prov" data-io data-reveal="soft">
                <span className="t-overline">{t("landing.anti.exampleTitle")}</span>
                {demoProvenance.map((p, i) => (
                  <div
                    className={`ls-prov__i c-card${p.ver === "none" ? " c-noev" : " c-override"}`}
                    key={i}
                  >
                    <p className="ls-prov__txt">{bi(p.text, lang)}</p>
                    <div className="ls-prov__meta">
                      <span className={`c-ver c-ver--${p.ver}`}>
                        {p.ver === "ok" ? t("landing.demo.verOk") : t("landing.anti.verNone")}
                      </span>
                      <span className="ls-prov__src">{bi(p.origin, lang)}</span>
                    </div>
                    {p.fragment ? (
                      <p className="ls-prov__frag">{bi(p.fragment, lang)}</p>
                    ) : null}
                  </div>
                ))}
                <p className="ls-note ls-note--tight">{t("landing.anti.exampleNote")}</p>
              </div>
            </div>
          </div>
        </section>

        <hr className="c-divider" data-io />

        {/* ── 5 · EL CATÁLOGO ─────────────────────────────────────────────── */}
        <section className="ls-sec c-wall c-wall--surface" id="plantillas">
          <div className="c-container">
            <header className="ls-head" data-io data-reveal="soft">
              <span className="t-overline">{t("landing.tpl.overline")}</span>
              {/* El número sale de listTemplates() en tiempo de build: si el
                  catálogo cambia, el titular cambia con él. */}
              <h2>{t("landing.tpl.title").replace("{n}", String(templates.total))}</h2>
              <p className="t-lead t-muted">{t("landing.tpl.lead")}</p>
              <p className="ls-tpl__count t-data t-subtle">
                {t("landing.tpl.count")
                  .replace("{a}", String(templates.ats))
                  .replace("{b}", String(templates.visual))}
              </p>
            </header>

            <ul className="ls-tpl" data-io data-reveal="soft">
              {templates.items.map((tpl) => (
                <li className={`c-chip ls-tpl__i${tpl.gama === "ats" ? " c-chip--ok" : ""}`} key={tpl.id}>
                  <span className="dot" />
                  <b>{tpl.name}</b>
                  <span className="t-subtle">
                    {tpl.gama === "ats" ? t("landing.tpl.atsLabel") : t("landing.tpl.visualLabel")}
                  </span>
                </li>
              ))}
            </ul>

            <div className="ls-tpl__notes" data-io data-reveal="soft">
              <p className="ls-note ls-note--tight">{t("landing.tpl.warn")}</p>
              <p className="ls-note ls-note--tight">{t("landing.tpl.same")}</p>
            </div>
          </div>
        </section>

        <hr className="c-divider" data-io />

        {/* ── 6 · PRECIO ──────────────────────────────────────────────────── */}
        <section className="ls-sec c-wall" id="precio">
          <div className="c-container">
            <header className="ls-head" data-io data-reveal="soft">
              <span className="t-overline">{t("landing.price.overline")}</span>
              <h2>{t("landing.price.title")}</h2>
            </header>

            <ul className="ls-price c-stagger-css">
              {(["a", "b", "c", "d"] as const).map((k) => (
                <li className="ls-price__i" key={k} data-io data-reveal="soft">
                  <span className="c-pulse-dot" />
                  {t(`landing.price.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <hr className="c-divider c-divider--patina" data-io />

        {/* ── CIERRE ──────────────────────────────────────────────────────── */}
        <section className="ls-sec ls-end c-window">
          <div className="c-container ls-end__in" data-io data-reveal="soft">
            <h2 className="ls-h2--big">{t("landing.end.title")}</h2>
            <p className="t-lead t-muted">{t("landing.end.lead")}</p>
            <div className="ls-hero__cta">
              <span className="c-forge">
                <Link className="c-btn c-btn--forge c-btn--hero" href="/signup">
                  {t("landing.end.cta")}
                </Link>
              </span>
              <Link className="c-btn c-btn--quiet c-btn--lg" href="/login">
                {t("landing.end.alt")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="ls-footer c-wall">
        <div className="c-container">
          <hr className="c-divider" data-io />
          <div className="ls-footer__in">
            <div>
              <span className="c-logo">Corpus</span>
              <p className="t-muted ls-footer__claim">{t("landing.footer.claim")}</p>
            </div>
            <nav className="ls-footer__nav">
              <Link href="/login">{t("landing.cta.login")}</Link>
              <Link href="/signup">{t("landing.cta.signup")}</Link>
            </nav>
          </div>
          <p className="ls-note ls-note--tight">{t("landing.footer.sources")}</p>
        </div>
      </footer>
    </div>
  );
}
