import type { Categoria, CostoRow, VentaRow, YearTotals, FuenteTotal, MesTotals } from '@/types/coq';
import { BENCHMARKS, FUENTES_INDICADOR, FUENTE_INVENTARIO } from '@/lib/coq-config';

export function categoriaDeTipo(tipo: string): Categoria | null {
  const t = (tipo || '').toUpperCase();
  if (t.includes('PREVENCION') || t.includes('PREVENCIÓN')) return 'prevencion';
  if (t.includes('EVALUACION') || t.includes('EVALUACIÓN')) return 'evaluacion';
  if (t.includes('INTERNAS')) return 'fallasInternas';
  if (t.includes('EXTERNAS')) return 'fallasExternas';
  return null;
}

/** Etiqueta para procesos vacíos: varias fuentes (p. ej. diferencias de inventario) no informan proceso. */
export const SIN_PROCESO = '(Sin proceso)';

/** Filtro por centro: null = todos los centros. */
const coincideCentro = (centro: string | null, valor: string) => centro === null || valor === centro;

interface RefAcc { descripcion: string; importe: number }
interface ProcAcc { importe: number; refs: Map<string, RefAcc> }
interface FuenteAcc { importe: number; procesos: Map<string, ProcAcc> }

/**
 * Totales de un año entre `mesDesde` y `mesHasta` (comparación homogénea entre años). `centro` null = todos.
 * Por defecto es el acumulado desde enero; con mesDesde = mesHasta se obtiene un mes individual.
 */
export function computeYear(
  anio: number,
  mesHasta: number,
  costos: CostoRow[],
  ventas: VentaRow[],
  incluirInventario: boolean,
  centro: string | null = null,
  mesDesde = 1,
): YearTotals {
  const sums: Record<Categoria, number> = { prevencion: 0, evaluacion: 0, fallasInternas: 0, fallasExternas: 0 };
  const fuentesMap: Record<Categoria, Map<string, FuenteAcc>> = {
    prevencion: new Map(), evaluacion: new Map(), fallasInternas: new Map(), fallasExternas: new Map(),
  };
  const porFuente: Record<string, number> = {};
  let inventario = 0;

  // Control de inventarios es un SALDO mensual (la misma foto del exceso se repite cada mes): en un periodo de
  // varios meses se promedia entre los meses con dato; sumarlo contaría el mismo inventario varias veces.
  const mesesInv = new Set<number>();
  for (const r of costos) {
    if (r.fuente === FUENTE_INVENTARIO && r.anio === anio && r.mes <= mesHasta && r.mes >= mesDesde && coincideCentro(centro, r.centro)) mesesInv.add(r.mes);
  }
  const divInv = mesesInv.size || 1;

  for (const r of costos) {
    if (r.anio !== anio || r.mes > mesHasta || r.mes < mesDesde || !coincideCentro(centro, r.centro)) continue;
    const cat = categoriaDeTipo(r.tipo);
    if (!cat) continue;
    const imp = (Number(r.importe) || 0) / (r.fuente === FUENTE_INVENTARIO ? divInv : 1);

    // Desglose fuente -> proceso -> referencia
    const mapa = fuentesMap[cat];
    const fu = mapa.get(r.fuente) ?? { importe: 0, procesos: new Map<string, ProcAcc>() };
    fu.importe += imp;
    const procKey = r.proceso || SIN_PROCESO;
    const pr = fu.procesos.get(procKey) ?? { importe: 0, refs: new Map<string, RefAcc>() };
    pr.importe += imp;
    const rf = pr.refs.get(r.referencia) ?? { descripcion: r.descripcion, importe: 0 };
    rf.importe += imp;
    pr.refs.set(r.referencia, rf);
    fu.procesos.set(procKey, pr);
    mapa.set(r.fuente, fu);

    porFuente[r.fuente] = (porFuente[r.fuente] || 0) + imp;
    if (r.fuente === FUENTE_INVENTARIO) {
      inventario += imp;
      if (!incluirInventario) continue;
    }
    sums[cat] += imp;
  }

  const porImporte = (a: { importe: number }, b: { importe: number }) => Math.abs(b.importe) - Math.abs(a.importe);
  const fuentes = {} as Record<Categoria, FuenteTotal[]>;
  (Object.keys(fuentesMap) as Categoria[]).forEach((cat) => {
    fuentes[cat] = [...fuentesMap[cat].entries()]
      .map(([fuente, fu]) => ({
        fuente,
        importe: fu.importe,
        excluido: fuente === FUENTE_INVENTARIO && !incluirInventario,
        promedioMeses: fuente === FUENTE_INVENTARIO ? mesesInv.size : undefined,
        procesos: [...fu.procesos.entries()]
          .map(([proceso, pr]) => ({
            proceso,
            importe: pr.importe,
            referencias: [...pr.refs.entries()]
              .map(([referencia, rf]) => ({ referencia, descripcion: rf.descripcion, importe: rf.importe }))
              .sort(porImporte),
          }))
          .sort(porImporte),
      }))
      .sort((a, b) => b.importe - a.importe);
  });

  const sales = ventas
    .filter((v) => v.anio === anio && v.mes <= mesHasta && v.mes >= mesDesde && coincideCentro(centro, v.centro))
    .reduce((s, v) => s + (Number(v.ventas) || 0), 0);
  const inversion = sums.prevencion + sums.evaluacion;
  const perdida = sums.fallasInternas + sums.fallasExternas;
  return {
    anio, sales, ...sums, inversion, perdida, total: inversion + perdida,
    inventario, inventarioMeses: mesesInv.size, inventarioIncluido: incluirInventario, fuentes, porFuente,
  };
}

