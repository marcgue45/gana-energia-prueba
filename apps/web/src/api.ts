import type { LeadCreateInput, LeadListQuery, LeadUpdateInput } from '@leads/shared';
import type { Agent, LeadDetail, LeadList, WeightsDto } from './types';

export type FieldError = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  // Errores de validación por campo (400), para pintarlos junto a cada input
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries((this.details as FieldError[]).map((d) => [d.path, d.message]));
  }
}

// Autenticación simulada: el agente elegido en el selector viaja en la cabecera X-Agent-Id.
// La API comprueba en la BD que existe y qué rol tiene; la web no decide permisos.
let agentId: number | null = null;
export function setSessionAgent(id: number | null) {
  agentId = id;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (agentId !== null) headers['x-agent-id'] = String(agentId);
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se puede conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'HTTP_ERROR', data?.error?.message ?? `Error ${res.status}`, data?.error?.details);
  }
  return data as T;
}

function toQueryString(query: Partial<LeadListQuery>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.size ? `?${params}` : '';
}

export const api = {
  agents: () => request<Agent[]>('GET', '/agents'),
  listLeads: (query: Partial<LeadListQuery>) => request<LeadList>('GET', `/leads${toQueryString(query)}`),
  getLead: (id: number) => request<LeadDetail>('GET', `/leads/${id}`),
  createLead: (input: LeadCreateInput) => request<LeadDetail>('POST', '/leads', input),
  updateLead: (id: number, input: LeadUpdateInput) => request<LeadDetail>('PATCH', `/leads/${id}`, input),
  assign: (id: number, targetAgentId?: number) =>
    request<LeadDetail>('POST', `/leads/${id}/assign`, targetAgentId === undefined ? {} : { agentId: targetAgentId }),
  unassign: (id: number) => request<LeadDetail>('POST', `/leads/${id}/unassign`),
  getWeights: () => request<WeightsDto>('GET', '/weights'),
  putWeights: (weights: WeightsDto['weights'], version: number) => request<WeightsDto>('PUT', '/weights', { weights, version }),
};
