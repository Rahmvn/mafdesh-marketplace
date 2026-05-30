import { supabase } from '../supabaseClient';
import { getNigeriaGeoZoneForState } from '../utils/nigeriaGeoZones';
import { getCanonicalStateName } from '../utils/nigeriaStates';

const ACTIVE_INSTITUTION_SELECT = 'id, name, state, zone, slug, is_active, abbreviation';
const ACTIVE_INSTITUTION_SELECT_LEGACY = 'id, name, state, zone, slug, is_active';
const INSTITUTION_CACHE_TTL_MS = 5 * 60 * 1000;
const institutionCatalogCache = new Map();

function normalizeText(value) {
  return String(value || '').trim();
}

function compactSearchText(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeUniversityRecord(university) {
  if (!university) {
    return null;
  }

  const state = getCanonicalStateName(university.state) || normalizeText(university.state) || '';
  const zone = normalizeText(university.zone) || getNigeriaGeoZoneForState(state) || '';

  return {
    id: university.id,
    name: normalizeText(university.name),
    state,
    zone,
    slug: normalizeText(university.slug),
    abbreviation: normalizeText(university.abbreviation),
    is_active: university.is_active !== false,
  };
}

async function fetchActiveInstitutionCatalog(state = '') {
  const canonicalState = getCanonicalStateName(state);
  const cacheKey = canonicalState || '*';
  const cachedEntry = institutionCatalogCache.get(cacheKey);

  if (cachedEntry && Date.now() - cachedEntry.timestamp < INSTITUTION_CACHE_TTL_MS) {
    return cachedEntry.records;
  }

  const runCatalogQuery = async (selectClause) => {
    let request = supabase
      .from('universities')
      .select(selectClause)
      .eq('is_active', true);

    if (canonicalState) {
      request = request.eq('state', canonicalState);
    }

    return request.order('name', { ascending: true });
  };

  let data;
  let error;
  ({ data, error } = await runCatalogQuery(ACTIVE_INSTITUTION_SELECT));

  if (error?.code === '42703' || /abbreviation/i.test(String(error?.message || ''))) {
    ({ data, error } = await runCatalogQuery(ACTIVE_INSTITUTION_SELECT_LEGACY));
  }

  if (error) {
    throw error;
  }

  const records = (data || []).map(normalizeUniversityRecord).filter(Boolean);
  institutionCatalogCache.set(cacheKey, {
    timestamp: Date.now(),
    records,
  });

  return records;
}

function getInstitutionSearchScore(university, rawQuery, compactQuery) {
  const normalizedQuery = normalizeText(rawQuery).toLowerCase();

  if (!compactQuery && !normalizedQuery) {
    return 100;
  }

  const abbreviation = normalizeText(university?.abbreviation).toLowerCase();
  const name = normalizeText(university?.name).toLowerCase();
  const slug = normalizeText(university?.slug).toLowerCase();
  const compactAbbreviation = compactSearchText(university?.abbreviation);
  const compactName = compactSearchText(university?.name);
  const compactSlug = compactSearchText(university?.slug);

  if (compactAbbreviation && compactAbbreviation === compactQuery) {
    return 0;
  }

  if (compactName && compactName === compactQuery) {
    return 1;
  }

  if (abbreviation && abbreviation === normalizedQuery) {
    return 2;
  }

  if (name && name === normalizedQuery) {
    return 3;
  }

  if (compactAbbreviation && compactAbbreviation.startsWith(compactQuery)) {
    return 4;
  }

  if (compactName && compactName.startsWith(compactQuery)) {
    return 5;
  }

  if (compactSlug && compactSlug.startsWith(compactQuery)) {
    return 6;
  }

  if (compactAbbreviation && compactAbbreviation.includes(compactQuery)) {
    return 7;
  }

  if (compactName && compactName.includes(compactQuery)) {
    return 8;
  }

  if (compactSlug && compactSlug.includes(compactQuery)) {
    return 9;
  }

  if (abbreviation && abbreviation.includes(normalizedQuery)) {
    return 10;
  }

  if (name && name.includes(normalizedQuery)) {
    return 11;
  }

  return null;
}

export async function searchUniversities({
  query = '',
  state = '',
  limit = 10,
} = {}) {
  const normalizedQuery = normalizeText(query);
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 10;
  const institutions = await fetchActiveInstitutionCatalog(state);

  if (!normalizedQuery) {
    return institutions.slice(0, safeLimit);
  }

  const compactQuery = compactSearchText(normalizedQuery);

  return institutions
    .map((university) => ({
      university,
      score: getInstitutionSearchScore(university, normalizedQuery, compactQuery),
    }))
    .filter((entry) => entry.score != null)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      const leftNameLength = normalizeText(left.university?.name).length;
      const rightNameLength = normalizeText(right.university?.name).length;

      if (leftNameLength !== rightNameLength) {
        return leftNameLength - rightNameLength;
      }

      return normalizeText(left.university?.name).localeCompare(normalizeText(right.university?.name));
    })
    .slice(0, safeLimit)
    .map((entry) => entry.university);
}

export async function fetchUniversityById(universityId) {
  const id = normalizeText(universityId);

  if (!id) {
    return null;
  }

  const runByIdQuery = (selectClause) => supabase
    .from('universities')
    .select(selectClause)
    .eq('id', id)
    .maybeSingle();

  let { data, error } = await runByIdQuery(ACTIVE_INSTITUTION_SELECT);

  if (error?.code === '42703' || /abbreviation/i.test(String(error?.message || ''))) {
    ({ data, error } = await runByIdQuery(ACTIVE_INSTITUTION_SELECT_LEGACY));
  }

  if (error) {
    throw error;
  }

  return normalizeUniversityRecord(data);
}

export async function fetchNearbyUniversitiesByState(state, { excludeId = '' } = {}) {
  const canonicalState = getCanonicalStateName(state);

  if (!canonicalState) {
    return [];
  }

  const institutions = await fetchActiveInstitutionCatalog(canonicalState);
  const normalizedExcludeId = normalizeText(excludeId);

  return institutions.filter((university) => {
    if (!normalizedExcludeId) {
      return true;
    }

    return normalizeText(university?.id) !== normalizedExcludeId;
  });
}

export function __resetUniversityCatalogCacheForTests() {
  institutionCatalogCache.clear();
}
