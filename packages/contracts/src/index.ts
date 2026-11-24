/** Shared API version identifier. Concrete Zod request/response schemas are added in JMP-28. */
export const API_VERSION = 'v1' as const;

export type ApiVersion = typeof API_VERSION;
