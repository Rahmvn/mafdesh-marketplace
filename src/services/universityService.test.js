import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockOrder,
  mockStateEq,
  mockMaybeSingle,
  mockFrom,
} = vi.hoisted(() => {
  const mockOrder = vi.fn();
  const mockStateEq = vi.fn();
  const mockMaybeSingle = vi.fn();

  const mockFrom = vi.fn((table) => {
    if (table !== 'universities') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn((column) => {
          if (column === 'is_active') {
            return {
              eq: mockStateEq,
              order: mockOrder,
            };
          }

          if (column === 'id') {
            return {
              maybeSingle: mockMaybeSingle,
            };
          }

          throw new Error(`Unexpected eq column: ${column}`);
        }),
      })),
    };
  });

  mockStateEq.mockReturnValue({
    order: mockOrder,
  });

  return {
    mockOrder,
    mockStateEq,
    mockMaybeSingle,
    mockFrom,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

import {
  __resetUniversityCatalogCacheForTests,
  fetchNearbyUniversitiesByState,
  fetchUniversityById,
  searchUniversities,
} from './universityService';

describe('universityService', () => {
  afterEach(() => {
    __resetUniversityCatalogCacheForTests();
    vi.clearAllMocks();
  });

  it('finds institutions even when the search omits punctuation', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'uni-1',
          name: 'Al-Hikmah University',
          state: 'kwara',
          zone: '',
          slug: 'al-hikmah-university-kwara',
          abbreviation: 'ALHIKMAH',
          is_active: true,
        },
        {
          id: 'uni-2',
          name: 'Summit University',
          state: 'Kwara',
          zone: 'North Central',
          slug: 'summit-university-kwara',
          abbreviation: 'SUMMIT',
          is_active: true,
        },
      ],
      error: null,
    });

    const results = await searchUniversities({ query: 'alhikma', state: 'Kwara', limit: 5 });

    expect(mockFrom).toHaveBeenCalledWith('universities');
    expect(mockStateEq).toHaveBeenCalledWith('state', 'Kwara');
    expect(results[0]).toEqual({
      id: 'uni-1',
      name: 'Al-Hikmah University',
      state: 'Kwara',
      zone: 'North Central',
      slug: 'al-hikmah-university-kwara',
      abbreviation: 'ALHIKMAH',
      is_active: true,
    });
  });

  it('supports searching by school abbreviation or short form', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'uni-3',
          name: 'Federal Polytechnic, Offa',
          state: 'Kwara',
          zone: 'North Central',
          slug: 'federal-polytechnic-offa-kwara',
          abbreviation: 'OFFA POLY',
          is_active: true,
        },
        {
          id: 'uni-4',
          name: 'Kwara State Polytechnic',
          state: 'Kwara',
          zone: 'North Central',
          slug: 'kwara-state-polytechnic-kwara',
          abbreviation: 'KWARA POLY',
          is_active: true,
        },
      ],
      error: null,
    });

    const results = await searchUniversities({ query: 'offa poly', state: 'Kwara', limit: 5 });

    expect(results[0]).toMatchObject({
      id: 'uni-3',
      name: 'Federal Polytechnic, Offa',
      abbreviation: 'OFFA POLY',
    });
  });

  it('fetches a single institution by id', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'uni-1',
        name: 'Summit University',
        state: 'Kwara',
        zone: 'North Central',
        slug: 'summit-university-kwara',
        abbreviation: 'SUMMIT',
        is_active: true,
      },
      error: null,
    });

    const university = await fetchUniversityById('uni-1');

    expect(university).toMatchObject({
      id: 'uni-1',
      name: 'Summit University',
      state: 'Kwara',
      zone: 'North Central',
      abbreviation: 'SUMMIT',
    });
  });

  it('loads nearby institutions from the same state and excludes the current one', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'uni-1',
          name: 'University of Ilorin',
          state: 'Kwara',
          zone: 'North Central',
          slug: 'university-of-ilorin-kwara',
          abbreviation: 'UNILORIN',
          is_active: true,
        },
        {
          id: 'uni-2',
          name: 'Kwara State Polytechnic',
          state: 'Kwara',
          zone: 'North Central',
          slug: 'kwara-state-polytechnic-kwara',
          abbreviation: 'KWARA POLY',
          is_active: true,
        },
      ],
      error: null,
    });

    const results = await fetchNearbyUniversitiesByState('Kwara', { excludeId: 'uni-1' });

    expect(results).toEqual([
      expect.objectContaining({
        id: 'uni-2',
        name: 'Kwara State Polytechnic',
        abbreviation: 'KWARA POLY',
      }),
    ]);
  });
});
