import { describe, it, expect } from 'vitest';
import { store, createAppStore } from './store.js';
import { baseApi } from '../services/base-api.js';

describe('Redux store & hooks configuration', () => {
  it('registers the RTK Query baseApi reducer under its reducerPath', () => {
    const state = store.getState();
    expect(state).toHaveProperty(baseApi.reducerPath);
    expect(typeof state.api).toBe('object');
  });

  it('includes RTK Query middleware and handles cache actions', () => {
    const testStore = createAppStore();
    expect(typeof testStore.dispatch).toBe('function');

    // Resetting API state should not throw
    expect(() => testStore.dispatch(baseApi.util.resetApiState())).not.toThrow();
  });

  it('creates isolated store instances without leaking cache state', () => {
    const store1 = createAppStore();
    const store2 = createAppStore();

    expect(store1).not.toBe(store2);
    expect(store1.getState()).toEqual(store2.getState());
  });
});
