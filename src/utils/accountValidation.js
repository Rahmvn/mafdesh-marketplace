const ZERO_WIDTH_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/gu;
const INVISIBLE_SPACE_CHARACTERS = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/gu;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const HUMAN_NAME_PATTERN = /^[\p{L}\p{M}\p{N} .,'-]+$/u;
const BUSINESS_NAME_PATTERN = /^[\p{L}\p{M}\p{N} .,'&()/-]+$/u;

export const PRODUCT_NAME_MAX_LENGTH = 120;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 5000;
export const PRODUCT_OVERVIEW_MAX_LENGTH = 2000;
export const PRODUCT_FEATURE_LINE_MAX_LENGTH = 160;
export const PRODUCT_SPEC_LINE_MAX_LENGTH = 200;
export const REVIEW_COMMENT_MAX_LENGTH = 1000;
export const SUPPORT_SUBJECT_MAX_LENGTH = 140;
export const SUPPORT_MESSAGE_MAX_LENGTH = 2000;
export const DISPUTE_MESSAGE_MAX_LENGTH = 2000;
export const MAX_PRODUCT_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_DISPUTE_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const MAX_SUPPORT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_VERIFICATION_PROOF_BYTES = 10 * 1024 * 1024;
export const MAX_SUPPORT_ATTACHMENTS = 5;
export const MAX_DISPUTE_IMAGES = 5;
export const MAX_PRODUCT_IMAGES = 5;

function removeInvisibleCharacters(value) {
  return String(value || '')
    .replace(INVISIBLE_SPACE_CHARACTERS, ' ')
    .replace(ZERO_WIDTH_CHARACTERS, '')
    .replace(CONTROL_CHARACTERS, '');
}

function collapseWhitespace(value) {
  return removeInvisibleCharacters(value)
    .replace(/\s+/gu, ' ')
    .trim();
}

export function normalizeSingleLineText(value) {
  return collapseWhitespace(value);
}

export function normalizeHumanName(value) {
  return collapseWhitespace(value);
}

export function normalizeBusinessName(value) {
  return collapseWhitespace(value);
}

export function normalizePlainText(value) {
  return collapseWhitespace(value);
}

export function normalizeMultilineText(value) {
  return removeInvisibleCharacters(value)
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => collapseWhitespace(line))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D+/g, '').slice(0, 11);
}

export function hasEdgeWhitespace(value) {
  const normalized = removeInvisibleCharacters(value);

  return Boolean(normalized) && normalized !== normalized.trim();
}

export function validatePasswordSpacing(value, { label = 'Password' } = {}) {
  if (hasEdgeWhitespace(value)) {
    return `${label} cannot start or end with a space.`;
  }

  return '';
}

function validateLength(value, { label, required, minLength = 0, maxLength = Infinity }) {
  if (!value) {
    return required ? `${label} is required.` : '';
  }

  if (value.length < minLength) {
    return `${label} must be at least ${minLength} characters.`;
  }

  if (value.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
  }

  return '';
}

export function validateSingleLineText(
  value,
  { label = 'Field', required = true, minLength = 0, maxLength = 250 } = {}
) {
  const normalized = normalizeSingleLineText(value);
  return validateLength(normalized, { label, required, minLength, maxLength });
}

export function validateMultilineText(
  value,
  { label = 'Field', required = true, minLength = 0, maxLength = 2000 } = {}
) {
  const normalized = normalizeMultilineText(value);
  return validateLength(normalized, { label, required, minLength, maxLength });
}

export function validateHumanName(value, { label = 'Full name', required = true, minLength = 2, maxLength = 100 } = {}) {
  const normalized = normalizeHumanName(value);

  const lengthError = validateLength(normalized, { label, required, minLength, maxLength });
  if (lengthError) {
    return lengthError;
  }

  if (!HUMAN_NAME_PATTERN.test(normalized) || normalized.includes('<') || normalized.includes('>')) {
    return `${label} contains invalid characters.`;
  }

  return '';
}

export function validateBusinessName(value, { required = true, minLength = 2, maxLength = 120 } = {}) {
  const normalized = normalizeBusinessName(value);

  const lengthError = validateLength(normalized, {
    label: 'Business name',
    required,
    minLength,
    maxLength,
  });
  if (lengthError) {
    return lengthError;
  }

  if (!BUSINESS_NAME_PATTERN.test(normalized) || normalized.includes('<') || normalized.includes('>')) {
    return 'Business name contains invalid characters.';
  }

  return '';
}

