create or replace function public.is_standard_nigeria_lga(p_state_name text, p_lga_name text)
returns boolean
language plpgsql
immutable
as $$
declare
  state_name text := btrim(coalesce(p_state_name, ''));
  lga_name text := btrim(coalesce(p_lga_name, ''));
begin
  if state_name = '' or lga_name = '' then
    return false;
  end if;

  return case state_name
    when 'Abia' then lga_name = any(array['Aba North', 'Aba South', 'Arochukwu', 'Bende', 'Ikwuano', 'Umuahia North'])
    when 'Adamawa' then lga_name = any(array['Demsa', 'Fufore', 'Ganye', 'Mubi North', 'Numan', 'Yola North'])
    when 'Akwa Ibom' then lga_name = any(array['Abak', 'Eket', 'Essien Udim', 'Ikot Ekpene', 'Itu', 'Uyo'])
    when 'Anambra' then lga_name = any(array['Awka North', 'Awka South', 'Idemili North', 'Nnewi North', 'Onitsha North', 'Orumba South'])
    when 'Bauchi' then lga_name = any(array['Alkaleri', 'Bauchi', 'Dass', 'Katagum', 'Misau', 'Toro'])
    when 'Bayelsa' then lga_name = any(array['Brass', 'Ekeremor', 'Kolokuma/Opokuma', 'Nembe', 'Ogbia', 'Yenagoa'])
    when 'Benue' then lga_name = any(array['Gboko', 'Katsina-Ala', 'Kwande', 'Makurdi', 'Otukpo', 'Ukum'])
    when 'Borno' then lga_name = any(array['Bama', 'Biu', 'Dikwa', 'Gwoza', 'Jere', 'Maiduguri'])
    when 'Cross River' then lga_name = any(array['Akamkpa', 'Bekwarra', 'Calabar Municipal', 'Calabar South', 'Ikom', 'Ogoja'])
    when 'Delta' then lga_name = any(array['Aniocha North', 'Bomadi', 'Ethiope East', 'Okpe', 'Uvwie', 'Warri South'])
    when 'Ebonyi' then lga_name = any(array['Abakaliki', 'Afikpo North', 'Ezza North', 'Ikwo', 'Izzi', 'Ohaukwu'])
    when 'Edo' then lga_name = any(array['Egor', 'Esan West', 'Etsako West', 'Ikpoba-Okha', 'Oredo', 'Uhunmwonde'])
    when 'Ekiti' then lga_name = any(array['Ado Ekiti', 'Efon', 'Ekiti East', 'Ikere', 'Ijero', 'Oye'])
    when 'Enugu' then lga_name = any(array['Enugu East', 'Enugu North', 'Enugu South', 'Nsukka', 'Oji River', 'Udi'])
    when 'FCT' then lga_name = any(array['Abaji', 'Abuja Municipal', 'Bwari', 'Gwagwalada', 'Kuje', 'Kwali'])
    when 'Gombe' then lga_name = any(array['Akko', 'Balanga', 'Billiri', 'Dukku', 'Funakaye', 'Gombe'])
    when 'Imo' then lga_name = any(array['Aboh Mbaise', 'Ideato North', 'Mbaitoli', 'Nkwerre', 'Owerri Municipal', 'Owerri West'])
    when 'Jigawa' then lga_name = any(array['Birnin Kudu', 'Dutse', 'Gumel', 'Hadejia', 'Kazaure', 'Ringim'])
    when 'Kaduna' then lga_name = any(array['Chikun', 'Igabi', 'Jema''a', 'Kachia', 'Kaduna North', 'Zaria'])
    when 'Kano' then lga_name = any(array['Bichi', 'Dala', 'Fagge', 'Gwale', 'Nassarawa', 'Tarauni'])
    when 'Katsina' then lga_name = any(array['Daura', 'Dutsi', 'Funtua', 'Kankia', 'Katsina', 'Malumfashi'])
    when 'Kebbi' then lga_name = any(array['Argungu', 'Bagudo', 'Birnin Kebbi', 'Jega', 'Ngaski', 'Yauri'])
    when 'Kogi' then lga_name = any(array['Ankpa', 'Dekina', 'Idah', 'Kabba/Bunu', 'Lokoja', 'Okene'])
    when 'Kwara' then lga_name = any(array['Asa', 'Baruten', 'Edu', 'Ilorin East', 'Ilorin South', 'Ilorin West'])
    when 'Lagos' then lga_name = any(array['Agege', 'Ajeromi-Ifelodun', 'Alimosho', 'Eti-Osa', 'Ikeja', 'Surulere'])
    when 'Nasarawa' then lga_name = any(array['Akwanga', 'Karu', 'Keffi', 'Lafia', 'Nasarawa', 'Wamba'])
    when 'Niger' then lga_name = any(array['Bida', 'Chanchaga', 'Kontagora', 'Lapai', 'Minna', 'Suleja'])
    when 'Ogun' then lga_name = any(array['Abeokuta North', 'Abeokuta South', 'Ado-Odo/Ota', 'Ijebu Ode', 'Obafemi Owode', 'Sagamu'])
    when 'Ondo' then lga_name = any(array['Akure North', 'Akure South', 'Idanre', 'Ifedore', 'Okitipupa', 'Ondo West'])
    when 'Osun' then lga_name = any(array['Atakunmosa West', 'Ede North', 'Ife Central', 'Ilesa East', 'Olorunda', 'Osogbo'])
    when 'Oyo' then lga_name = any(array['Akinyele', 'Egbeda', 'Ibadan North', 'Ibadan South-West', 'Ogbomoso North', 'Oyo East'])
    when 'Plateau' then lga_name = any(array['Barkin Ladi', 'Bassa', 'Jos East', 'Jos North', 'Jos South', 'Mangu'])
    when 'Rivers' then lga_name = any(array['Eleme', 'Ikwerre', 'Obio/Akpor', 'Okrika', 'Port Harcourt', 'Tai'])
    when 'Sokoto' then lga_name = any(array['Binji', 'Bodinga', 'Gwadabawa', 'Illela', 'Sokoto North', 'Wamakko'])
    when 'Taraba' then lga_name = any(array['Bali', 'Donga', 'Jalingo', 'Karim Lamido', 'Sardauna', 'Wukari'])
    when 'Yobe' then lga_name = any(array['Bade', 'Damaturu', 'Fika', 'Geidam', 'Nguru', 'Potiskum'])
    when 'Zamfara' then lga_name = any(array['Anka', 'Bungudu', 'Gusau', 'Kaura Namoda', 'Maru', 'Talata Mafara'])
    else false
  end;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'seller_pickup_locations_standard_lga'
      and conrelid = 'public.seller_pickup_locations'::regclass
  ) then
    alter table public.seller_pickup_locations
      add constraint seller_pickup_locations_standard_lga
      check (public.is_standard_nigeria_lga(state_name, lga_name)) not valid;
  end if;
end $$;
