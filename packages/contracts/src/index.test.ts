import { describe, expect, it } from 'vitest';
import { API_VERSION } from './index.js';

describe('@jmp/contracts', () => {
  it('exports the current versioned API contract marker', () => {
    expect(API_VERSION).toBe('v1');
  });
});
