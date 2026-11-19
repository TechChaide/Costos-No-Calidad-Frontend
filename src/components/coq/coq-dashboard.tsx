'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  AlertTriangle, BarChart3, Calculator, CalendarRange, CheckCircle2, ChevronDown, ChevronRight, Database,
  Info, Layers, Loader2, MapPin, PieChart, RefreshCw, Search, ShieldCheck, Target, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { coqService } from '@/services/coq.service';
import type { Categoria, CoqEstado, CostoRow, FuenteTotal, MesTotals, VentaRow, YearTotals } from '@/types/coq';
import { BENCHMARKS, CATEGORIAS, FUENTE_INVENTARIO, MESES, centroLabel } from '@/lib/coq-config';
import { computeBenchmarks, computeDiagnostics, computeMeses, computeYear, conInventarioPromedio } from '@/lib/coq';

/* ---------------- Formato ---------------- */
const money = (n: number) => `$${Math.round(n).toLocaleString('es-EC')}`;
const pct = (n: number, d = 2) => `${(n * 100).toFixed(d)}%`;

/* ---------------- Sistema visual ----------------
 * Marca: azul #0155B8 (brand-600) con dorado (gold-500) como acento de contraste.
 * Categorías PAF con tonos distinguibles entre sí y del azul de marca.
 */
const CAT = {
  emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700', soft: 'bg-emerald-50', ring: 'border-emerald-200', hex: '#10B981' },
  blue: { dot: 'bg-sky-500', text: 'text-sky-700', soft: 'bg-sky-50', ring: 'border-sky-200', hex: '#0EA5E9' },
  orange: { dot: 'bg-orange-500', text: 'text-orange-700', soft: 'bg-orange-50', ring: 'border-orange-200', hex: '#F97316' },
  rose: { dot: 'bg-rose-500', text: 'text-rose-700', soft: 'bg-rose-50', ring: 'border-rose-200', hex: '#F43F5E' },
} as const;

const STATUS = {
  success: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', label: 'Cumple' },
  warning: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', label: 'Alerta' },
  critical: { chip: 'bg-rose-50 text-rose-700 ring-rose-200', label: 'Desviado' },
} as const;

type LucideIcon = ComponentType<{ className?: string }>;
const NOMBRE_CORTO: Record<Categoria, string> = {
  prevencion: 'Prevención',
  evaluacion: 'Evaluación',
  fallasInternas: 'Fallas internas',
  fallasExternas: 'Fallas externas',
};

type Tab = 'benchmarking' | 'comparativa' | 'mensual' | 'formulas';

