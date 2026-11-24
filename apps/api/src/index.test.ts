import { describe, expect, it } from 'vitest';
import { API_BASE_PATH, API_NAME } from './index.js';

describe('@jmp/api workspace placeholder', () => {
  it('resolves the shared contracts workspace package', () => {
    expect(API_BASE_PATH).toBe('/api/v1');
    expect(API_NAME).toBe('Job Marketplace API');
  });
});
