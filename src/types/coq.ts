export type Categoria = 'prevencion' | 'evaluacion' | 'fallasInternas' | 'fallasExternas';

export interface CostoRow {
  anio: number; mes: number; centro: string; proceso: string; referencia: string; descripcion: string;
  tipo: string; fuente: string; importe: number;
}
export interface VentaRow { anio: number; mes: number; centro: string; ventas: number }

/** Estado de la extracción desde SQL Server (marcas de tiempo en ms). */
export interface CoqEstado {
  costosAl: number | null;
  ventasAl: number | null;
  ventasCompletaAl: number | null;
  /** Último día con ventas en el cubo (yyyy-mm-dd). */
  ventasHasta: string | null;
  actualizando: boolean;
  error: string | null;
}

/** Detalle de una fuente: proceso y, dentro de este, referencia (para el desglose por niveles). */
export interface ReferenciaTotal { referencia: string; descripcion: string; importe: number }
export interface ProcesoTotal { proceso: string; importe: number; referencias: ReferenciaTotal[] }
export interface FuenteTotal { fuente: string; importe: number; excluido?: boolean; procesos: ProcesoTotal[] }

/** Valores de un mes para la comparativa mensual. */
export interface MesTotals { mes: number; sales: number; prevencion: number; evaluacion: number; fallasInternas: number; fallasExternas: number; total: number }

export interface YearTotals {
  anio: number;
  sales: number;
  prevencion: number;
  evaluacion: number;
  fallasInternas: number;
  fallasExternas: number;
  inversion: number;
  perdida: number;
  total: number;
  /** Importe de CuboControlInventarios (esté o no incluido en el CoQ). */
  inventario: number;
  inventarioIncluido: boolean;
  fuentes: Record<Categoria, FuenteTotal[]>;
  porFuente: Record<string, number>;
}
