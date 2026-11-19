import type { Categoria } from '@/types/coq';

export const CATEGORIAS: { key: Categoria; title: string; color: 'emerald' | 'blue' | 'orange' | 'rose' }[] = [
  { key: 'prevencion', title: 'Costos de prevención', color: 'emerald' },
  { key: 'evaluacion', title: 'Costos de evaluación', color: 'blue' },
  { key: 'fallasInternas', title: 'Costos de fallas internas (no calidad)', color: 'orange' },
  { key: 'fallasExternas', title: 'Costos de fallas externas (no calidad)', color: 'rose' },
];

/**
 * Fuente de control de inventarios del cubo (valoración de exceso de inventario contra la meta).
 * Hoy el cubo tiene datos desde 2024 (con algunos meses sin carga). Se suma al CoQ por
 * defecto, como en el Excel inicial del proyecto; el usuario puede excluirla del cálculo.
 */
export const FUENTE_INVENTARIO = 'CuboControlInventarios';

/** Correspondencia entre las fuentes del cubo y los indicadores del prototipo (ajustable). */
export const FUENTES_INDICADOR = {
  scrap: ['CuboDesperdiciosBalanzas', 'APP Desperdicios Plástico'],
  defectos: ['CuboDefectosDevolucionesMuestreos'],
  eficiencia: ['CuboEficienciaOperativaAgrupado'],
} as const;

export const BENCHMARKS = {
  total_coq_sales: 0.05,
  fallas_externas_sales: 0.015,
  fallas_internas_sales: 0.025,
  prevencion_min_share: 0.3,
  scrap_max_sales: 0.008,
  microparadas_max_sales: 0.005,
  defectos_max_sales: 0.015,
  evaluacion_max_share: 0.35,
};

/**
 * Nombre de cada centro. Deducido de los datos: los procesos que dicen "Quito" aparecen solo en el centro
 * 1000 y los que dicen "Guayaquil" solo en el 2000. Un centro nuevo se muestra con su código hasta que se agregue aquí.
 */
export const CENTROS_NOMBRE: Record<string, string> = { '1000': 'Quito', '2000': 'Guayaquil' };
export const centroLabel = (c: string) => (CENTROS_NOMBRE[c] ? `${CENTROS_NOMBRE[c]} (${c})` : c);

export const MESES =['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
