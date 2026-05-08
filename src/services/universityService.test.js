import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockOrder,
  mockLimit,
  mockEqState,
  mockIlike,
  mockEqIdMaybeSingle,
  mockNeqOrder,
  mockFrom,
} = vi.hoisted(() => {
  const mockOrder = vi.fn();
  const mockLimit = vi.fn();
  const mockEqState = vi.fn();
  const mockIlike = vi.fn();
  const mockEqIdMaybeSingle = vi.fn();
  const mockNeqOrder = vi.fn();

  const mockFrom = vi.fn((table) => {
    if (table !== 'universities') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn((column) => {
          if (column === 'is_active') {
            return {
              order: mockOrder,
              eq: mockEqState,
              ilike: mockIlike,
              neq: vi.fn(() => ({
                order: mockNeqOrder,
              })),
            };
          }

          if (column === 'id') {
            return {
              maybeSingle: mockEqIdMaybeSingle,
            };
          }

          throw new Error(`Unexpected eq column: ${column}`);
        }),
      })),
    };
  });

  mockOrder.mockReturnValue({
    limit: mockLimit,
  });

  mockEqState.mockReturnValue({
    order: mockOrder,
    limit: mockLimit,
    ilike: mockIlike,
    neq: vi.fn(() => ({
      order: mockNeqOrder,
    })),
  });

  mockIlike.mockReturnValue({
    order: mockOrder,
    limit: mockLimit,
  });

  return {
    mockOrder,
    mockLimit,
    mockEqState,
    mockIlike,
    mockEqIdMaybeSingle,
    mockNeqOrder,
    mockFrom,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

import {
  fetchNearbyUniversitiesByState,
  fetchUniversityById,
  searchUniversities,
} from './universityService';

describe('universityService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('searches active universities and normalizes their state and zone', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        {
          id: 'uni-1',
          name: 'University of Lagos',
          state: 'lagos',
          zone: '',
          slug: 'unilag',
          is_active: true,
        },
      ],
      error: null,
    });

    const results = await searchUniversities({ query: 'lagos', state: 'Lagos', limit: 5 });

    expect(mockFrom).toHaveBeenCalledWith('universities');
    expect(results).toEqual([
      {
        id: 'uni-1',
        name: 'University of Lagos',
        state: 'Lagos',
        zone: 'South West',
        slug: 'unilag',
        is_active: true,
      },
    ]);
  });

  it('fetches a single university by id', async () => {
    mockEqIdMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'uni-1',
        name: 'Mafdesh University',
        state: 'Kaduna',
        zone: 'North West',
        slug: 'mafdesh-university-kaduna',
        is_active: true,
      },
      error: null,
    });

    const university = await fetchUniversityById('uni-1');

    expect(university).toMatchObject({
      id: 'uni-1',
      name: 'Mafdesh University',
      state: 'Kaduna',
      zone: 'North West',
    });
  });

  it('loads nearby universities from the same state', async () => {
    mockNeqOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'uni-2',
          name: 'Lagos State University',
          state: 'Lagos',
          zone: 'South West',
          slug: 'lasu',
          is_active: true,
        },
      ],
      error: null,
    });

    const results = await fetchNearbyUniversitiesByState('Lagos', { excludeId: 'uni-1' });

    expect(results[0]).toMatchObject({
      id: 'uni-2',
      name: 'Lagos State University',
      state: 'Lagos',
      zone: 'South West',
    });
  });
});
