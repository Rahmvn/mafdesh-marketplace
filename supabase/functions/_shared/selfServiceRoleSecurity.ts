export const SELF_SERVICE_ROLES = new Set(["buyer", "seller"]);
export const ALL_MARKETPLACE_ROLES = new Set(["buyer", "seller", "admin"]);

export function readSelfServiceRole(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  return SELF_SERVICE_ROLES.has(normalized) ? normalized : "";
}

export function normalizeMarketplaceRole(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ALL_MARKETPLACE_ROLES.has(normalized) ? normalized : "";
}

export function normalizeText(value: unknown) {
  return typeof value === "string"
    ? value.replace(/[\u200B-\u200D\uFEFF]/gu, "").replace(/\s+/gu, " ").trim()
    : "";
}

export function normalizeOptionalUuid(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || "";
}

export function normalizeOptionalDate(value: unknown) {
  const normalized = normalizeText(value);

  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  return normalized;
}

export function resolveImmutableSelfServiceRole({
  existingRole,
  requestedRole,
  metadataRole,
  fallbackRole = "",
}: {
  existingRole?: unknown;
  requestedRole?: unknown;
  metadataRole?: unknown;
  fallbackRole?: unknown;
}) {
  const storedRole = normalizeMarketplaceRole(existingRole);

  if (storedRole === "admin") {
    return {
      desiredRole: "admin",
      storedRole,
      roleLocked: true,
      isNewUser: false,
    };
  }

  if (storedRole === "buyer" || storedRole === "seller") {
    return {
      desiredRole: storedRole,
      storedRole,
      roleLocked: true,
      isNewUser: false,
    };
  }

  const desiredRole =
    readSelfServiceRole(requestedRole) ||
    readSelfServiceRole(metadataRole) ||
    readSelfServiceRole(fallbackRole);

  return {
    desiredRole,
    storedRole: "",
    roleLocked: false,
    isNewUser: true,
  };
}

export function validateHumanName(value: string) {
  if (!value) {
    return "A valid full name is required for signup.";
  }

  if (value.length < 2 || value.length > 100) {
    return "Full name must be between 2 and 100 characters.";
  }

  if (value.includes("<") || value.includes(">") || !/^[\p{L}\p{M}\p{N} .,'-]+$/u.test(value)) {
    return "Full name contains invalid characters.";
  }

  return "";
}

export function validateBusinessName(value: string) {
  if (!value) {
    return "A valid business name is required for seller signup.";
  }

  if (value.length < 2 || value.length > 120) {
    return "Business name must be between 2 and 120 characters.";
  }

  if (value.includes("<") || value.includes(">") || !/^[\p{L}\p{M}\p{N} .,'&()/-]+$/u.test(value)) {
    return "Business name contains invalid characters.";
  }

  return "";
}

export function validatePhoneNumber(value: string) {
  if (!/^0\d{10}$/.test(value)) {
    return "Phone number must be a valid 11-digit Nigerian number starting with 0.";
  }

  return "";
}

export function validateLocation(value: string) {
  if (!value || value.length > 80 || value.includes("<") || value.includes(">")) {
    return "A valid location is required for signup.";
  }

  return "";
}

export function validateDateOfBirth(value: string) {
  if (!value) {
    return "Date of birth is required for signup.";
  }

  const birthDate = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) {
    return "Date of birth must be a valid date.";
  }

  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }

  if (age < 16) {
    return "You must be at least 16 years old to create an account.";
  }

  if (age > 120) {
    return "Date of birth must be realistic.";
  }

  return "";
}

export function validateUniversityName(value: string) {
  if (!value || value.length < 2 || value.length > 120 || value.includes("<") || value.includes(">")) {
    return "A valid university name is required for signup.";
  }

  return "";
}

export function validateSelfServiceSignupInput(
  {
    role,
    fullName,
    phoneNumber,
    dateOfBirth,
    businessName,
    location,
    universityName,
    universityState,
    universityZone,
  }: {
    role: string;
    fullName: string;
    phoneNumber: string;
    dateOfBirth: string;
    businessName: string;
    location: string;
    universityName: string;
    universityState: string;
    universityZone: string;
  },
  { requireLocation = false }: { requireLocation?: boolean } = {}
) {
  const errors = [
    validateHumanName(fullName),
    validatePhoneNumber(phoneNumber),
    validateDateOfBirth(dateOfBirth),
    requireLocation ? validateLocation(location) : "",
    validateUniversityName(universityName),
  ].filter(Boolean);

  if (role === "seller") {
    errors.push(
      validateBusinessName(businessName),
      universityState ? "" : "University state is required for seller signup.",
      universityZone ? "" : "University zone is required for seller signup."
    );
  }

  return errors[0] || "";
}
