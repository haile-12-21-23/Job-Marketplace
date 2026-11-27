import 'dotenv/config';
import { prisma, disconnectDatabase } from '../src/infrastructure/database/prisma.js';
import { seedPlatformRbac } from '../src/modules/authorization/seed-platform-rbac.js';

/**
 * Deterministic, idempotent database seeder.
 *
 * Seeds baseline platform roles, permission catalogue entries, and explicit role-permission
 * mappings cleanly without creating fake users or overwriting custom grants.
 */
async function main(): Promise<void> {
  console.log('Seeding baseline platform RBAC roles, permissions, and mappings...');

  const result = await seedPlatformRbac(prisma);

  console.log(
    `Seeded ${result.rolesUpserted} roles, ${result.permissionsUpserted} permissions, and ${result.rolePermissionPairsProcessed} role-permission mappings.`,
  );
}

main()
  .catch((err) => {
    console.error('Database seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