/* ======================================================================== */
export function CoqDashboard() {
  const [costos, setCostos] = useState<CostoRow[]>([]);
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [anio, setAnio] = useState<number | null>(null);
  const [mesHasta, setMesHasta] = useState(12);
  const [vista, setVista] = useState<'acumulado' | 'mes'>('acumulado'); // acumulado desde enero o solo el mes elegido
  const [incluirInv, setIncluirInv] = useState(true);
  const [centro, setCentro] = useState('todos'); // 'todos' o el código del centro (p. ej. '1000')
  const [tab, setTab] = useState<Tab>('benchmarking');
  const [expanded, setExpanded] = useState<Categoria | null>('fallasInternas');
  const [estado, setEstado] = useState<CoqEstado | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [errorAct, setErrorAct] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [c, v, e] = await Promise.all([coqService.getCostos(), coqService.getVentas(), coqService.getEstado()]);
    // Se normalizan los textos: un campo nulo o ausente (p. ej. datos de una versión anterior) no debe romper el desglose.
    setCostos(c.map((r) => ({
      ...r,
      anio: Number(r.anio),
      mes: Number(r.mes),
      centro: r.centro ?? '',
      proceso: r.proceso ?? '',
      referencia: r.referencia ?? '',
      descripcion: r.descripcion ?? '',
      importe: Number(r.importe),
    })));
    setVentas(v.map((r) => ({ anio: Number(r.anio), mes: Number(r.mes), centro: r.centro ?? '', ventas: Number(r.ventas) })));
    setEstado(e);
  }, []);

  useEffect(() => {
    cargar()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [cargar]);

  const actualizar = async () => {
    setActualizando(true);
    setErrorAct(null);
    try {
      await coqService.actualizar();
      await cargar(); // se mantienen el año, el mes y los filtros seleccionados
    } catch (e) {
      setErrorAct((e as Error).message);
    } finally {
      setActualizando(false);
    }
  };

  /**
   * Último mes comparable (aaaamm): el menor entre el último mes con costos cargados y el último mes
   * de ventas completo. Ventas se carga a diario y costos por mes cerrado; sin este corte se dividirían
   * costos de un periodo entre ventas de otro.
   */
  const limite = useMemo(() => {
    const ultCosto = costos.reduce((m, c) => Math.max(m, c.anio * 100 + c.mes), 0);
    let ultVenta = ventas.reduce((m, v) => Math.max(m, v.anio * 100 + v.mes), 0);
    if (estado?.ventasHasta) {
      const [y, m, d] = estado.ventasHasta.split('-').map(Number);
      const mesCompleto = d >= new Date(y, m, 0).getDate();
      ultVenta = mesCompleto ? y * 100 + m : m === 1 ? (y - 1) * 100 + 12 : y * 100 + m - 1;
    }
    return Math.min(ultCosto, ultVenta);
  }, [costos, ventas, estado]);
  const limAnio = Math.floor(limite / 100);
  const maxMesDe = useCallback((y: number) => (y < limAnio ? 12 : y === limAnio ? limite % 100 : 0), [limAnio, limite]);

  const years = useMemo(
    () => [...new Set(costos.map((c) => c.anio))].filter((y) => y <= limAnio && ventas.some((v) => v.anio === y)).sort(),
    [costos, ventas, limAnio],
  );
  const elegirAnio = (y: number) => {
    setAnio(y);
    setMesHasta((m) => Math.min(m, maxMesDe(y)));
  };

  // Valores por defecto: último año y último mes comparable.
  useEffect(() => {
    if (!years.length || anio !== null) return;
    const last = years[years.length - 1];
    setAnio(last);
    setMesHasta(maxMesDe(last));
  }, [years, anio, maxMesDe]);

  // Si una actualización mueve el límite (p. ej. se cargan costos de un mes nuevo), se ajusta el corte.
  useEffect(() => {
    if (anio !== null && mesHasta > maxMesDe(anio)) setMesHasta(maxMesDe(anio));
  }, [anio, mesHasta, maxMesDe]);

  // Centros disponibles: los que tienen costos registrados en los datos.
  const centros = useMemo(() => [...new Set(costos.map((c) => c.centro).filter(Boolean))].sort(), [costos]);
  const centroSel = centro !== 'todos' && centros.includes(centro) ? centro : null;

  const totalsByYear = useMemo(() => {
    const out: Record<number, YearTotals> = {};
    years.forEach((y) => { out[y] = computeYear(y, mesHasta, costos, ventas, incluirInv, centroSel, vista === 'mes' ? mesHasta : 1); });
    return out;
  }, [years, mesHasta, vista, costos, ventas, incluirInv, centroSel]);

  // Serie mensual de cada año (pestaña de comparativa mensual).
  const mesesByYear = useMemo(() => {
    const out: Record<number, MesTotals[]> = {};
    years.forEach((y) => { out[y] = computeMeses(y, costos, ventas, incluirInv, centroSel); });
    return out;
  }, [years, costos, ventas, incluirInv, centroSel]);

  if (loading) return <EstadoCarga />;
  if (error || anio === null || !totalsByYear[anio]) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-white p-5 shadow-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <p className="font-semibold text-slate-900">No se pudieron mostrar los datos</p>
            <p className="mt-1 text-sm text-slate-600">{error || 'No hay datos disponibles para el periodo.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const t = totalsByYear[anio];
  const coqRatio = t.sales > 0 ? t.total / t.sales : 0;
  const cumpleCoq = coqRatio <= BENCHMARKS.total_coq_sales;
  const metaCoq = BENCHMARKS.total_coq_sales;
  const diagnostics = computeDiagnostics(t);
  const benchmarks = computeBenchmarks(t);
  const periodo = vista === 'mes' ? `${MESES[mesHasta - 1]} ${anio}` : mesHasta === 12 ? `Año ${anio}` : `Ene–${MESES[mesHasta - 1]} ${anio}`;
  const hayInventario = t.inventario > 0;
  const maxMes = maxMesDe(anio);

  return (
    <div className="min-h-full bg-slate-50 text-slate-900">
      {/* ---------- Cabecera de página ---------- */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Costos de Calidad y No Calidad</h1>
                </div>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-500">Año</span>
                <div className="flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Año">
                  {years.map((y) => (
                    <button key={y} onClick={() => elegirAnio(y)} role="tab" aria-selected={anio === y}
                      className={`flex-1 rounded-md px-4 py-1.5 text-sm font-semibold transition sm:flex-none ${
                        anio === y ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-brand-700'
                      }`}>
                      {y}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">Centro</span>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />
                  <select value={centroSel ?? 'todos'} onChange={(e) => setCentro(e.target.value)}
                    className="h-[38px] w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-800 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:w-48">
                    <option value="todos">Todos los centros</option>
                    {centros.map((c) => <option key={c} value={c}>{centroLabel(c)}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">Ver</span>
                <div className="relative">
                  <select value={vista} onChange={(e) => setVista(e.target.value as 'acumulado' | 'mes')}
                    className="h-[38px] w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:w-40">
                    <option value="acumulado">Acumulado</option>
                    <option value="mes">Mes individual</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">{vista === 'mes' ? 'Mes' : 'Acumulado a'}</span>
                <div className="relative">
                  <select value={mesHasta} onChange={(e) => setMesHasta(Number(e.target.value))}
                    className="h-[38px] w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:w-40">
                    {MESES.map((m, i) => (
                      <option key={m} value={i + 1} disabled={i + 1 > maxMes}>{m}{i + 1 > maxMes ? ' (sin cierre)' : ''}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </label>
              <button onClick={actualizar} disabled={actualizando}
                title="Vuelve a extraer los costos y las ventas del mes anterior y el actual desde los cubos"
                className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-wait disabled:opacity-70">
                <RefreshCw className={`h-4 w-4 ${actualizando ? 'animate-spin' : ''}`} />
                {actualizando ? 'Actualizando…' : 'Actualizar datos'}
              </button>
            </div>
          </div>

          {/* Estado de la actualización (solo se muestra mientras consulta o si falla) */}
          {(actualizando || errorAct) && (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {actualizando && <span className="text-brand-700">Consultando SQL Server…</span>}
              {errorAct && <span className="text-rose-600">{errorAct}</span>}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* ---------- KPIs ---------- */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr]">
          {/* CoQ / Ventas frente a la meta de clase mundial, lado a lado */}
          <div className="relative flex flex-col justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-3.5 text-white shadow-md">
            <div className="absolute inset-x-0 bottom-0 h-1 bg-gold-500" />
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-brand-100">CoQ / Ventas</p>
              <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1 text-sm font-semibold ${cumpleCoq ? 'text-emerald-700' : 'text-rose-700'}`}>
                {cumpleCoq ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {cumpleCoq ? 'Dentro de meta' : 'Sobre meta'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 divide-x divide-white/25">
              <div className="min-w-0 pr-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-100">Actual</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{pct(coqRatio)}</p>
              </div>
              <div className="min-w-0 pl-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-100">Clase mundial</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">≤ {pct(metaCoq, 1)}</p>
              </div>
            </div>
          </div>

          <Tile icon={Wallet} label="Ventas totales" value={money(t.sales)}>
            <p className="text-sm text-slate-500">
              Ventas netas · {periodo} · {centroSel ? centroLabel(centroSel) : 'Todos los centros'}
            </p>
          </Tile>

          <Tile icon={Layers} label="Costo total de calidad y no calidad" value={money(t.total)}>
            <BarraPartes partes={[
              { nombre: 'Inversión', valor: t.inversion, clase: 'bg-emerald-500' },
              { nombre: 'Fallas', valor: t.perdida, clase: 'bg-orange-500' },
            ]} />
            <ul className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
              {[
                { nombre: 'Inversión', detalle: 'prevención + evaluación', valor: t.inversion, clase: 'bg-emerald-500' },
                { nombre: 'Fallas', detalle: 'internas + externas', valor: t.perdida, clase: 'bg-orange-500' },
              ].map((r) => (
                <li key={r.nombre} className="flex items-center gap-2 whitespace-nowrap" title={`${r.nombre}: ${r.detalle}`}>
                  <i className={`h-2.5 w-2.5 shrink-0 rounded-sm ${r.clase}`} />
                  <b className="font-semibold text-slate-800">{r.nombre}</b>
                  <span className="font-semibold text-slate-900">{money(r.valor)}</span>
                  <span className="text-slate-500">· {pct(t.total > 0 ? r.valor / t.total : 0, 1)}</span>
                </li>
              ))}
            </ul>
          </Tile>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ---------- Panel izquierdo: composición ---------- */}
          <aside className="space-y-6 lg:col-span-5">
            <Panel title="Composición del CoQ" subtitle={`${periodo} · ${centroSel ? centroLabel(centroSel) : 'Todos los centros'}`} icon={PieChart}>
              <BarraComposicion t={t} />

              <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {CATEGORIAS.map((cfg) => {
                  const isExp = expanded === cfg.key;
                  const c = CAT[cfg.color];
                  const share = t.total > 0 ? t[cfg.key] / t.total : 0;
                  return (
                    <div key={cfg.key}>
                      <button onClick={() => setExpanded(isExp ? null : cfg.key)} aria-expanded={isExp}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${isExp ? 'bg-brand-50/60' : 'hover:bg-slate-50'}`}>
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.dot}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">{cfg.title}</span>
                          <span className="text-xs text-slate-500">{pct(share, 1)} del CoQ</span>
                        </span>
                        <span className="text-right text-sm font-semibold tabular-nums text-slate-900">{money(t[cfg.key])}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                      </button>
                      {isExp && (
                        <div className="space-y-1.5 bg-slate-50/70 px-4 pb-4 pt-1">
                          {t.fuentes[cfg.key].length === 0 && <p className="py-2 text-xs text-slate-400">Sin movimientos en el periodo.</p>}
                          {t.fuentes[cfg.key].map((f) => <FuenteDetalle key={f.fuente} f={f} />)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>

            {hayInventario && (
              <div className="rounded-xl border border-gold-400/60 bg-gold-50 p-5">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-900">Control de inventarios</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Saldo mensual del exceso de inventario contra la meta: en el CoQ entra como promedio mensual del periodo ({t.inventarioMeses} {t.inventarioMeses === 1 ? 'mes' : 'meses'} con dato), no como suma.
                      Puede desactivarla para ver el CoQ sin esta fuente.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold-100 bg-white px-3 py-2.5">
                      <span className="text-base font-semibold tabular-nums text-gold-700">{money(t.inventario)} <span className="text-xs font-normal text-slate-500">promedio mensual</span></span>
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        Incluir en el CoQ
                        <Switch checked={incluirInv} onCheckedChange={setIncluirInv} />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* ---------- Panel derecho: análisis ---------- */}
          <section className="min-w-0 space-y-6 lg:col-span-7">
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:grid-cols-4" role="tablist">
              {([
                ['benchmarking', 'Benchmarking', 'clase mundial', ShieldCheck],
                ['comparativa', 'Multianual', 'comparativa', BarChart3],
                ['mensual', 'Evolución', 'mensual', CalendarRange],
                ['formulas', 'Fórmulas', 'y metodología', Calculator],
              ] as const).map(([key, label, extra, Icon]) => (
                <button key={key} onClick={() => setTab(key)} role="tab" aria-selected={tab === key}
                  className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                    tab === key ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-brand-700'
                  }`}>
                  <Icon className="hidden h-4 w-4 shrink-0 sm:block" />
                  <span>{label}<span className="hidden xl:inline"> {extra}</span></span>
                </button>
              ))}
            </div>

            {tab === 'benchmarking' && <Benchmarking t={t} diagnostics={diagnostics} benchmarks={benchmarks} periodo={periodo} vista={vista} centro={centroSel ? centroLabel(centroSel) : null} />}
            {tab === 'comparativa' && (
              <Comparativa years={years} totals={totalsByYear} current={anio} onPick={elegirAnio}
                periodo={vista === 'mes' ? `${MESES[mesHasta - 1].toLowerCase()} ${anio}` : mesHasta === 12 ? 'año completo' : `acumulado enero–${MESES[mesHasta - 1].toLowerCase()}`} />
            )}
            {tab === 'mensual' && (
              <EvolucionMensual years={years} meses={mesesByYear} limite={limite}
                centro={centroSel ? centroLabel(centroSel) : 'Todos los centros'} inventarioIncluido={incluirInv} />
            )}
            {tab === 'formulas' && <Formulas t={t} periodo={periodo} />}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Piezas comunes ---------------- */
function EstadoCarga() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-brand-100 bg-white p-4 text-sm text-slate-600 shadow-sm">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" />
        <span>
          Cargando datos de costos y ventas…
          <span className="block text-xs text-slate-400">La primera extracción completa de ventas puede tardar hasta 2 minutos; después queda guardada.</span>
        </span>
      </div>
      <div className="grid animate-pulse grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-slate-200/70" />)}
      </div>
      <div className="mt-6 grid animate-pulse grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="h-96 rounded-xl bg-slate-200/70 lg:col-span-5" />
        <div className="h-96 rounded-xl bg-slate-200/70 lg:col-span-7" />
      </div>
    </div>
  );
}

/** Tarjeta de indicador: etiqueta · cifra · pie opcional. */
function Tile({ icon: Icon, label, value, children }: { icon: LucideIcon; label: string; value: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
          <Icon className="h-4 w-4 shrink-0 text-brand-600" />
          {label}
        </p>
        <p className="mt-1 truncate text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">{value}</p>
      </div>
      {children && <div className="mt-2 border-t border-slate-100 pt-2">{children}</div>}
    </div>
  );
}

/** Un total dividido en partes: barra fina de 8 px con separación de 2 px (la leyenda con nombres y montos va al lado). */
function BarraPartes({ partes }: { partes: { nombre: string; valor: number; clase: string }[] }) {
  const total = partes.reduce((a, x) => a + Math.max(0, x.valor), 0);
  if (total <= 0) return null;
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={partes.map((x) => `${x.nombre} ${pct(x.valor / total, 1)}`).join(', ')}>
      {partes.filter((x) => x.valor > 0).map((x) => (
        <div key={x.nombre} className={`${x.clase} first:rounded-l-full last:rounded-r-full`} style={{ width: `${(x.valor / total) * 100}%` }}
          title={`${x.nombre}: ${money(x.valor)} (${pct(x.valor / total, 1)})`} />
      ))}
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, action, children }: { title: string; subtitle?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-brand-600" />}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function BarraComposicion({ t }: { t: YearTotals }) {
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {CATEGORIAS.map((cfg) => (
          <div key={cfg.key} className={CAT[cfg.color].dot} style={{ width: `${t.total > 0 ? (t[cfg.key] / t.total) * 100 : 0}%` }} title={cfg.title} />
        ))}
      </div>
      {/* Leyenda de la barra: las categorías pequeñas (p. ej. prevención < 1 %) casi no se ven en la barra */}
      <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
        {CATEGORIAS.map((cfg) => (
          <li key={cfg.key} className="flex items-center gap-1.5">
            <i className={`h-2.5 w-2.5 shrink-0 rounded-sm ${CAT[cfg.color].dot}`} />
            <span className="truncate">{NOMBRE_CORTO[cfg.key]}</span>
            <span className="ml-auto font-medium tabular-nums text-slate-800">{pct(t.total > 0 ? t[cfg.key] / t.total : 0, 1)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-emerald-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-emerald-800">Inversión en calidad</p>
          <p className="text-[11px] text-emerald-700">Prevención + Evaluación</p>
          <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">{money(t.inversion)}</p>
        </div>
        <div className="rounded-lg bg-rose-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-rose-800">Pérdida por no calidad</p>
          <p className="text-[11px] text-rose-700">Fallas internas + Fallas externas</p>
          <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">{money(t.perdida)}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Benchmarking ---------------- */
function Benchmarking({ t, diagnostics, benchmarks, periodo, vista, centro }: { t: YearTotals; diagnostics: ReturnType<typeof computeDiagnostics>; benchmarks: ReturnType<typeof computeBenchmarks>; periodo: string; vista: 'acumulado' | 'mes'; centro: string | null }) {
  const [ayuda, setAyuda] = useState<string | null>(null); // indicador cuyo cálculo se muestra
  const alternar = (param: string) => setAyuda((a) => (a === param ? null : param));
  // Posición del punto en la curva. Eje X: inversión (prevención + evaluación) sobre el CoQ, de 0 % a 100 %.
  // Eje Y: CoQ sobre ventas; el tope se ajusta al valor actual (o a 3 veces la meta) para que el punto nunca quede acotado.
  const prevShare = t.total > 0 ? t.inversion / t.total : 0;
  const x = 40 + Math.min(1, Math.max(0, prevShare)) * 330;
  const coq = t.sales > 0 ? t.total / t.sales : 0;
  const coqTope = Math.max(coq, BENCHMARKS.total_coq_sales * 3, 0.0001);
  const y = 150 - (Math.max(0, coq) / coqTope) * 120;

  return (
    <div className="space-y-6">
      {diagnostics.length === 0 ? (
        <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm"><ShieldCheck className="h-6 w-6" /></span>
          <div>
            <h3 className="font-semibold text-slate-900">Dentro del estándar de clase mundial</h3>
            <p className="text-sm text-slate-600">Todos los indicadores de costo están dentro de los rangos de referencia.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {diagnostics.map((d) => {
            const crit = d.status === 'critical';
            return (
              <div key={d.item} className={`rounded-xl border bg-white p-5 shadow-sm ${crit ? 'border-l-4 border-rose-200 border-l-rose-500' : 'border-l-4 border-amber-200 border-l-amber-500'}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${crit ? 'text-rose-600' : 'text-amber-600'}`} />
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">{d.item}</h4>
                      <p className="mt-0.5 text-sm text-slate-600">{d.msg}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-6 pl-8 sm:pl-0">
                    <div><p className="text-[11px] text-slate-500">Actual</p><p className={`text-base font-semibold tabular-nums ${crit ? 'text-rose-700' : 'text-amber-700'}`}>{d.current}</p></div>
                    <div><p className="text-[11px] text-slate-500">Clase mundial</p><p className="text-base font-semibold tabular-nums text-brand-700">{d.target}</p></div>
                  </div>
                </div>
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600"><span className="font-medium text-slate-800">Sugerencia:</span> {d.suggest}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Curva de Juran */}
      <Panel title="Curva de optimización" subtitle="Esquema ilustrativo del modelo de costo total de calidad; el punto marca la posición del periodo seleccionado" icon={TrendingDown}>
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
          <span className="flex items-center gap-2"><i className="h-0.5 w-4 rounded bg-rose-500" />Costos de fallas</span>
          <span className="flex items-center gap-2"><i className="h-0.5 w-4 rounded bg-emerald-500" />Costos de prevención</span>
          <span className="flex items-center gap-2"><i className="w-4 border-t-2 border-dashed border-brand-600" />Costo total CoQ</span>
        </div>
        <svg viewBox="0 0 400 180" className="h-auto w-full" role="img" aria-label="Curva de Juran del costo de calidad">
          <line x1="30" y1="150" x2="380" y2="150" stroke="#CBD5E1" strokeWidth="1.5" />
          <line x1="30" y1="150" x2="30" y2="20" stroke="#CBD5E1" strokeWidth="1.5" />
          <text x="205" y="172" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600">Inversión (prevención + evaluación) / CoQ</text>
          <text x="12" y="85" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600" transform="rotate(-90 12,85)">CoQ / Ventas</text>
          <path d="M 30 25 Q 150 140 380 145" fill="none" stroke="#F43F5E" strokeWidth="2" opacity="0.45" />
          <path d="M 30 145 Q 250 140 380 35" fill="none" stroke="#10B981" strokeWidth="2" opacity="0.45" />
          <path d="M 30 148 Q 200 70 380 148" fill="none" stroke="#0155B8" strokeWidth="3" strokeDasharray="7 4" />
          <g transform={`translate(${x}, ${y})`}>
            <circle r="9" fill="#F5A623" opacity="0.25" />
            <circle r="4.5" fill="#0155B8" stroke="#fff" strokeWidth="1.5" />
            <rect x="-17" y="-27" width="34" height="15" rx="4" fill="#041C3D" />
            <text y="-16" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">{t.anio}</text>
          </g>
        </svg>
        <p className="mt-3 text-center text-xs text-slate-600">
          {periodo}: inversión / CoQ <b className="tabular-nums text-slate-800">{pct(prevShare, 1)}</b> · CoQ / Ventas <b className="tabular-nums text-slate-800">{pct(coq)}</b>
        </p>
        <div className="mt-4 grid grid-cols-3 border-t border-slate-100 pt-3 text-center text-[11px] font-medium text-slate-500">
          <span>Zona reactiva</span>
          <span className="font-semibold text-brand-700">Óptimo económico</span>
          <span>Clase mundial</span>
        </div>
      </Panel>

      {/* Tabla de cumplimiento */}
      <Panel title="Cumplimiento frente a clase mundial" subtitle="Pulsa el icono ⓘ de cada indicador para ver cómo se calcula" icon={Search}
        action={
          <div className="flex flex-col items-end gap-1.5" aria-label="Periodo que se está observando">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
              <CalendarRange className="h-4 w-4" />
              {periodo}
            </span>
            <span className="flex flex-wrap justify-end gap-1.5 text-[11px] font-medium text-slate-600">
              <span className="rounded-full bg-slate-100 px-2 py-0.5">{vista === 'mes' ? 'Mes individual' : 'Acumulado'}</span>
              {centro && <span className="rounded-full bg-slate-100 px-2 py-0.5">{centro}</span>}
              <span className="rounded-full bg-slate-100 px-2 py-0.5">{t.inventarioIncluido ? 'Con inventario' : 'Sin inventario'}</span>
            </span>
          </div>
        }>
        {/* Escritorio: tabla */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-2.5 pr-3 font-medium">Indicador</th>
                <th className="px-3 py-2.5 text-right font-medium">Actual</th>
                <th className="px-3 py-2.5 text-right font-medium">Clase mundial</th>
                <th className="py-2.5 pl-3 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {benchmarks.map((b) => (
                <Fragment key={b.param}>
                  <tr className={`hover:bg-slate-50/70 ${ayuda === b.param ? 'bg-slate-50/70' : ''}`}>
                    <td className="py-3 pr-3">
                      <div className="flex items-start gap-2">
                        <div><p className="font-medium text-slate-800">{b.param}</p><p className="text-xs text-slate-500">{b.desc}</p></div>
                        <BotonAyuda abierto={ayuda === b.param} onClick={() => alternar(b.param)} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{b.actual}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-brand-700">{b.world}</td>
                    <td className="py-3 pl-3 text-right"><Chip status={b.status} /></td>
                  </tr>
                  {ayuda === b.param && (
                    <tr className="bg-slate-50/70"><td colSpan={4} className="px-1 pb-4 pt-0"><CalculoAyuda b={b} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {/* Móvil: tarjetas */}
        <div className="space-y-2 sm:hidden">
          {benchmarks.map((b) => (
            <div key={b.param} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <p className="text-sm font-medium text-slate-800">{b.param}</p>
                  <BotonAyuda abierto={ayuda === b.param} onClick={() => alternar(b.param)} />
                </div>
                <Chip status={b.status} />
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{b.desc}</p>
              <div className="mt-2 flex gap-6 text-sm">
                <span><span className="text-xs text-slate-500">Actual </span><b className="tabular-nums">{b.actual}</b></span>
                <span><span className="text-xs text-slate-500">Meta </span><b className="tabular-nums text-brand-700">{b.world}</b></span>
              </div>
              {ayuda === b.param && <div className="mt-3"><CalculoAyuda b={b} /></div>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function BotonAyuda({ abierto, onClick }: { abierto: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={abierto} aria-label="Ver cómo se calcula este indicador" title="Ver cómo se calcula"
      className={`mt-0.5 shrink-0 rounded-full p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
        abierto ? 'bg-brand-600 text-white' : 'text-brand-600 hover:bg-brand-50'
      }`}>
      <Info className="h-4 w-4" />
    </button>
  );
}

/** Ayuda visual: muestra numerador ÷ denominador = resultado con los importes reales del periodo. */
function CalculoAyuda({ b }: { b: ReturnType<typeof computeBenchmarks>[number] }) {
  const c = b.calculo;
  const ok = b.status === 'success';
  return (
    <div className="rounded-lg border border-brand-100 bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Cómo se calcula</p>
      <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
        <div className="flex-1 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
          <p className="text-[11px] font-medium text-slate-500">Numerador</p>
          <p className="text-lg font-bold tabular-nums text-brand-700">{money(c.num)}</p>
          <p className="text-xs text-slate-600">{c.numLabel}</p>
        </div>
        <span className="text-center text-xl font-bold text-slate-400">÷</span>
        <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-medium text-slate-500">Denominador</p>
          <p className="text-lg font-bold tabular-nums text-slate-800">{money(c.den)}</p>
          <p className="text-xs text-slate-600">{c.denLabel}</p>
        </div>
        <span className="text-center text-xl font-bold text-slate-400">=</span>
        <div className={`flex-1 rounded-lg border p-3 ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <p className="text-[11px] font-medium text-slate-500">Resultado</p>
          <p className={`text-lg font-bold tabular-nums ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{b.actual}</p>
          <p className="text-xs text-slate-600">Cumple si es {c.regla}</p>
        </div>
      </div>
      {c.fuentes && (
        <p className="mt-3 text-xs text-slate-500">
          <span className="font-medium text-slate-600">Fuentes del cubo: </span>{c.fuentes.join(' + ')}
        </p>
      )}
    </div>
  );
}

function Chip({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.chip}`}>
      {status === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {s.label}
    </span>
  );
}

/* ---------------- Comparativa multianual ---------------- */
function Comparativa({ years, totals, current, onPick, periodo }: { years: number[]; totals: Record<number, YearTotals>; current: number; onPick: (y: number) => void; periodo: string }) {
  const base = totals[years[0]];
  const maxTotal = Math.max(...years.map((y) => totals[y].total), 1);
  return (
    <div className="space-y-6">
      <Panel title="Comparativa de costos multianual" subtitle={`Comparación homogénea: ${periodo}`} icon={BarChart3}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {years.map((y, i) => {
            const t = totals[y];
            const dif = i === 0 ? 0 : base.total - t.total;
            const sel = current === y;
            return (
              <button key={y} onClick={() => onPick(y)} aria-pressed={sel}
                className={`rounded-xl border p-4 text-left transition ${sel ? 'border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/20' : 'border-slate-200 bg-white hover:border-brand-200'}`}>
                <div className="flex items-center justify-between">
                  <p className={`text-lg font-bold ${sel ? 'text-brand-700' : 'text-slate-800'}`}>{y}</p>
                  <p className="text-xs font-medium text-slate-500">CoQ {pct(t.sales > 0 ? t.total / t.sales : 0)}</p>
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <Fila k="Costo total" v={money(t.total)} strong />
                  <Fila k="Prevención" v={money(t.prevencion)} />
                  <Fila k="Evaluación" v={money(t.evaluacion)} />
                  <Fila k="Fallas" v={money(t.perdida)} cls="text-rose-700" />
                  <Fila k="Inventarios (prom. mensual)" v={t.inventario > 0 ? money(t.inventario) : 'sin dato'} cls="text-gold-700" />
                </dl>
                <div className="mt-3 border-t border-slate-100 pt-3 text-xs">
                  {i === 0 ? (
                    <span className="text-slate-500">Línea base</span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 font-semibold ${dif >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {dif >= 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                      {dif >= 0 ? 'Ahorro' : 'Mayor costo'} vs {years[0]}: {money(Math.abs(dif))}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Proporción de costos por año" icon={Layers}>
        <div className="space-y-4">
          {years.map((y) => {
            const t = totals[y];
            const w = (v: number) => `${(v / maxTotal) * 100}%`;
            return (
              <div key={y} className="flex items-center gap-3 sm:gap-4">
                <span className="w-10 shrink-0 text-sm font-semibold text-slate-700">{y}</span>
                <div className="flex h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-100">
                  {CATEGORIAS.map((cfg) => (
                    <div key={cfg.key} className={CAT[cfg.color].dot} style={{ width: w(t[cfg.key]) }} title={`${cfg.title}: ${money(t[cfg.key])}`} />
                  ))}
                </div>
                <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900 sm:w-28">{money(t.total)}</span>
              </div>
            );
          })}
        </div>
        <Leyenda />
      </Panel>
    </div>
  );
}

function Fila({ k, v, strong, cls }: { k: string; v: string; strong?: boolean; cls?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold text-slate-900' : 'font-medium'} ${cls || 'text-slate-800'}`}>{v}</dd>
    </div>
  );
}

function Leyenda() {
  return (
    <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
      {CATEGORIAS.map((cfg) => (
        <span key={cfg.key} className="flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-sm ${CAT[cfg.color].dot}`} />{NOMBRE_CORTO[cfg.key]}</span>
      ))}
    </div>
  );
}

/* ---------------- Fórmulas ---------------- */
function Formulas({ t, periodo }: { t: YearTotals; periodo: string }) {
  const r = (a: number, b: number) => (b > 0 ? a / b : 0);
  const idx = t.perdida > 0 ? t.inversion / t.perdida : 0;
  const cards = [
    { key: 'prevencion' as const, name: 'Prevención (P)', desc: 'Gastos planificados para evitar errores y defectos en origen.' },
    { key: 'evaluacion' as const, name: 'Evaluación (E)', desc: 'Costo de inspeccionar, auditar y verificar especificaciones.' },
    { key: 'fallasInternas' as const, name: 'Fallas internas (FI)', desc: 'Defectos detectados dentro de fábrica antes del despacho.' },
    { key: 'fallasExternas' as const, name: 'Fallas externas (FE)', desc: 'Defectos detectados por el cliente tras la entrega.' },
  ];
  return (
    <Panel title="Fórmulas de cálculo" subtitle="Modelo PAF (prevención, evaluación, fallas)" icon={Calculator}
      action={<span className="hidden shrink-0 rounded-md bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-100 sm:inline">Cifras {periodo}</span>}>
      <div className="space-y-4">
        <Block n="1" title="Costo total de la calidad (CoQ)" value={money(t.total)}
          formula="CoQ = Prevención + Evaluación + Fallas internas + Fallas externas"
          live={`${money(t.prevencion)} + ${money(t.evaluacion)} + ${money(t.fallasInternas)} + ${money(t.fallasExternas)} = ${money(t.total)}`} />
        <Block n="2" title="Ratio CoQ sobre ventas netas" value={pct(r(t.total, t.sales))}
          formula="% CoQ / Ventas = Costo total de calidad / Ventas netas × 100"
          live={`${money(t.total)} / ${money(t.sales)} × 100 = ${pct(r(t.total, t.sales))}`} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cards.map((c) => {
            const col = CAT[CATEGORIAS.find((k) => k.key === c.key)!.color];
            const isFail = c.key.startsWith('fallas');
            return (
              <div key={c.key} className={`rounded-lg border p-4 ${col.ring} ${col.soft}`}>
                <div className="flex items-start justify-between gap-2">
                  <h5 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><i className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />{c.name}</h5>
                  <span className={`text-sm font-semibold tabular-nums ${col.text}`}>{money(t[c.key])}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{c.desc}</p>
                <p className="mt-2 rounded-md bg-white/80 px-2.5 py-2 font-mono text-[11px] text-slate-700 [overflow-wrap:anywhere]">
                  {isFail
                    ? `s/ ventas = ${money(t[c.key])} / ${money(t.sales)} = ${pct(r(t[c.key], t.sales))}`
                    : `s/ CoQ = ${money(t[c.key])} / ${money(t.total)} = ${pct(r(t[c.key], t.total), 1)}`}
                </p>
              </div>
            );
          })}
        </div>

        <Block n="3" title="Índice de prevención frente a pérdidas" value={t.perdida > 0 ? `${idx.toFixed(2)}×` : 'N/A'}
          formula="Índice = (Prevención + Evaluación) / (Fallas internas + Fallas externas)"
          live={`${money(t.inversion)} / ${money(t.perdida)} = ${t.perdida > 0 ? idx.toFixed(2) : 'N/A'}`} />

        <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          {t.inventarioIncluido
            ? 'El CoQ incluye la fuente Control de inventarios como promedio mensual del periodo (es un saldo, no se suma mes a mes).'
            : 'El CoQ no incluye la fuente Control de inventarios. Puede activarla en el panel de composición.'}
        </p>
      </div>
    </Panel>
  );
}

function Block({ n, title, value, formula, live }: { n: string; title: string; value: string; formula: string; live: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{n}</span>
          {title}
        </h4>
        <span className="shrink-0 text-lg font-bold tabular-nums text-brand-700">{value}</span>
      </div>
      <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 [overflow-wrap:anywhere]">{formula}</p>
      <p className="mt-2 rounded-md bg-brand-50 px-3 py-2 font-mono text-xs text-brand-900 [overflow-wrap:anywhere]">
        <span className="font-sans font-semibold text-brand-700">Con cifras reales: </span>{live}
      </p>
    </div>
  );
}

/* ---------------- Desglose fuente -> proceso -> referencia ---------------- */
function FuenteDetalle({ f }: { f: FuenteTotal }) {
  const [abierta, setAbierta] = useState(false);
  const [procAbiertos, setProcAbiertos] = useState<Set<string>>(new Set());
  const alternar = (p: string) =>
    setProcAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(p)) n.delete(p); else n.add(p);
      return n;
    });
  // Se ocultan las referencias que redondean a $0 (reversos y ajustes que se compensan) para no llenar la lista de ruido.
  const visible = (importe: number) => Math.round(importe) !== 0;

  return (
    <div className={`overflow-hidden rounded-md border ${f.excluido ? 'border-dashed border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
      <button onClick={() => setAbierta(!abierta)} aria-expanded={abierta}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50/80">
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${abierta ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-slate-700" title={f.fuente}>{f.fuente}</span>
          <span className="block text-[11px] text-slate-400">{f.procesos.length} {f.procesos.length === 1 ? 'proceso' : 'procesos'}</span>
        </span>
        <span className={`shrink-0 text-xs font-semibold tabular-nums ${f.excluido ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{money(f.importe)}</span>
      </button>

      {abierta && (
        <div className="space-y-1 border-t border-slate-100 bg-slate-50/70 p-2">
          {f.procesos.filter((p) => visible(p.importe)).map((p, idx) => {
            const abierto = procAbiertos.has(p.proceso);
            const refs = p.referencias.filter((r) => visible(r.importe));
            return (
              <div key={`${p.proceso}|${idx}`} className="rounded border border-slate-200 bg-white">
                <button onClick={() => alternar(p.proceso)} aria-expanded={abierto}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition hover:bg-slate-50">
                  <ChevronRight className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${abierto ? 'rotate-90' : ''}`} />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={p.proceso}>
                    <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Proceso</span>{p.proceso}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-800">{money(p.importe)}</span>
                </button>
                {abierto && (
                  <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
                    {refs.length === 0 && <li className="px-3 py-2 text-[11px] text-slate-400">Sin referencias con importe.</li>}
                    {refs.map((r, i) => (
                      <li key={`${r.referencia}|${i}`} className="flex items-start justify-between gap-3 py-1.5 pl-7 pr-3 text-[11px]">
                        <span className="min-w-0">
                          <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ref.</span>
                          <span className="font-medium text-slate-700">{r.referencia || '(sin referencia)'}</span>
                          {r.descripcion && <span className="block truncate text-slate-500" title={r.descripcion}>{r.descripcion}</span>}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-800">{money(r.importe)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Evolución mensual (comparativa mes a mes entre años) ---------------- */
type MetricaKey = 'total' | 'ratio' | 'prevencion' | 'evaluacion' | 'fallasInternas' | 'fallasExternas' | 'sales';
/** mejor: sentido en que una variación es favorable (para colorear); neutral = sin juicio de valor. */
const METRICAS: { key: MetricaKey; label: string; tipo: 'usd' | 'pct'; mejor: 'menor' | 'mayor' | 'neutral' }[] = [
  { key: 'total', label: 'CoQ total', tipo: 'usd', mejor: 'menor' },
  { key: 'ratio', label: 'CoQ / Ventas', tipo: 'pct', mejor: 'menor' },
  { key: 'prevencion', label: 'Prevención', tipo: 'usd', mejor: 'mayor' },
  { key: 'evaluacion', label: 'Evaluación', tipo: 'usd', mejor: 'neutral' },
  { key: 'fallasInternas', label: 'Fallas internas', tipo: 'usd', mejor: 'menor' },
  { key: 'fallasExternas', label: 'Fallas externas', tipo: 'usd', mejor: 'menor' },
  { key: 'sales', label: 'Ventas', tipo: 'usd', mejor: 'mayor' },
];
const COLORES_ANIO = ['#0155B8', '#F5A623', '#94A3B8', '#10B981', '#8B5CF6']; // año más reciente primero

type Acum = Omit<MesTotals, 'mes'> & { mesesInv: number }; // mesesInv: meses con dato de Control de inventarios
const valorDe = (m: Omit<MesTotals, 'mes'>, key: MetricaKey) => (key === 'ratio' ? (m.sales > 0 ? m.total / m.sales : 0) : m[key]);
const vacio = (): Acum => ({ sales: 0, prevencion: 0, evaluacion: 0, fallasInternas: 0, fallasExternas: 0, total: 0, inventario: 0, mesesInv: 0 });
const sumar = (a: Acum, m: Omit<MesTotals, 'mes'>) => {
  if (m.inventario !== 0) a.mesesInv++;
  a.inventario += m.inventario;
  a.sales += m.sales; a.prevencion += m.prevencion; a.evaluacion += m.evaluacion;
  a.fallasInternas += m.fallasInternas; a.fallasExternas += m.fallasExternas; a.total += m.total;
};

function EvolucionMensual({ years, meses, limite, centro, inventarioIncluido }: {
  years: number[]; meses: Record<number, MesTotals[]>; limite: number; centro: string; inventarioIncluido: boolean;
}) {
  const [metrica, setMetrica] = useState<MetricaKey>('total');
  const [modo, setModo] = useState<'mensual' | 'acumulado'>('mensual');
  const cfg = METRICAS.find((m) => m.key === metrica)!;
  const limAnio = Math.floor(limite / 100);
  const limMes = limite % 100;
  const mesMax = (yr: number) => (yr < limAnio ? 12 : yr === limAnio ? limMes : 0);
  const colorDe = (yr: number) => COLORES_ANIO[(years.length - 1 - years.indexOf(yr)) % COLORES_ANIO.length];

  const fmt = (v: number) => (cfg.tipo === 'pct' ? pct(v, 2) : money(v));
  const fmtEje = (v: number) =>
    cfg.tipo === 'pct' ? `${(v * 100).toFixed(1)}%`
    : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
    : Math.abs(v) >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`;

  // Valor de cada mes por año (null = mes sin cierre). En modo acumulado se suma de enero hasta ese mes.
  const series = useMemo(() => years.map((yr) => {
    const acc = vacio();
    const valores: (number | null)[] = (meses[yr] ?? []).map((m, i) => {
      if (i + 1 > mesMax(yr)) return null;
      if (modo === 'acumulado') { sumar(acc, m); return valorDe(conInventarioPromedio(acc, acc.mesesInv), metrica); }
      return valorDe(m, metrica);
    });
    return { yr, valores };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [years, meses, modo, metrica, limite]);

  // Mismo tramo (enero hasta el último mes comparable) en todos los años: comparación homogénea.
  const hastaLimite = useMemo(() => years.map((yr) => {
    const acc = vacio();
    (meses[yr] ?? []).forEach((m, i) => { if (i + 1 <= limMes && i + 1 <= mesMax(yr)) sumar(acc, m); });
    return valorDe(conInventarioPromedio(acc, acc.mesesInv), metrica);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [years, meses, metrica, limite]);

  const variacion = (v: number | null | undefined, p: number | null | undefined) => {
    if (v == null || p == null) return null;
    let d: number;
    let texto: string;
    if (cfg.tipo === 'pct') {
      d = (v - p) * 100;
      texto = `${d >= 0 ? '+' : ''}${d.toFixed(2)} pp`;
    } else {
      if (p === 0) return null;
      d = ((v - p) / Math.abs(p)) * 100;
      texto = `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`;
    }
    const bueno = cfg.mejor === 'neutral' ? null : cfg.mejor === 'menor' ? d <= 0 : d >= 0;
    return { texto, sube: d >= 0, bueno };
  };
  const renderVar = (v: number | null | undefined, p: number | null | undefined) => {
    const r = variacion(v, p);
    if (!r) return <span className="block text-[11px] text-slate-300">—</span>;
    const color = r.bueno === null ? 'text-slate-500' : r.bueno ? 'text-emerald-600' : 'text-rose-600';
    return (
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${color}`}>
        {r.sube ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{r.texto}
      </span>
    );
  };

  // ---- Gráfico de líneas (SVG) ----
  const W = 640, H = 270, L = 58, R = 16, T = 14, B = 30;
  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
  const yMax = Math.max(...todos, 0) * 1.08 || 1;
  const yMin = Math.min(...todos, 0);
  const px = (i: number) => L + (i * (W - L - R)) / 11;
  const py = (v: number) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin || 1));
  const ticks = [0, 1, 2, 3, 4].map((k) => yMin + ((yMax - yMin) * k) / 4);
  const trazo = (vals: (number | null)[]) => {
    let d = '';
    let abierto = false;
    vals.forEach((v, i) => {
      if (v === null) { abierto = false; return; }
      d += `${abierto ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)} `;
      abierto = true;
    });
    return d.trim();
  };

  return (
    <div className="space-y-6">
      <Panel title="Evolución mensual" subtitle={`${centro} · cómo fluye cada mes de un año a otro`} icon={CalendarRange}>
        <div className="flex flex-col gap-4">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-500">Indicador</span>
            <div className="flex flex-wrap gap-1.5">
              {METRICAS.map((m) => (
                <button key={m.key} onClick={() => setMetrica(m.key)} aria-pressed={metrica === m.key}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    metrica === m.key ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-700'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-500">Vista</span>
              <div className="flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Vista">
                {([['mensual', 'Mes a mes'], ['acumulado', 'Acumulado']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setModo(k)} role="tab" aria-selected={modo === k}
                    className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${modo === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-brand-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
              {[...years].reverse().map((yr) => (
                <span key={yr} className="flex items-center gap-1.5">
                  <i className="h-0.5 w-4 rounded" style={{ backgroundColor: colorDe(yr) }} />{yr}
                </span>
              ))}
            </div>
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 h-auto w-full" role="img" aria-label={`${cfg.label} por mes y año`}>
          {ticks.map((tk, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={py(tk)} y2={py(tk)} stroke="#E2E8F0" strokeWidth="1" />
              <text x={L - 8} y={py(tk) + 3} textAnchor="end" fill="#64748B" fontSize="10">{fmtEje(tk)}</text>
            </g>
          ))}
          {MESES.map((m, i) => (
            <text key={m} x={px(i)} y={H - 10} textAnchor="middle" fill="#64748B" fontSize="10">{m}</text>
          ))}
          {series.map((s, idx) => {
            const ultimo = idx === series.length - 1;
            return (
              <g key={s.yr}>
                <path d={trazo(s.valores)} fill="none" stroke={colorDe(s.yr)} strokeWidth={ultimo ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" opacity={ultimo ? 1 : 0.85} />
                {s.valores.map((v, i) => v === null ? null : (
                  <circle key={i} cx={px(i)} cy={py(v)} r={ultimo ? 3.5 : 2.5} fill="#fff" stroke={colorDe(s.yr)} strokeWidth="2">
                    <title>{`${s.yr} · ${MESES[i]}: ${fmt(v)}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
        <p className="mt-2 text-[11px] text-slate-400">
          {modo === 'acumulado' ? 'Cada punto suma de enero hasta ese mes.' : 'Cada punto es el valor del mes.'} Pase el cursor sobre un punto para ver el valor.
        </p>
      </Panel>

      <Panel title={`${cfg.label} por mes`} subtitle={`${modo === 'acumulado' ? 'Acumulado desde enero' : 'Valor de cada mes'} · variación frente al mismo mes del año anterior`} icon={Layers}>
        {/* Leyenda: cómo leer los porcentajes de colores */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600">
          <p className="mb-2 font-semibold text-slate-700">Cómo leer las variaciones</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-slate-500" /><TrendingDown className="h-3.5 w-3.5 text-slate-500" /> La flecha indica si el valor <b>subió</b> o <b>bajó</b> frente al mismo mes del año anterior</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /><b className="text-emerald-700">Verde</b> = cambio favorable</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" /><b className="text-rose-600">Rojo</b> = cambio desfavorable</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-400" /><b className="text-slate-600">Gris</b> = sin juicio de valor</span>
          </div>
          <p className="mt-2 text-slate-500">
            En <b>{cfg.label}</b>:{' '}
            {cfg.mejor === 'menor' && 'un valor menor es mejor, por eso bajar sale en verde y subir en rojo.'}
            {cfg.mejor === 'mayor' && 'un valor mayor es mejor, por eso subir sale en verde y bajar en rojo.'}
            {cfg.mejor === 'neutral' && 'no se califica como favorable o desfavorable, así que las variaciones salen en gris.'}
          </p>
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="sticky left-0 bg-white py-2.5 pr-3 font-medium">Mes</th>
                {years.map((yr, idx) => (
                  <th key={yr} className="px-3 py-2.5 text-right font-semibold" style={{ color: colorDe(yr) === '#94A3B8' ? '#64748B' : colorDe(yr) }}>
                    {yr}
                    <span className="block text-[10px] font-normal text-slate-400">{idx > 0 ? `variación vs ${years[idx - 1]}` : 'año base'}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MESES.map((nombre, i) => (
                <tr key={nombre} className="hover:bg-slate-50/70">
                  <td className="sticky left-0 bg-white py-2.5 pr-3 font-medium text-slate-700">{nombre}</td>
                  {series.map((s, idx) => {
                    const v = s.valores[i];
                    return (
                      <td key={s.yr} className="px-3 py-2 text-right align-top">
                        {v === null ? <span className="text-slate-300">—</span> : (
                          <>
                            <span className="block font-semibold tabular-nums text-slate-900">{fmt(v)}</span>
                            {idx > 0 && renderVar(v, series[idx - 1].valores[i])}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/70">
                <td className="sticky left-0 bg-slate-50 py-3 pr-3 text-xs font-semibold text-slate-800">Ene–{MESES[limMes - 1]}</td>
                {hastaLimite.map((v, idx) => (
                  <td key={years[idx]} className="px-3 py-3 text-right align-top">
                    <span className="block font-bold tabular-nums text-slate-900">{fmt(v)}</span>
                    {idx > 0 && renderVar(v, hastaLimite[idx - 1])}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            La última fila compara el mismo tramo (enero a {MESES[limMes - 1].toLowerCase()}) en todos los años.
            {cfg.tipo === 'pct' && ' La variación del ratio se expresa en puntos porcentuales (pp).'}
            {inventarioIncluido && ' Control de inventarios es un saldo mensual: mes a mes se muestra el valor de cada mes y en los acumulados entra como promedio, no como suma.'}
          </span>
        </p>
      </Panel>
    </div>
  );
}
