import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ResumeModel, Section, Block } from "./serialize";

/**
 * El documento CV en @react-pdf/renderer, según 05-documento-cv/ESPECIFICACION.md.
 * Una sola columna; fechas a la derecha por flex (no tabla); contacto en el cuerpo;
 * los bullets son un <View> (punto vectorial), NO un carácter "•" — así no entran
 * al texto extraído (regla ESPECIFICACION §5.4).
 *
 * ⚠️ FUENTES — estado Fase 1: se usan las Standard-14 integradas (Times/Helvetica/
 * Courier) como stand-in. Para la fidelidad de marca hay que registrar los .ttf de
 * Playfair Display (nombre), Geist (cuerpo) y Geist Mono (cifras) — ver
 * decision-tipografica.md. El contrato ATS es independiente de la fuente (el texto
 * extraído es el mismo), así que el round-trip vale igual; el swap es cosmético y
 * está gateado por este mismo test. TODO(fase-1.1): registrar las TTF de marca.
 *
 * ⚠️ CIFRAS EN MONO — se aplica el Plan B de ESPECIFICACION §5: la cifra va en la
 * misma fuente del cuerpo (un solo run → cero riesgo de pegado/separación en el
 * parseo). Activar el run mono inline es una mejora posterior, ya cubierta por el
 * test de round-trip (que detectaría el glue/split si aparece).
 */

const mm = (x: number) => x * 2.834645669; // mm → pt

const C = {
  name: "#8A6414", ink: "#17171A", para: "#24242A", meta: "#45454A",
  subtle: "#6E6E72", hair: "rgba(23,23,26,0.30)",
};
const F = { name: "Times-Bold", head: "Helvetica-Bold", body: "Helvetica", mono: "Courier" };

const s = StyleSheet.create({
  page: { paddingTop: mm(16), paddingBottom: mm(16), paddingLeft: mm(18), paddingRight: mm(18), fontFamily: F.body, color: C.ink },
  name: { fontFamily: F.name, fontSize: 25, color: C.name, lineHeight: 1.05 },
  title: { fontFamily: F.head, fontSize: 13, color: C.ink, marginTop: mm(2.5), lineHeight: 1.2 },
  contact: { fontFamily: F.mono, fontSize: 8.5, color: C.meta, marginTop: mm(3.5), lineHeight: 1.5 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerText: { flex: 1, paddingRight: mm(6) },
  photo: { width: mm(28), height: mm(35), objectFit: "cover", borderRadius: 3 },
  section: { marginTop: mm(6.5) },
  h2wrap: { borderBottomWidth: mm(0.4), borderBottomColor: C.hair, paddingBottom: mm(1.6), marginBottom: mm(3) },
  // Sin letterSpacing: el tracking de imprenta hace que pdf.js extraiga el
  // encabezado como letras separadas ("R E S U M E N") — el patrón anti-ATS que
  // el documento prohíbe (ESPECIFICACION §8). En el documento gana el ATS siempre.
  h2: { fontFamily: F.head, fontSize: 10.5, color: C.ink },
  para: { fontFamily: F.body, fontSize: 10.5, color: C.para, lineHeight: 1.5 },
  skill: { fontSize: 10, color: C.ink, lineHeight: 1.4, marginBottom: mm(0.8) },
  skillLabel: { fontFamily: F.head },
  entry: { marginBottom: mm(4) },
  entryHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  entryTitle: { fontFamily: F.head, fontSize: 11, color: C.ink, lineHeight: 1.2, flexShrink: 1, paddingRight: mm(6) },
  entryDates: { fontFamily: F.mono, fontSize: 9, color: C.subtle, lineHeight: 1.2 },
  entryMeta: { fontFamily: F.body, fontSize: 9.5, color: C.meta, marginTop: mm(0.6), lineHeight: 1.3 },
  ul: { marginTop: mm(1.8) },
  li: { flexDirection: "row", marginBottom: mm(1.1) },
  dotCol: { width: mm(4.6), flexDirection: "row", justifyContent: "flex-start", paddingTop: 3.2 },
  dot: { width: 2, height: 2, borderRadius: 1, backgroundColor: C.para, marginLeft: mm(1.8) },
  liText: { flex: 1, fontFamily: F.body, fontSize: 10, color: C.para, lineHeight: 1.4 },
  line: { fontFamily: F.body, fontSize: 10, color: C.para, lineHeight: 1.4, marginBottom: mm(0.6) },
});

function EntryView({ b }: { b: Extract<Block, { kind: "entry" }> }) {
  return (
    <View style={s.entry} wrap={false}>
      <View style={s.entryHead}>
        <Text style={s.entryTitle}>{b.title}</Text>
        {b.dates ? <Text style={s.entryDates}>{b.dates}</Text> : null}
      </View>
      {b.meta.map((m, i) => (
        <Text key={i} style={s.entryMeta}>{m}</Text>
      ))}
      {b.bullets.length > 0 ? (
        <View style={s.ul}>
          {b.bullets.map((t, i) => (
            <View key={i} style={s.li}>
              <View style={s.dotCol}>
                <View style={s.dot} />
              </View>
              <Text style={s.liText}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SectionView({ sec }: { sec: Section }) {
  return (
    <View style={s.section}>
      <View style={s.h2wrap}>
        <Text style={s.h2}>{sec.header}</Text>
      </View>
      {sec.blocks.map((b, i) => {
        if (b.kind === "paragraph") return <Text key={i} style={s.para}>{b.text}</Text>;
        if (b.kind === "skill")
          return (
            <Text key={i} style={s.skill}>
              <Text style={s.skillLabel}>{b.label}:</Text> {b.value}
            </Text>
          );
        if (b.kind === "line") return <Text key={i} style={s.line}>{b.text}</Text>;
        return <EntryView key={i} b={b} />;
      })}
    </View>
  );
}

export function ResumePDF({ model }: { model: ResumeModel }) {
  return (
    <Document title={`CV — ${model.name}`} author={model.name}>
      <Page size="A4" style={s.page}>
        {model.photo ? (
          <View style={s.headerRow}>
            <View style={s.headerText}>
              <Text style={s.name}>{model.name}</Text>
              <Text style={s.title}>{model.targetTitle}</Text>
              <Text style={s.contact}>{model.contact}</Text>
            </View>
            <Image src={model.photo} style={s.photo} />
          </View>
        ) : (
          <>
            <Text style={s.name}>{model.name}</Text>
            <Text style={s.title}>{model.targetTitle}</Text>
            <Text style={s.contact}>{model.contact}</Text>
          </>
        )}
        {model.sections.map((sec, i) => (
          <SectionView key={i} sec={sec} />
        ))}
      </Page>
    </Document>
  );
}

export async function renderResumeToBuffer(model: ResumeModel): Promise<Buffer> {
  return renderToBuffer(<ResumePDF model={model} />);
}
