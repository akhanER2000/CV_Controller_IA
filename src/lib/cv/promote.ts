import type { Profile, StagedItem } from "@/lib/cv/serialize";

/**
 * Promoción de un item de staging al master. Es el ÚNICO camino por el que un
 * dato entra al master: nada se guarda sin que el usuario acepte (ni siquiera lo
 * que viene de una API). Además de escribir en el master, enlaza el nuevo id en
 * las variantes — sin ese enlace, el item nunca aparecería en el CV/PDF.
 */

const uid = (p = "id") => `${p}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

const SEC_ORDER = ["skills", "work", "education", "projects", "certifications", "languages"];

function linkIntoVariants(d: Profile, type: string, id: string) {
  for (const v of d.variants) {
    const secs = v.sections ?? (v.sections = []);
    let sec = secs.find((s) => s.type === type);
    if (!sec) { sec = { type, order: [] }; secs.push(sec); }
    if (!sec.order.includes(id)) sec.order.push(id);
    secs.sort((a, b) => SEC_ORDER.indexOf(a.type) - SEC_ORDER.indexOf(b.type));
  }
}

export function promote(d: Profile, item: StagedItem): Profile {
  const nd = structuredClone(d);
  const pl = item.payload as Record<string, unknown>;

  if (item.section === "basics") {
    if (pl.name) nd.basics.name = String(pl.name);
    if (pl.targetTitleDefault) {
      nd.basics.targetTitleDefault = String(pl.targetTitleDefault);
      for (const v of nd.variants) if (!v.targetTitle) v.targetTitle = String(pl.targetTitleDefault);
    }
    const incoming = (pl.contacts as { type: string; label: string; value: string; visible: boolean }[]) ?? [];
    for (const c of incoming) {
      if (!nd.basics.contacts.some((x) => x.value === c.value)) nd.basics.contacts.push(c);
    }
  } else if (item.section === "summary") {
    const id = uid("sum");
    nd.basics.summaries.push({ id, text: String(pl.text ?? item.preview) });
    for (const v of nd.variants) if (!v.summaryRef) v.summaryRef = id;
  } else if (item.section === "work") {
    const id = uid("w");
    nd.work.push({
      id, title: String(pl.title ?? ""), orgLegal: String(pl.orgLegal ?? ""), location: String(pl.location ?? ""),
      start: String(pl.start ?? ""), end: (pl.end as string | null) ?? null, current: Boolean(pl.current),
      bullets: ((pl.bullets as { text: string }[]) ?? []).map((b) => ({ id: uid("b"), text: b.text })),
    });
    linkIntoVariants(nd, "work", id);
  } else if (item.section === "education") {
    const id = uid("e");
    nd.education.push({
      id, degree: String(pl.degree ?? ""), institution: String(pl.institution ?? ""), location: String(pl.location ?? ""),
      start: String(pl.start ?? ""), end: String(pl.end ?? ""),
    });
    linkIntoVariants(nd, "education", id);
  } else if (item.section === "projects") {
    const id = uid("p");
    nd.projects.push({
      id, name: String(pl.name ?? ""), url: (pl.url as string | null) ?? null,
      start: String(pl.start ?? ""), end: (pl.end as string | null) ?? null,
      bullets: ((pl.bullets as { text: string }[]) ?? []).map((b) => ({ id: uid("b"), text: b.text })),
    });
    linkIntoVariants(nd, "projects", id);
  } else if (item.section === "skills") {
    if (Array.isArray(pl.items)) {
      const catName = String(pl.category ?? "Aptitudes");
      let cat = nd.skills.find((c) => c.category === catName);
      if (!cat) { cat = { id: uid("sk"), category: catName, items: [] }; nd.skills.push(cat); linkIntoVariants(nd, "skills", cat.id); }
      for (const name of pl.items as string[]) if (!cat.items.some((i) => i.name === name)) cat.items.push({ name });
    } else {
      let cat = nd.skills.find((c) => c.category === "Importadas");
      if (!cat) { cat = { id: uid("sk"), category: "Importadas", items: [] }; nd.skills.push(cat); linkIntoVariants(nd, "skills", cat.id); }
      cat.items.push(pl as { name: string });
    }
  }

  nd.staged = (nd.staged ?? []).filter((s) => s.id !== item.id);
  return nd;
}
