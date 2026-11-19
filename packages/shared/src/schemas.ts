import { z } from 'zod';
import { INTEREST_MAX, INTEREST_MIN, SOURCE_RATINGS, type LeadSource } from './constants.js';
import type { CriterionKey, Weights } from './scoring.js';

export const CRITERIA = ['newCustomer', 'interest', 'source', 'age'] as const satisfies readonly CriterionKey[];
export const LEAD_STATUSES = ['new', 'in_progress', 'contacted', 'closed'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_SOURCES = Object.keys(SOURCE_RATINGS) as [LeadSource, ...LeadSource[]];

// ---------- Pesos ----------
// La API recibe una lista [{ criterion, weight }] en vez de un objeto: con un objeto JSON
// las claves duplicadas no se pueden detectar (JSON.parse se queda con la última en silencio).
// Pesos enteros: evita errores de coma flotante al exigir que sumen exactamente 100.
export const weightsInputSchema = z
  .array(
    z.object({
      criterion: z.enum(CRITERIA),
      weight: z.int().min(0, 'El peso no puede ser negativo').max(100, 'El peso no puede superar 100'),
    }),
  )
  .superRefine((items, ctx) => {
    const seen = new Set<CriterionKey>();
    items.forEach((item, i) => {
      if (seen.has(item.criterion)) {
        ctx.addIssue({ code: 'custom', path: [i, 'criterion'], message: `Criterio duplicado: ${item.criterion}` });
      }
      seen.add(item.criterion);
    });
    for (const c of CRITERIA) {
      if (!seen.has(c)) ctx.addIssue({ code: 'custom', message: `Falta el criterio: ${c}` });
    }
    const sum = items.reduce((s, item) => s + item.weight, 0);
    if (sum !== 100) ctx.addIssue({ code: 'custom', message: `Los pesos suman ${sum}; deben sumar exactamente 100` });
  })
  .transform((items) => Object.fromEntries(items.map((i) => [i.criterion, i.weight])) as Weights);

// ---------- Leads ----------
// Teléfono: se guarda normalizado (sin espacios, guiones ni paréntesis) para que la búsqueda sea consistente.
const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-().]/g, ''))
  .pipe(z.string().regex(/^\+?\d{9,15}$/, 'Teléfono no válido: de 9 a 15 dígitos, con + opcional'));

// Campos editables de un lead. Los atributos de puntuación admiten null (dato ausente → valoración 0).
// Objetos estrictos: si el navegador envía campos que no le corresponden (score, ratings, agentId…)
// la petición se rechaza en vez de ignorarlos en silencio.
const leadFields = {
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120, 'Máximo 120 caracteres'),
  phone: phoneSchema,
  isNewCustomer: z.boolean().nullable(),
  interest: z
    .int(`El interés debe ser un entero entre ${INTEREST_MIN} y ${INTEREST_MAX}`)
    .min(INTEREST_MIN, `El interés mínimo es ${INTEREST_MIN}`)
    .max(INTEREST_MAX, `El interés máximo es ${INTEREST_MAX}`)
    .nullable(),
  source: z.enum(LEAD_SOURCES).nullable(),
};

export const leadCreateSchema = z.strictObject({
  ...leadFields,
  isNewCustomer: leadFields.isNewCustomer.default(null),
  interest: leadFields.interest.default(null),
  source: leadFields.source.default(null),
});
export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

// Edición parcial con bloqueo optimista: `version` es la versión del lead que vio el cliente.
// Sin defaults: un campo que no llega no se toca (un default a null borraría datos).
export const leadUpdateSchema = z
  .strictObject({
    ...leadFields,
    status: z.enum(LEAD_STATUSES),
  })
  .partial()
  .extend({ version: z.int().positive() })
  .refine((v) => Object.keys(v).length > 1, 'No hay ningún campo que modificar');
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

export const assignSchema = z.strictObject({ agentId: z.int().positive().optional() });

// Listado: los parámetros llegan como texto en la query string
export const PAGE_SIZE_MAX = 100;
export const leadListQuerySchema = z.strictObject({
  status: z.enum(LEAD_STATUSES).optional(),
  agentId: z.union([z.literal('none'), z.coerce.number().int().positive()]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

export const weightsUpdateSchema = z.strictObject({
  weights: weightsInputSchema,
  version: z.int().positive(),
});
