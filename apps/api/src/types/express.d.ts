import type {
  AuthenticatedPrincipal,
  AuthorizedEmployerAccess,
} from '../modules/authorization/domain/principal.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthenticatedPrincipal | undefined;
      employerAccess?: AuthorizedEmployerAccess | undefined;
    }
  }
}

export {};
