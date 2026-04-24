import { NIGERIAN_STATES as BASE_NIGERIAN_STATES } from './nigeriaStates';

export const NIGERIAN_STATES = BASE_NIGERIAN_STATES;

// Platform-controlled LGA options used by checkout and seller pickup forms.
// Sellers choose from these values instead of typing free-form LGA names.
export const NIGERIA_LGAS = {
  Abia: ['Aba North', 'Aba South', 'Arochukwu', 'Bende', 'Ikwuano', 'Umuahia North'],
  Adamawa: ['Demsa', 'Fufore', 'Ganye', 'Mubi North', 'Numan', 'Yola North'],
  'Akwa Ibom': ['Abak', 'Eket', 'Essien Udim', 'Ikot Ekpene', 'Itu', 'Uyo'],
  Anambra: ['Awka North', 'Awka South', 'Idemili North', 'Nnewi North', 'Onitsha North', 'Orumba South'],
  Bauchi: ['Alkaleri', 'Bauchi', 'Dass', 'Katagum', 'Misau', 'Toro'],
  Bayelsa: ['Brass', 'Ekeremor', 'Kolokuma/Opokuma', 'Nembe', 'Ogbia', 'Yenagoa'],
  Benue: ['Gboko', 'Katsina-Ala', 'Kwande', 'Makurdi', 'Otukpo', 'Ukum'],
  Borno: ['Bama', 'Biu', 'Dikwa', 'Gwoza', 'Jere', 'Maiduguri'],
  'Cross River': ['Akamkpa', 'Bekwarra', 'Calabar Municipal', 'Calabar South', 'Ikom', 'Ogoja'],
  Delta: ['Aniocha North', 'Bomadi', 'Ethiope East', 'Okpe', 'Uvwie', 'Warri South'],
  Ebonyi: ['Abakaliki', 'Afikpo North', 'Ezza North', 'Ikwo', 'Izzi', 'Ohaukwu'],
  Edo: ['Egor', 'Esan West', 'Etsako West', 'Ikpoba-Okha', 'Oredo', 'Uhunmwonde'],
  Ekiti: ['Ado Ekiti', 'Efon', 'Ekiti East', 'Ikere', 'Ijero', 'Oye'],
  Enugu: ['Enugu East', 'Enugu North', 'Enugu South', 'Nsukka', 'Oji River', 'Udi'],
  FCT: ['Abaji', 'Abuja Municipal', 'Bwari', 'Gwagwalada', 'Kuje', 'Kwali'],
  Gombe: ['Akko', 'Balanga', 'Billiri', 'Dukku', 'Funakaye', 'Gombe'],
  Imo: ['Aboh Mbaise', 'Ideato North', 'Mbaitoli', 'Nkwerre', 'Owerri Municipal', 'Owerri West'],
  Jigawa: ['Birnin Kudu', 'Dutse', 'Gumel', 'Hadejia', 'Kazaure', 'Ringim'],
  Kaduna: ['Chikun', 'Igabi', "Jema'a", 'Kachia', 'Kaduna North', 'Zaria'],
  Kano: ['Bichi', 'Dala', 'Fagge', 'Gwale', 'Nassarawa', 'Tarauni'],
  Katsina: ['Daura', 'Dutsi', 'Funtua', 'Kankia', 'Katsina', 'Malumfashi'],
  Kebbi: ['Argungu', 'Bagudo', 'Birnin Kebbi', 'Jega', 'Ngaski', 'Yauri'],
  Kogi: ['Ankpa', 'Dekina', 'Idah', 'Kabba/Bunu', 'Lokoja', 'Okene'],
  Kwara: ['Asa', 'Baruten', 'Edu', 'Ilorin East', 'Ilorin South', 'Ilorin West'],
  Lagos: ['Agege', 'Ajeromi-Ifelodun', 'Alimosho', 'Eti-Osa', 'Ikeja', 'Surulere'],
  Nasarawa: ['Akwanga', 'Karu', 'Keffi', 'Lafia', 'Nasarawa', 'Wamba'],
  Niger: ['Bida', 'Chanchaga', 'Kontagora', 'Lapai', 'Minna', 'Suleja'],
  Ogun: ['Abeokuta North', 'Abeokuta South', 'Ado-Odo/Ota', 'Ijebu Ode', 'Obafemi Owode', 'Sagamu'],
  Ondo: ['Akure North', 'Akure South', 'Idanre', 'Ifedore', 'Okitipupa', 'Ondo West'],
  Osun: ['Atakunmosa West', 'Ede North', 'Ife Central', 'Ilesa East', 'Olorunda', 'Osogbo'],
  Oyo: ['Akinyele', 'Egbeda', 'Ibadan North', 'Ibadan South-West', 'Ogbomoso North', 'Oyo East'],
  Plateau: ['Barkin Ladi', 'Bassa', 'Jos East', 'Jos North', 'Jos South', 'Mangu'],
  Rivers: ['Eleme', 'Ikwerre', 'Obio/Akpor', 'Okrika', 'Port Harcourt', 'Tai'],
  Sokoto: ['Binji', 'Bodinga', 'Gwadabawa', 'Illela', 'Sokoto North', 'Wamakko'],
  Taraba: ['Bali', 'Donga', 'Jalingo', 'Karim Lamido', 'Sardauna', 'Wukari'],
  Yobe: ['Bade', 'Damaturu', 'Fika', 'Geidam', 'Nguru', 'Potiskum'],
  Zamfara: ['Anka', 'Bungudu', 'Gusau', 'Kaura Namoda', 'Maru', 'Talata Mafara'],
};

export function getLgasForState(stateName) {
  return NIGERIA_LGAS[stateName] || [];
}

export function isKnownLgaForState(stateName, lgaName) {
  return getLgasForState(stateName).includes(lgaName);
}
