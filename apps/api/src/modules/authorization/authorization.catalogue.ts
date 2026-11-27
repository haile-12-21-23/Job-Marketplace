export const PLATFORM_ROLE_CODES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  JOB_MODERATOR: 'JOB_MODERATOR',
  VERIFICATION_ADMIN: 'VERIFICATION_ADMIN',
  SUPPORT_ADMIN: 'SUPPORT_ADMIN',
} as const;

export type PlatformRoleCode = (typeof PLATFORM_ROLE_CODES)[keyof typeof PLATFORM_ROLE_CODES];

export const PLATFORM_PERMISSIONS = {
  PLATFORM_USERS_READ: 'platform.users.read',
  PLATFORM_USERS_MANAGE: 'platform.users.manage',
  PLATFORM_ROLES_READ: 'platform.roles.read',
  PLATFORM_ROLES_MANAGE: 'platform.roles.manage',
  PLATFORM_ROLES_ASSIGN: 'platform.roles.assign',
  JOBS_MODERATE: 'jobs.moderate',
  EMPLOYERS_VERIFICATION_REVIEW: 'employers.verification.review',
  REPORTS_MANAGE: 'reports.manage',
  AUDIT_LOGS_READ: 'audit_logs.read',
} as const;

export type PlatformPermissionCode =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

export interface PlatformRoleSeedEntry {
  readonly code: PlatformRoleCode;
  readonly name: string;
  readonly description: string;
}

export interface PermissionSeedEntry {
  readonly code: PlatformPermissionCode;
  readonly description: string;
}

export const INITIAL_PLATFORM_ROLES: ReadonlyArray<PlatformRoleSeedEntry> = [
  {
    code: PLATFORM_ROLE_CODES.SUPER_ADMIN,
    name: 'Super Administrator',
    description: 'Full platform administration privileges across all domains',
  },
  {
    code: PLATFORM_ROLE_CODES.JOB_MODERATOR,
    name: 'Job Moderator',
    description: 'Review, approve, reject, and moderate job postings',
  },
  {
    code: PLATFORM_ROLE_CODES.VERIFICATION_ADMIN,
    name: 'Verification Administrator',
    description: 'Review and approve or reject employer verification requests',
  },
  {
    code: PLATFORM_ROLE_CODES.SUPPORT_ADMIN,
    name: 'Support Administrator',
    description: 'Customer support, report resolution, and platform inquiries',
  },
];

export const INITIAL_PERMISSIONS: ReadonlyArray<PermissionSeedEntry> = [
  {
    code: PLATFORM_PERMISSIONS.PLATFORM_USERS_READ,
    description: 'Read platform user accounts and verification/status metadata',
  },
  {
    code: PLATFORM_PERMISSIONS.PLATFORM_USERS_MANAGE,
    description: 'Suspend, reactivate, and manage platform user account statuses',
  },
  {
    code: PLATFORM_PERMISSIONS.PLATFORM_ROLES_READ,
    description: 'Read platform RBAC role and permission catalogue definitions',
  },
  {
    code: PLATFORM_PERMISSIONS.PLATFORM_ROLES_MANAGE,
    description: 'Create and update platform role permission mappings',
  },
  {
    code: PLATFORM_PERMISSIONS.PLATFORM_ROLES_ASSIGN,
    description: 'Grant and revoke platform role assignments on user accounts',
  },
  {
    code: PLATFORM_PERMISSIONS.JOBS_MODERATE,
    description: 'Review, approve, reject, and moderate job postings',
  },
  {
    code: PLATFORM_PERMISSIONS.EMPLOYERS_VERIFICATION_REVIEW,
    description: 'Review, approve, and reject employer verification requests',
  },
  {
    code: PLATFORM_PERMISSIONS.REPORTS_MANAGE,
    description: 'Review, investigate, and resolve abuse, fraud, and support reports',
  },
  {
    code: PLATFORM_PERMISSIONS.AUDIT_LOGS_READ,
    description: 'Inspect platform administrative and security audit log entries',
  },
];

const ALL_CATALOGUE_PERMISSIONS: ReadonlyArray<PlatformPermissionCode> = INITIAL_PERMISSIONS.map(
  (permission) => permission.code,
);

/**
 * Baseline role-to-permission matrix seeded idempotently into PostgreSQL.
 * SUPER_ADMIN grants are materialized as explicit RolePermission rows rather than bypassed in code.
 */
export const INITIAL_ROLE_PERMISSION_MAP: Readonly<
  Record<PlatformRoleCode, ReadonlyArray<PlatformPermissionCode>>
> = {
  [PLATFORM_ROLE_CODES.SUPER_ADMIN]: ALL_CATALOGUE_PERMISSIONS,
  [PLATFORM_ROLE_CODES.JOB_MODERATOR]: [PLATFORM_PERMISSIONS.JOBS_MODERATE],
  [PLATFORM_ROLE_CODES.VERIFICATION_ADMIN]: [PLATFORM_PERMISSIONS.EMPLOYERS_VERIFICATION_REVIEW],
  [PLATFORM_ROLE_CODES.SUPPORT_ADMIN]: [PLATFORM_PERMISSIONS.REPORTS_MANAGE],
};
