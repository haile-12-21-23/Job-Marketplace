import { z } from 'zod';
import { paginationMetaSchema, type PaginationMeta } from './pagination.js';

/**
 * Reusable schema factory for single-resource response envelopes.
 * Form: { data: T }
 */
export function createDataEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
  });
}

/**
 * Reusable schema factory for paginated collection response envelopes.
 * Form: { data: T[], meta: { pagination: PaginationMeta } }
 */
export function createPaginatedEnvelopeSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    meta: z.object({
      pagination: paginationMetaSchema,
    }),
  });
}

// Aliases matching alternative naming conventions
export const createSingleResourceResponseSchema = createDataEnvelopeSchema;
export const createCollectionResponseSchema = createPaginatedEnvelopeSchema;

export type DataEnvelope<T> = {
  data: T;
};

export type PaginatedEnvelope<T> = {
  data: T[];
  meta: {
    pagination: PaginationMeta;
  };
};

export type SingleResourceResponse<T> = DataEnvelope<T>;
export type CollectionResponse<T> = PaginatedEnvelope<T>;