/** Totales de cada mes (1-12) de un año, para la comparativa mensual. Los meses sin datos quedan en cero. */
export function computeMeses(
  anio: number,
  costos: CostoRow[],
  ventas: VentaRow[],
  incluirInventario: boolean,
  centro: string | null = null,
): MesTotals[] {
  const meses: MesTotals[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1, sales: 0, prevencion: 0, evaluacion: 0, fallasInternas: 0, fallasExternas: 0, total: 0, inventario: 0,
  }));
  for (const r of costos) {
    if (r.anio !== anio || r.mes < 1 || r.mes > 12 || !coincideCentro(centro, r.centro)) continue;
    if (r.fuente === FUENTE_INVENTARIO && !incluirInventario) continue;
    const cat = categoriaDeTipo(r.tipo);
    if (!cat) continue;
    const imp = Number(r.importe) || 0;
    const m = meses[r.mes - 1];
    m[cat] += imp;
    m.total += imp;
    if (r.fuente === FUENTE_INVENTARIO) m.inventario += imp;
  }
  for (const v of ventas) {
    if (v.anio !== anio || v.mes < 1 || v.mes > 12 || !coincideCentro(centro, v.centro)) continue;
    meses[v.mes - 1].sales += Number(v.ventas) || 0;
  }
  return meses;
}

/**
 * Acumulado de varios meses: Control de inventarios (saldo mensual) entra como promedio de los meses con dato
 * y no como suma. `a` trae los importes ya sumados; `mesesInv` es el número de meses con dato de esa fuente.
 */
export function conInventarioPromedio<T extends { inventario: number; fallasInternas: number; total: number }>(a: T, mesesInv: number): T {
  if (mesesInv <= 1) return a;
  const ajuste = a.inventario - a.inventario / mesesInv;
  return { ...a, inventario: a.inventario / mesesInv, fallasInternas: a.fallasInternas - ajuste, total: a.total - ajuste };
}

export const sumFuentes = (t: YearTotals, lista: readonly string[]) =>
  lista.reduce((s, f) => s + (t.porFuente[f] || 0), 0);

export interface Diagnostico {
  item: string; current: string; target: string; status: 'critical' | 'warning'; msg: string; suggest: string;
}
/** Cómo se obtiene un indicador: numerador ÷ denominador, con sus importes reales (para la ayuda visual). */
export interface CalculoBenchmark {
  numLabel: string; num: number;
  denLabel: string; den: number;
  /** Fuentes del cubo que componen el numerador (cuando no es una categoría completa). */
  fuentes?: readonly string[];
  /** Regla de cumplimiento, p. ej. "≤ 5,0 %". */
  regla: string;
}
export interface FilaBenchmark {
  param: string; desc: string; actual: string; world: string; status: 'success' | 'warning' | 'critical';
  calculo: CalculoBenchmark;
}

