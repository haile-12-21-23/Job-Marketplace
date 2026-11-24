import { describe, expect, it } from 'vitest';
import { WEB_API_BASE_PATH, WEB_APP_NAME } from './index.js';

describe('@jmp/web workspace placeholder', () => {
  it('resolves the shared contracts workspace package', () => {
    expect(WEB_API_BASE_PATH).toBe('/api/v1');
    expect(WEB_APP_NAME).toBe('Job Marketplace Web');
  });
});
