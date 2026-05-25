const RECENT_SEARCHES_KEY = 'mafdesh_recent_searches';
const MAX_RECENT_SEARCHES = 5;

function normalizeSearchTerm(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function readRecentSearches() {
  try {
    const rawValue = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map((entry) => normalizeSearchTerm(entry))
      .filter(Boolean)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch (error) {
    console.error('Error reading recent searches:', error);
    return [];
  }
}

export function saveRecentSearch(value) {
  const normalizedValue = normalizeSearchTerm(value);

  if (!normalizedValue) {
    return [];
  }

  const recentSearches = readRecentSearches().filter(
    (entry) => entry.toLowerCase() !== normalizedValue.toLowerCase()
  );
  const nextRecentSearches = [normalizedValue, ...recentSearches].slice(0, MAX_RECENT_SEARCHES);

  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextRecentSearches));
  } catch (error) {
    console.error('Error saving recent searches:', error);
  }

  return nextRecentSearches;
}

export function removeRecentSearch(value) {
  const normalizedValue = normalizeSearchTerm(value);
  const nextRecentSearches = readRecentSearches().filter(
    (entry) => entry.toLowerCase() !== normalizedValue.toLowerCase()
  );

  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextRecentSearches));
  } catch (error) {
    console.error('Error removing recent search:', error);
  }

  return nextRecentSearches;
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch (error) {
    console.error('Error clearing recent searches:', error);
  }
}

export { MAX_RECENT_SEARCHES, RECENT_SEARCHES_KEY };
