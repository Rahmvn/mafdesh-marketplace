import { findMatchingNigerianBankName } from './nigerianBanks';

function toTrimmedString(value) {
  return String(value || '').trim();
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function sanitizeBankDetailsRequest(values = {}) {
  const canonicalBankName = findMatchingNigerianBankName(values.bank_name);

  return {
    bank_name: canonicalBankName || toTrimmedString(values.bank_name),
    account_number: digitsOnly(values.account_number),
    account_name: toTrimmedString(values.account_name),
    business_address: toTrimmedString(values.business_address),
    bvn: digitsOnly(values.bvn),
    tax_id: toTrimmedString(values.tax_id),
  };
}

export function validateBankDetailsRequest(values = {}) {
  const sanitized = sanitizeBankDetailsRequest(values);

  if (!sanitized.bank_name || !sanitized.account_number || !sanitized.account_name) {
    return {
      ok: false,
      message: 'Bank name, account number and account name are required.',
      sanitized,
    };
  }

  if (!findMatchingNigerianBankName(sanitized.bank_name)) {
    return {
      ok: false,
      message: 'Please select a valid Nigerian bank from the list.',
      sanitized,
    };
  }

  if (sanitized.account_number.length !== 10) {
    return {
      ok: false,
      message: 'Account number must be exactly 10 digits.',
      sanitized,
    };
  }

  if (sanitized.bvn && sanitized.bvn.length !== 11) {
    return {
      ok: false,
      message: 'BVN must be exactly 11 digits when provided.',
      sanitized,
    };
  }

  return {
    ok: true,
    sanitized,
  };
}

export function buildBankDetailsPendingUpdate(values = {}) {
  return {
    bank_details_pending: sanitizeBankDetailsRequest(values),
  };
}

export function buildApprovedBankDetailsUpdate(values = {}) {
  return {
    ...sanitizeBankDetailsRequest(values),
    bank_details_pending: null,
    bank_details_approved: true,
  };
}
