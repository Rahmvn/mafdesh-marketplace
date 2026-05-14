function groupDigits(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function sanitizeNumericString(value, { allowDecimal = false } = {}) {
  const rawValue = value == null ? '' : String(value);
  const filtered = rawValue.replace(/[^\d.]/g, '');

  if (!allowDecimal) {
    return filtered.replace(/\./g, '');
  }

  const [integerPart = '', ...decimalParts] = filtered.split('.');
  if (decimalParts.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${decimalParts.join('')}`;
}

export function formatNumericInput(value, options = {}) {
  const { allowDecimal = false } = options;
  const sanitized = sanitizeNumericString(value, { allowDecimal });

  if (!sanitized) {
    return '';
  }

  if (allowDecimal) {
    const hasDecimalPoint = sanitized.includes('.');
    const [integerPart = '', decimalPart = ''] = sanitized.split('.');
    const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '') || '0';
    const formattedInteger = groupDigits(normalizedInteger);

    if (hasDecimalPoint) {
      return `${formattedInteger}.${decimalPart}`;
    }

    return formattedInteger;
  }

  const normalizedInteger = sanitized.replace(/^0+(?=\d)/, '') || '0';
  return groupDigits(normalizedInteger);
}

export function parseFormattedNumber(value) {
  const sanitized = sanitizeNumericString(value, { allowDecimal: true });

  if (!sanitized || sanitized === '.') {
    return null;
  }

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

