export const NIGERIAN_BANKS = [
  'Access Bank',
  'ALAT by Wema',
  'Carbon',
  'Citibank',
  'Ecobank',
  'FairMoney Microfinance Bank',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'First City Monument Bank (FCMB)',
  'Globus Bank',
  'Guaranty Trust Bank (GTBank)',
  'Heritage Bank',
  'Jaiz Bank',
  'Keystone Bank',
  'Kuda Microfinance Bank',
  'Lotus Bank',
  'Moniepoint Microfinance Bank',
  'OPay Digital Services Limited (OPay)',
  'Optimus Bank',
  'PalmPay',
  'Parallex Bank',
  'Polaris Bank',
  'PremiumTrust Bank',
  'Providus Bank',
  'Rubies Microfinance Bank',
  'Signature Bank',
  'Sparkle Microfinance Bank',
  'Stanbic IBTC Bank',
  'Standard Chartered Bank',
  'Sterling Bank',
  'SunTrust Bank',
  'TAJBank',
  'Titan Trust Bank',
  'Union Bank of Nigeria',
  'United Bank for Africa (UBA)',
  'Unity Bank',
  'VFD Microfinance Bank',
  'Wema Bank',
  'Zenith Bank',
];

export function findMatchingNigerianBankName(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();

  if (!normalizedValue) {
    return '';
  }

  return NIGERIAN_BANKS.find((bank) => bank.toLowerCase() === normalizedValue) || '';
}
