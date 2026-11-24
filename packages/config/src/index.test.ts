import { describe, expect, it } from 'vitest';
import { CONFIG_PACKAGE_NAME } from './index.js';

describe('@jmp/config', () => {
  it('exposes its workspace package name', () => {
    expect(CONFIG_PACKAGE_NAME).toBe('@jmp/config');
  });
});
