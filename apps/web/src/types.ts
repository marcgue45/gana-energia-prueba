import type { CriterionKey, LeadSource, LeadStatus, Priority } from '@leads/shared';

// Forma de las respuestas de la API (las fechas llegan como texto ISO)
export type AgentRef = { id: number; name: string };
export type Agent = AgentRef & { role: 'agent' | 'admin' };

export type LeadListItem = {
  id: number;
  name: string;
  phone: string;
  status: LeadStatus;
  agent: AgentRef | null;
  score: number;
  priority: Priority;
  version: number;
  updatedAt: string;
};

export type LeadList = { items: LeadListItem[]; total: number; page: number; pageSize: number; weightsVersion: number };

export type BreakdownItem = { criterion: CriterionKey; rating: number; weight: number; contribution: number; note?: string };

export type LeadDetail = LeadListItem & {
  isNewCustomer: boolean | null;
  interest: number | null;
  source: LeadSource | null;
  createdAt: string;
  breakdown: BreakdownItem[];
  weightsVersion: number;
};

export type WeightsDto = { weights: { criterion: CriterionKey; weight: number }[]; version: number; updatedAt: string };
