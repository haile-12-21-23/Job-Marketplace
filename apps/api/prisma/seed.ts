import 'dotenv/config';
import { prisma, disconnectDatabase } from '../src/infrastructure/database/prisma.js';

interface PlatformRoleSeed {
  code: string;
  name: string;
  description: string;
}

const INITIAL_PLATFORM_ROLES: PlatformRoleSeed[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Administrator',
    description: 'Full platform administration privileges across all domains',
  },
  {
    code: 'JOB_MODERATOR',
    name: 'Job Moderator',
    description: 'Review, approve, reject, and moderate job postings',
  },
  {
    code: 'VERIFICATION_ADMIN',
    name: 'Verification Administrator',
    description: 'Review and approve or reject employer verification requests',
  },
  {
    code: 'SUPPORT_ADMIN',
    name: 'Support Administrator',
    description: 'Customer support, report resolution, and platform inquiries',
  },
];

/**
 * Deterministic, idempotent database seeder for JMP-27.
 *
 * Seeds baseline platform role reference data required for RBAC bootstrap.
 *
 * NOTE: Granular permission codes and role-permission mappings will be seeded
 * when the authorization matrix is implemented in domain authorization tasks (JMP-Auth).
 * No fake accounts, passwords, or personal data are seeded here.
 */
async function main(): Promise<void> {
  console.log('Seeding initial platform roles...');

  for (const role of INITIAL_PLATFORM_ROLES) {
    const record = await prisma.platformRole.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
      },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
      },
    });
    console.log(`  ✓ Seeded role: ${record.code} (${record.name})`);
  }

  console.log('Initial platform roles seeded successfully.');
}

main()
  .catch((err) => {
    console.error('Database seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
