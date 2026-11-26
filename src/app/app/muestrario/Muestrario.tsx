"use client";

import { useState } from "react";
import {
  Anillo,
  Area,
  Barras,
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  KpiCard,
  PanelHeader,
  Tabs,
} from "@/components/ui";
import "./muestrario.css";

/* Muestrario de Forja v2. TODO número de esta página es de prueba y va rotulado
   «ejemplo» (en la fuente del KPI y con un chip en cada gráfico). */

const EJ = "ejemplo · datos de prueba";

const SEMANAS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"].map((etiqueta, i) => ({
  etiqueta,
  valor: [4, 7, 6, 11, 9, 14, 12, 17][i]!,
}));
const SECCIONES = [
  { etiqueta: "Resumen", valor: 1 },
  { etiqueta: "Experiencia", valor: 5 },
  { etiqueta: "Proyectos", valor: 7 },
  { etiqueta: "Habilidades", valor: 12 },
];

export function Muestrario() {
  const [tab, setTab] = useState("tarjetas");
  const [cajon, setCajon] = useState(false);

  return (
    <main className="mu">
      <p className="mu-aviso">
        <Chip tono="ejemplo">ejemplo</Chip> Banco de pruebas, solo en desarrollo. Todas las cifras son de prueba.
      </p>

      <section className="mu-sec" aria-labelledby="mu-kpi">
        <PanelHeader nivel={2} id="mu-kpi" titulo="KpiCard" sub="La fuente es obligatoria: sin ella no compila." />
        <div className="mu-kpis">
          <KpiCard etiqueta="Ítems en el master" valor={70} fuente={EJ} icono="master" material="brasa" />
          <KpiCard etiqueta="Roles de experiencia" valor={5} fuente={EJ} icono="doc" />
          <KpiCard etiqueta="Cobertura" valor={79} unidad="%" fuente={EJ} icono="variantes" nota="55 de 70 ítems" />
          <KpiCard etiqueta="Páginas" valor={2} unidad="pág" fuente={EJ} icono="panel" material="crema" />
        </div>
      </section>

      <section className="mu-sec" aria-labelledby="mu-cards">
        <PanelHeader nivel={2} id="mu-cards" titulo="Card · cuatro materiales" />
        <div className="mu-materiales">
          <Card material="brasa" grande as="article" className="mu-hero">
            <p className="mu-over">Tu próxima variante</p>
            <p className="mu-big">Pega la oferta. Corpus la arma.</p>
            <p className="mu-sub">Cada línea sale de tu master y lleva su fuente.</p>
            <div className="mu-fila">
              <Button variante="tinta" icono="mas">
                Nueva variante
              </Button>
              <Button variante="tinta">Volcar material</Button>
            </div>
          </Card>
          <Card material="crema" grande as="article">
            <PanelHeader titulo="Folio crema" sub="Lectura y contraste dentro del grafito." meta="crema" />
            <Anillo valor={55} total={70} titulo="Cobertura de ejemplo" sobre="crema" />
            <div className="mu-fila mu-fila--c">
              <Chip>ejemplo</Chip>
            </div>
          </Card>
          <Card grande as="article">
            <PanelHeader titulo="Grafito" sub="La superficie de trabajo." acciones={<Chip tono="ejemplo">ejemplo</Chip>} />
            <Barras datos={SECCIONES} titulo="Ítems por sección (ejemplo)" />
          </Card>
          <Card material="vidrio" grande as="article">
            <PanelHeader titulo="Vidrio" sub="Para lo que flota sobre la atmósfera." />
            <EmptyState
              titulo="Nada pendiente"
              texto="Vuelca material para alimentar el master."
              icono="fuentes"
              accion={<Button variante="grafito" icono="fuentes">Volcar material</Button>}
            />
          </Card>
        </div>
      </section>

      <section className="mu-sec" aria-labelledby="mu-graf">
        <PanelHeader nivel={2} id="mu-graf" titulo="Gráficos en SVG" />
        <div className="mu-graficos">
          <Card grande>
            <PanelHeader titulo="Area" sub="Material volcado por semana" acciones={<Chip tono="ejemplo">ejemplo</Chip>} />
            <Area datos={SEMANAS} titulo="Material volcado por semana (ejemplo)" />
          </Card>
          <Card grande>
            <PanelHeader titulo="Barras verticales" acciones={<Chip tono="ejemplo">ejemplo</Chip>} />
            <Barras datos={SECCIONES} titulo="Ítems por sección (ejemplo)" orientacion="vertical" />
          </Card>
          <Card grande>
            <PanelHeader titulo="Anillo" acciones={<Chip tono="ejemplo">ejemplo</Chip>} />
            <Anillo valor={3} total={4} titulo="Variantes que caben (ejemplo)" sub="3 de 4 caben" />
          </Card>
        </div>
      </section>

      <section className="mu-sec" aria-labelledby="mu-ctrl">
        <PanelHeader nivel={2} id="mu-ctrl" titulo="Controles" />
        <Card grande>
          <div className="mu-fila">
            <Button variante="brasa" icono="mas">
              Brasa
            </Button>
            <Button variante="grafito" icono="doc">
              Grafito
            </Button>
            <Button variante="fantasma">Fantasma</Button>
            <Button variante="grafito" icono="buscar" soloIcono>
              Buscar
            </Button>
            <Button variante="brasa" disabled>
              Deshabilitado
            </Button>
            <Button variante="grafito" icono="flecha" onClick={() => setCajon(true)}>
              Abrir cajón
            </Button>
          </div>
          <div className="mu-fila">
            <Chip>neutro</Chip>
            <Chip tono="brasa">no cabe en 2 páginas</Chip>
            <Chip tono="oro">con fuente</Chip>
            <Chip tono="peligro">sin respaldo</Chip>
            <Chip tono="ejemplo">ejemplo</Chip>
          </div>
          <Tabs
            etiqueta="Pestañas de ejemplo"
            valor={tab}
            onCambio={setTab}
            items={[
              { id: "tarjetas", etiqueta: "Contenido" },
              { id: "ajuste", etiqueta: "Ajuste" },
              { id: "salud", etiqueta: "Salud" },
            ]}
          >
            <p className="mu-sub-g">Pestaña activa: {tab}. Flechas, Inicio y Fin mueven el foco.</p>
          </Tabs>
        </Card>
      </section>

      <Drawer
        abierto={cajon}
        onCerrar={() => setCajon(false)}
        titulo="Cajón"
        pie={
          <>
            <Button variante="fantasma" onClick={() => setCajon(false)}>
              Cancelar
            </Button>
            <Button variante="brasa" onClick={() => setCajon(false)}>
              Guardar
            </Button>
          </>
        }
      >
        <p className="mu-sub-g">Editar sin salir de la pantalla. Esc cierra, el foco vuelve al botón.</p>
      </Drawer>
    </main>
  );
}