export function validatePhoneNumber(value) {
  const normalized = normalizePhoneNumber(value);

  if (!normalized) {
    return 'Phone number is required.';
  }

  if (!/^0\d{10}$/.test(normalized)) {
    return 'Phone number must be a valid 11-digit Nigerian number starting with 0.';
  }

  return '';
}

export function validateDateOfBirth(value, { minimumAge = 16, maximumAge = 120 } = {}) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return 'Date of birth is required.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return 'Date of birth must be a valid date.';
  }

  const birthDate = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) {
    return 'Date of birth must be a valid date.';
  }

  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }

  if (age < minimumAge) {
    return `You must be at least ${minimumAge} years old.`;
  }

  if (age > maximumAge) {
    return 'Date of birth must be realistic.';
  }

  return '';
}

export function validateProductName(value) {
  return validateSingleLineText(value, {
    label: 'Product name',
    required: true,
    minLength: 5,
    maxLength: PRODUCT_NAME_MAX_LENGTH,
  });
}

export function validateProductOverview(value) {
  return validateMultilineText(value, {
    label: 'Product overview',
    required: true,
    minLength: 20,
    maxLength: PRODUCT_OVERVIEW_MAX_LENGTH,
  });
}

export function validateProductDescription(value) {
  return validateMultilineText(value, {
    label: 'Product description',
    required: true,
    minLength: 20,
    maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH,
  });
}

export function validateProductFeatureLine(value, label = 'Feature') {
  return validateSingleLineText(value, {
    label,
    required: false,
    maxLength: PRODUCT_FEATURE_LINE_MAX_LENGTH,
  });
}

export function validateProductSpecLine(value, label = 'Specification') {
  return validateSingleLineText(value, {
    label,
    required: false,
    maxLength: PRODUCT_SPEC_LINE_MAX_LENGTH,
  });
}

export function validateSupportSubject(value) {
  return validateSingleLineText(value, {
    label: 'Subject',
    required: false,
    maxLength: SUPPORT_SUBJECT_MAX_LENGTH,
  });
}

export function validateSupportMessage(value) {
  return validateMultilineText(value, {
    label: 'Message',
    required: true,
    minLength: 10,
    maxLength: SUPPORT_MESSAGE_MAX_LENGTH,
  });
}

export function validateReviewComment(value) {
  return validateMultilineText(value, {
    label: 'Review comment',
    required: false,
    maxLength: REVIEW_COMMENT_MAX_LENGTH,
  });
}

export function validateDisputeMessage(value, { required = true } = {}) {
  return validateMultilineText(value, {
    label: 'Message',
    required,
    minLength: required ? 10 : 0,
    maxLength: DISPUTE_MESSAGE_MAX_LENGTH,
  });
}

function formatFileSize(sizeInBytes) {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) {
    return '0 bytes';
  }

  const units = ['bytes', 'KB', 'MB', 'GB'];
  let value = sizeInBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function validateSelectedFiles(
  files,
  {
    label = 'Files',
    maxCount = 5,
    maxFileSizeBytes = 5 * 1024 * 1024,
    allowedMimeTypes = [],
    allowedMimePrefixes = [],
  } = {}
) {
  const normalizedFiles = Array.from(files || []).filter(Boolean);

  if (normalizedFiles.length > maxCount) {
    return `${label} must be ${maxCount} file${maxCount === 1 ? '' : 's'} or fewer.`;
  }

  for (const file of normalizedFiles) {
    const fileType = String(file?.type || '').toLowerCase();
    const fileSize = Number(file?.size || 0);
    const fileName = String(file?.name || 'file');
    const hasTypeRestrictions =
      allowedMimeTypes.length > 0 || allowedMimePrefixes.length > 0;
    const allowedByType =
      !hasTypeRestrictions ||
      allowedMimeTypes.includes(fileType) ||
      allowedMimePrefixes.some((prefix) => fileType.startsWith(prefix));

    if (!allowedByType) {
      return `${fileName} is not an allowed file type.`;
    }

    if (fileSize > maxFileSizeBytes) {
      return `${fileName} exceeds the ${formatFileSize(maxFileSizeBytes)} limit.`;
    }
  }

  return '';
}
