import { z } from 'zod';

/**
 * Public opaque UUID identifier schema matching JMP API Standards.
 * Sequential internal database IDs are never exposed publicly.
 */
export const publicIdSchema = z.string().uuid();

export type PublicId = z.infer<typeof publicIdSchema>;
