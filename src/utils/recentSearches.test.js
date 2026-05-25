import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecentSearches,
  readRecentSearches,
  removeRecentSearch,
  saveRecentSearch,
} from './recentSearches';

describe('recentSearches', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('stores recent searches in most-recent-first order and keeps only five', () => {
    saveRecentSearch('Laptop');
    saveRecentSearch('Shoes');
    saveRecentSearch('Headphones');
    saveRecentSearch('Backpack');
    saveRecentSearch('Notebook');
    saveRecentSearch('Desk');

    expect(readRecentSearches()).toEqual([
      'Desk',
      'Notebook',
      'Backpack',
      'Headphones',
      'Shoes',
    ]);
  });

  it('deduplicates searches case-insensitively and normalizes spaces', () => {
    saveRecentSearch('  Campus   Bag  ');
    saveRecentSearch('campus bag');

    expect(readRecentSearches()).toEqual(['campus bag']);
  });

  it('removes a single recent search', () => {
    saveRecentSearch('Laptop');
    saveRecentSearch('Shoes');

    removeRecentSearch('laptop');

    expect(readRecentSearches()).toEqual(['Shoes']);
  });

  it('clears all recent searches', () => {
    saveRecentSearch('Laptop');

    clearRecentSearches();

    expect(readRecentSearches()).toEqual([]);
  });
});
