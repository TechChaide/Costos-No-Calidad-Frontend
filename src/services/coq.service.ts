import type { CoqEstado, CostoRow, VentaRow } from '@/types/coq';
import type { BodyListResponse } from '@/types/body-list-response';
import type { BodyResponse } from '@/types/body-response';
import { environment } from '@/environments/environments.prod';
import { fetchWithAuth } from '@/lib/http-client';

const API_URL = `${environment.apiCostosURL}/api/coq`;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`${API_URL}${path}`, { cache: 'no-store', ...init });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
    throw new Error(errorBody.message || errorBody.error || `Error al consultar ${path}`);
  }
  return response.json();
}

export const coqService = {
  async getCostos(): Promise<CostoRow[]> {
    const body = await call<BodyListResponse<CostoRow>>('/costos-nc');
    return body.data;
  },

  async getVentas(): Promise<VentaRow[]> {
    const body = await call<BodyListResponse<VentaRow>>('/ventas');
    return body.data;
  },

  async getEstado(): Promise<CoqEstado> {
    const body = await call<BodyResponse<CoqEstado>>('/actualizar');
    return body.data;
  },

  async actualizar(completa = false): Promise<CoqEstado> {
    const body = await call<BodyResponse<CoqEstado>>(`/actualizar${completa ? '?completa=1' : ''}`, { method: 'POST' });
    return body.data;
  },
};
