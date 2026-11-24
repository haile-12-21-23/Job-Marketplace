import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const workspace = await readFile(resolve(root, 'pnpm-workspace.yaml'), 'utf8');
if (!workspace.includes('apps/*') || !workspace.includes('packages/*')) {
  throw new Error('pnpm-workspace.yaml must include apps/* and packages/*');
}

const packageFiles = [
  'apps/web/package.json',
  'apps/api/package.json',
  'packages/contracts/package.json',
  'packages/config/package.json',
];
const packages = new Map();
for (const file of packageFiles) {
  const manifest = JSON.parse(await readFile(resolve(root, file), 'utf8'));
  packages.set(manifest.name, { file, manifest });
}

const missing = [];
for (const [name, { file, manifest }] of packages) {
  const deps = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
  };
  for (const [dependency, specifier] of Object.entries(deps)) {
    if (specifier === 'workspace:*' && !packages.has(dependency)) {
      missing.push(`${file}: ${name} references missing workspace package ${dependency}`);
    }
  }
}

for (const name of ['@jmp/web', '@jmp/api', '@jmp/contracts']) {
  if (!packages.has(name)) missing.push(`Required workspace package is missing: ${name}`);
}
if (missing.length) throw new Error(missing.join('\n'));
console.log(`Workspace structure OK (${packages.size} packages; all workspace:* references resolve).`);