const pct = (n: number, d = 2) => `${(n * 100).toFixed(d)}%`;
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

export function computeDiagnostics(t: YearTotals): Diagnostico[] {
  const B = BENCHMARKS;
  const obs: Diagnostico[] = [];
  const coq = ratio(t.total, t.sales);
  if (coq > B.total_coq_sales)
    obs.push({
      item: 'Costo total de calidad / Ventas', current: `${pct(coq)} ventas`, target: `< ${pct(B.total_coq_sales, 1)} ventas`,
      status: 'critical', msg: 'Los costos de calidad drenan el margen de utilidad.',
      suggest: 'Rebalancear presupuesto hacia prevención para reducir fallas internas.',
    });
  const fi = ratio(t.fallasInternas, t.sales);
  if (fi > B.fallas_internas_sales)
    obs.push({
      item: 'Fallas internas / Ventas', current: `${pct(fi)} ventas`, target: `< ${pct(B.fallas_internas_sales, 1)} ventas`,
      status: 'critical', msg: 'Las pérdidas detectadas dentro de planta (desperdicio, reprocesos, diferencias e inventario) superan el rango de referencia.',
      suggest: 'Priorizar las fuentes de mayor importe en el detalle de fallas internas y atacar su causa raíz.',
    });
  const fe = ratio(t.fallasExternas, t.sales);
  if (fe > B.fallas_externas_sales)
    obs.push({
      item: 'Fallas externas / Ventas', current: `${pct(fe)} ventas`, target: `< ${pct(B.fallas_externas_sales, 1)} ventas`,
      status: 'critical', msg: 'Devoluciones, garantías y reclamos de clientes superan el rango de referencia.',
      suggest: 'Revisar los reclamos recurrentes y reforzar la inspección final antes del despacho.',
    });
  const prevShare = ratio(t.prevencion, t.total);
  if (t.total > 0 && prevShare < B.prevencion_min_share)
    obs.push({
      item: 'Prevención / CoQ', current: `${pct(prevShare, 1)} del CoQ`, target: `> ${pct(B.prevencion_min_share, 0)} del CoQ`,
      status: 'warning', msg: 'La inversión en prevención es baja frente al costo total: el CoQ está dominado por fallas.',
      suggest: 'Asignar presupuesto a capacitación, mantenimiento preventivo y control de proceso.',
    });
  const defectos = ratio(sumFuentes(t, FUENTES_INDICADOR.defectos), t.sales);
  if (defectos > B.defectos_max_sales)
    obs.push({
      item: 'Defectos en materiales y productos', current: `${pct(defectos)} ventas`, target: `< ${pct(B.defectos_max_sales, 1)} ventas`,
      status: 'critical', msg: 'La tasa de rechazo interno supera los parámetros tolerables de manufactura.',
      suggest: 'Reforzar la inspección en estaciones clave y las auditorías de proceso.',
    });
  const efi = ratio(sumFuentes(t, FUENTES_INDICADOR.eficiencia), t.sales);
  if (efi > B.microparadas_max_sales)
    obs.push({
      item: 'Pérdida de eficiencia (OEE / paros)', current: `${pct(efi)} ventas`, target: `< ${pct(B.microparadas_max_sales, 1)} ventas`,
      status: 'critical', msg: 'Microparadas y tiempos muertos erosionan la capacidad operativa.',
      suggest: 'Análisis de causa raíz con las auditorías LEAN mensuales.',
    });
  const evalShare = ratio(t.evaluacion, t.total);
  if (evalShare > B.evaluacion_max_share)
    obs.push({
      item: 'Costos de evaluación / CoQ', current: `${pct(evalShare, 1)} del CoQ`, target: `< ${pct(B.evaluacion_max_share, 0)} del CoQ`,
      status: 'warning', msg: 'Se destina un presupuesto desproporcionado a auditorías y calibraciones.',
      suggest: 'Digitalizar auditorías y optimizar la frecuencia de calibración.',
    });
  return obs;
}

