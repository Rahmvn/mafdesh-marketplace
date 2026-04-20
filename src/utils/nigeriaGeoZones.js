import { getCanonicalStateName } from './nigeriaStates';

const GEO_ZONE_BY_STATE = {
  Abia: 'South East',
  Adamawa: 'North East',
  'Akwa Ibom': 'South South',
  Anambra: 'South East',
  Bauchi: 'North East',
  Bayelsa: 'South South',
  Benue: 'North Central',
  Borno: 'North East',
  'Cross River': 'South South',
  Delta: 'South South',
  Ebonyi: 'South East',
  Edo: 'South South',
  Ekiti: 'South West',
  Enugu: 'South East',
  FCT: 'North Central',
  Gombe: 'North East',
  Imo: 'South East',
  Jigawa: 'North West',
  Kaduna: 'North West',
  Kano: 'North West',
  Katsina: 'North West',
  Kebbi: 'North West',
  Kogi: 'North Central',
  Kwara: 'North Central',
  Lagos: 'South West',
  Nasarawa: 'North Central',
  Niger: 'North Central',
  Ogun: 'South West',
  Ondo: 'South West',
  Osun: 'South West',
  Oyo: 'South West',
  Plateau: 'North Central',
  Rivers: 'South South',
  Sokoto: 'North West',
  Taraba: 'North East',
  Yobe: 'North East',
  Zamfara: 'North West',
};

export function getNigeriaGeoZoneForState(stateName) {
  const canonicalState = getCanonicalStateName(stateName);

  if (!canonicalState) {
    return null;
  }

  return GEO_ZONE_BY_STATE[canonicalState] || null;
}
