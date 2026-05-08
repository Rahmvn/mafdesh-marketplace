import { supabase } from '../supabaseClient';
import { getNigeriaGeoZoneForState } from '../utils/nigeriaGeoZones';
import { getCanonicalStateName } from '../utils/nigeriaStates';

function normalizeText(value) {
  return String(value || '').trim();
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
    is_active: university.is_active !== false,
  };
}

export async function searchUniversities({
  query = '',
  state = '',
  limit = 10,
} = {}) {
  const normalizedQuery = normalizeText(query);
  const canonicalState = getCanonicalStateName(state);
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 10;

  let request = supabase
    .from('universities')
    .select('id, name, state, zone, slug, is_active')
    .eq('is_active', true);

  if (canonicalState) {
    request = request.eq('state', canonicalState);
  }

  if (normalizedQuery) {
    request = request.ilike('name', `%${normalizedQuery}%`);
  }

  request = request
    .order('name', { ascending: true })
    .limit(safeLimit);

  const { data, error } = await request;

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeUniversityRecord).filter(Boolean);
}

export async function fetchUniversityById(universityId) {
  const id = normalizeText(universityId);

  if (!id) {
    return null;
  }

  const { data, error } = await supabase
    .from('universities')
    .select('id, name, state, zone, slug, is_active')
    .eq('id', id)
    .maybeSingle();

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

  let request = supabase
    .from('universities')
    .select('id, name, state, zone, slug, is_active')
    .eq('is_active', true)
    .eq('state', canonicalState);

  if (normalizeText(excludeId)) {
    request = request.neq('id', normalizeText(excludeId));
  }

  request = request.order('name', { ascending: true });

  const { data, error } = await request;

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeUniversityRecord).filter(Boolean);
}