export function computeBenchmarks(t: YearTotals): FilaBenchmark[] {
  const B = BENCHMARKS;
  const imp = {
    scrap: sumFuentes(t, FUENTES_INDICADOR.scrap),
    defectos: sumFuentes(t, FUENTES_INDICADOR.defectos),
    eficiencia: sumFuentes(t, FUENTES_INDICADOR.eficiencia),
  };
  const coq = ratio(t.total, t.sales);
  const prev = ratio(t.prevencion, t.total);
  const scrap = ratio(imp.scrap, t.sales);
  const def = ratio(imp.defectos, t.sales);
  const efi = ratio(imp.eficiencia, t.sales);
  const ext = ratio(t.fallasExternas, t.sales);
  const int = ratio(t.fallasInternas, t.sales);
  const ventas = 'Ventas netas';
  return [
    { param: 'Costo total de calidad (CoQ) / Ventas', desc: 'Egresos totales de calidad sobre ventas netas', actual: pct(coq), world: `< ${pct(B.total_coq_sales, 1)}`, status: coq <= B.total_coq_sales ? 'success' : 'critical',
      calculo: { numLabel: 'Costo total de calidad (prevención + evaluación + fallas internas + fallas externas)', num: t.total, denLabel: ventas, den: t.sales, regla: `≤ ${pct(B.total_coq_sales, 1)}` } },
    { param: 'Prevención / CoQ', desc: 'Esfuerzo financiero en proactividad', actual: pct(prev), world: `> ${pct(B.prevencion_min_share, 1)}`, status: prev >= B.prevencion_min_share ? 'success' : 'warning',
      calculo: { numLabel: 'Costos de prevención', num: t.prevencion, denLabel: 'Costo total de calidad (CoQ)', den: t.total, regla: `≥ ${pct(B.prevencion_min_share, 1)}` } },
    { param: 'Fallas internas / Ventas', desc: 'Pérdidas detectadas dentro de planta', actual: pct(int), world: `< ${pct(B.fallas_internas_sales, 1)}`, status: int <= B.fallas_internas_sales ? 'success' : 'critical',
      calculo: { numLabel: 'Costos de fallas internas', num: t.fallasInternas, denLabel: ventas, den: t.sales, regla: `≤ ${pct(B.fallas_internas_sales, 1)}` } },
    { param: 'Desperdicios (scrap) / Ventas', desc: 'Pérdida material directa en fabricación', actual: pct(scrap), world: `< ${pct(B.scrap_max_sales)}`, status: scrap <= B.scrap_max_sales ? 'success' : 'critical',
      calculo: { numLabel: 'Costo de desperdicios', num: imp.scrap, denLabel: ventas, den: t.sales, fuentes: FUENTES_INDICADOR.scrap, regla: `≤ ${pct(B.scrap_max_sales)}` } },
    { param: 'Defectos / Ventas', desc: 'Tasa de rechazo interna pre-despacho', actual: pct(def), world: `< ${pct(B.defectos_max_sales)}`, status: def <= B.defectos_max_sales ? 'success' : 'critical',
      calculo: { numLabel: 'Costo de defectos', num: imp.defectos, denLabel: ventas, den: t.sales, fuentes: FUENTES_INDICADOR.defectos, regla: `≤ ${pct(B.defectos_max_sales)}` } },
    { param: 'Pérdida de eficiencia (OEE) / Ventas', desc: 'Averías y paros imprevistos en líneas', actual: pct(efi), world: `< ${pct(B.microparadas_max_sales)}`, status: efi <= B.microparadas_max_sales ? 'success' : 'critical',
      calculo: { numLabel: 'Costo de pérdida de eficiencia', num: imp.eficiencia, denLabel: ventas, den: t.sales, fuentes: FUENTES_INDICADOR.eficiencia, regla: `≤ ${pct(B.microparadas_max_sales)}` } },
    { param: 'Fallas externas / Ventas', desc: 'Devoluciones, multas y garantías de cliente', actual: pct(ext), world: `< ${pct(B.fallas_externas_sales)}`, status: ext <= B.fallas_externas_sales ? 'success' : 'critical',
      calculo: { numLabel: 'Costos de fallas externas', num: t.fallasExternas, denLabel: ventas, den: t.sales, regla: `≤ ${pct(B.fallas_externas_sales)}` } },
  ];
}
