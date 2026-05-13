import {
  MAX_DISPUTE_EVIDENCE_BYTES,
  normalizeHumanName,
  normalizeMultilineText,
  normalizePhoneNumber,
  validateDisputeMessage,
  validateBusinessName,
  validateDateOfBirth,
  validateHumanName,
  validatePhoneNumber,
  validateProductName,
  validateSelectedFiles,
  validateSupportMessage,
} from './accountValidation';

describe('accountValidation', () => {
  it('collapses weird whitespace in names', () => {
    expect(normalizeHumanName('  John\u00A0\u200B   Doe  ')).toBe('John Doe');
  });

  it('rejects empty names', () => {
    expect(validateHumanName('   ')).toMatch(/required/i);
  });

  it('rejects script-like names', () => {
    expect(validateHumanName('<script>alert(1)</script>')).toMatch(/invalid characters/i);
  });

  it('rejects very long names', () => {
    expect(validateHumanName('A'.repeat(101))).toMatch(/100 characters or fewer/i);
  });

  it('normalizes phone numbers to digits', () => {
    expect(normalizePhoneNumber('0801-234-5678<script>')).toBe('08012345678');
  });

  it('normalizes multiline text and strips invisible characters', () => {
    expect(normalizeMultilineText(' Hello\u200B \n\n  world\u00A0 ')).toBe('Hello\n\nworld');
  });

  it('rejects invalid phone numbers', () => {
    expect(validatePhoneNumber('123')).toMatch(/11-digit/i);
  });

  it('rejects invalid dates of birth', () => {
    expect(validateDateOfBirth('not-a-date')).toMatch(/valid date/i);
  });

  it('rejects underage dates of birth', () => {
    expect(validateDateOfBirth('2015-01-01')).toMatch(/at least 16/i);
  });

  it('rejects invalid business names', () => {
    expect(validateBusinessName('<script>Store</script>')).toMatch(/invalid characters/i);
  });

  it('enforces product title length', () => {
    expect(validateProductName('A'.repeat(121))).toMatch(/120 characters or fewer/i);
  });

  it('rejects overly long support messages', () => {
    expect(validateSupportMessage('A'.repeat(2001))).toMatch(/2000 characters or fewer/i);
  });

  it('rejects overly long dispute messages', () => {
    expect(validateDisputeMessage('A'.repeat(2001))).toMatch(/2000 characters or fewer/i);
  });

  it('rejects disallowed file types', () => {
    const result = validateSelectedFiles(
      [{ name: 'payload.exe', type: 'application/x-msdownload', size: 1000 }],
      { label: 'Attachments', allowedMimePrefixes: ['image/'] }
    );
    expect(result).toMatch(/not an allowed file type/i);
  });

  it('rejects oversized files', () => {
    const result = validateSelectedFiles(
      [{ name: 'huge.png', type: 'image/png', size: MAX_DISPUTE_EVIDENCE_BYTES + 1 }],
      { label: 'Images', allowedMimePrefixes: ['image/'], maxFileSizeBytes: MAX_DISPUTE_EVIDENCE_BYTES }
    );
    expect(result).toMatch(/limit/i);
  });
});
