with seed(name, state, zone) as (
  values
    ('University of Lagos', 'Lagos', 'South West'),
    ('Lagos State University', 'Lagos', 'South West'),
    ('Yaba College of Technology', 'Lagos', 'South West'),
    ('Lagos City Polytechnic', 'Lagos', 'South West'),
    ('Federal College of Education (Technical) Akoka', 'Lagos', 'South West'),
    ('University of Ibadan', 'Oyo', 'South West'),
    ('The Polytechnic, Ibadan', 'Oyo', 'South West'),
    ('Adeseun Ogundoyin Polytechnic', 'Oyo', 'South West'),
    ('Federal School of Surveying', 'Oyo', 'South West'),
    ('Obafemi Awolowo University', 'Osun', 'South West'),
    ('Osun State University', 'Osun', 'South West'),
    ('Osun State Polytechnic, Iree', 'Osun', 'South West'),
    ('Federal Polytechnic, Ede', 'Osun', 'South West'),
    ('Iree Polytechnic', 'Osun', 'South West'),
    ('Bowen University', 'Osun', 'South West'),
    ('Fountain University', 'Osun', 'South West'),
    ('Covenant University', 'Ogun', 'South West'),
    ('Federal University of Agriculture, Abeokuta', 'Ogun', 'South West'),
    ('Olabisi Onabanjo University', 'Ogun', 'South West'),
    ('Moshood Abiola Polytechnic', 'Ogun', 'South West'),
    ('Federal Polytechnic, Ilaro', 'Ogun', 'South West'),
    ('Abraham Adesanya Polytechnic', 'Ogun', 'South West'),
    ('Babcock University', 'Ogun', 'South West'),
    ('Crescent University', 'Ogun', 'South West'),
    ('Tai Solarin University of Education', 'Ogun', 'South West'),
    ('Federal University of Technology, Akure', 'Ondo', 'South West'),
    ('Adekunle Ajasin University', 'Ondo', 'South West'),
    ('Rufus Giwa Polytechnic', 'Ondo', 'South West'),
    ('Elizade University', 'Ondo', 'South West'),
    ('Ekiti State University', 'Ekiti', 'South West'),
    ('Federal Polytechnic, Ado-Ekiti', 'Ekiti', 'South West'),
    ('Afe Babalola University', 'Ekiti', 'South West'),
    ('University of Ilorin', 'Kwara', 'North Central'),
    ('Kwara State University', 'Kwara', 'North Central'),
    ('Al-Hikmah University', 'Kwara', 'North Central'),
    ('Summit University', 'Kwara', 'North Central'),
    ('Federal Polytechnic, Offa', 'Kwara', 'North Central'),
    ('Lens Polytechnic', 'Kwara', 'North Central'),
    ('University of Abuja', 'FCT', 'North Central'),
    ('Baze University', 'FCT', 'North Central'),
    ('Nile University of Nigeria', 'FCT', 'North Central'),
    ('African University of Science and Technology', 'FCT', 'North Central'),
    ('University of Jos', 'Plateau', 'North Central'),
    ('Plateau State University', 'Plateau', 'North Central'),
    ('Plateau State Polytechnic', 'Plateau', 'North Central'),
    ('Benue State University', 'Benue', 'North Central'),
    ('Joseph Sarwuan Tarka University, Makurdi', 'Benue', 'North Central'),
    ('Benue State Polytechnic', 'Benue', 'North Central'),
    ('Federal University of Lafia', 'Nasarawa', 'North Central'),
    ('Nasarawa State University', 'Nasarawa', 'North Central'),
    ('Federal Polytechnic, Nasarawa', 'Nasarawa', 'North Central'),
    ('Prince Abubakar Audu University', 'Kogi', 'North Central'),
    ('Federal University, Lokoja', 'Kogi', 'North Central'),
    ('Kogi State Polytechnic', 'Kogi', 'North Central'),
    ('Ibrahim Badamasi Babangida University', 'Niger', 'North Central'),
    ('Federal Polytechnic, Bida', 'Niger', 'North Central'),
    ('Niger State Polytechnic', 'Niger', 'North Central'),
    ('Ahmadu Bello University', 'Kaduna', 'North West'),
    ('Kaduna State University', 'Kaduna', 'North West'),
    ('Kaduna Polytechnic', 'Kaduna', 'North West'),
    ('Nuhu Bamalli Polytechnic', 'Kaduna', 'North West'),
    ('Mafdesh University', 'Kaduna', 'North West'),
    ('Bayero University Kano', 'Kano', 'North West'),
    ('Northwest University, Kano', 'Kano', 'North West'),
    ('Kano State Polytechnic', 'Kano', 'North West'),
    ('Skyline University Nigeria', 'Kano', 'North West'),
    ('Umaru Musa Yar''Adua University', 'Katsina', 'North West'),
    ('Federal University, Dutsin-Ma', 'Katsina', 'North West'),
    ('Hassan Usman Katsina Polytechnic', 'Katsina', 'North West'),
    ('Jigawa State Polytechnic', 'Jigawa', 'North West'),
    ('Federal University, Dutse', 'Jigawa', 'North West'),
    ('Hussaini Adamu Federal Polytechnic', 'Jigawa', 'North West'),
    ('Kebbi State University of Science and Technology', 'Kebbi', 'North West'),
    ('Waziri Umaru Federal Polytechnic', 'Kebbi', 'North West'),
    ('Usmanu Danfodiyo University', 'Sokoto', 'North West'),
    ('Sokoto State University', 'Sokoto', 'North West'),
    ('Shehu Shagari University of Education', 'Sokoto', 'North West'),
    ('Federal University, Gusau', 'Zamfara', 'North West'),
    ('Zamfara State University', 'Zamfara', 'North West'),
    ('Abubakar Tatari Ali Polytechnic', 'Bauchi', 'North East'),
    ('Abubakar Tafawa Balewa University', 'Bauchi', 'North East'),
    ('Federal Polytechnic, Bauchi', 'Bauchi', 'North East'),
    ('University of Maiduguri', 'Borno', 'North East'),
    ('Ramat Polytechnic', 'Borno', 'North East'),
    ('Mohammed Goni College of Legal and Islamic Studies', 'Borno', 'North East'),
    ('Modibbo Adama University', 'Adamawa', 'North East'),
    ('Adamawa State University', 'Adamawa', 'North East'),
    ('Federal Polytechnic, Mubi', 'Adamawa', 'North East'),
    ('American University of Nigeria', 'Adamawa', 'North East'),
    ('Gombe State University', 'Gombe', 'North East'),
    ('Federal University, Kashere', 'Gombe', 'North East'),
    ('Federal Polytechnic, Kaltungo', 'Gombe', 'North East'),
    ('Taraba State University', 'Taraba', 'North East'),
    ('Federal University, Wukari', 'Taraba', 'North East'),
    ('Yobe State University', 'Yobe', 'North East'),
    ('Federal Polytechnic, Damaturu', 'Yobe', 'North East'),
    ('Federal University, Gashua', 'Yobe', 'North East'),
    ('University of Nigeria, Nsukka', 'Enugu', 'South East'),
    ('Enugu State University of Science and Technology', 'Enugu', 'South East'),
    ('Institute of Management and Technology, Enugu', 'Enugu', 'South East'),
    ('Godfrey Okoye University', 'Enugu', 'South East'),
    ('Nnamdi Azikiwe University', 'Anambra', 'South East'),
    ('Chukwuemeka Odumegwu Ojukwu University', 'Anambra', 'South East'),
    ('Federal Polytechnic, Oko', 'Anambra', 'South East'),
    ('University of Benin', 'Edo', 'South South'),
    ('Ambrose Alli University', 'Edo', 'South South'),
    ('Auchi Polytechnic', 'Edo', 'South South'),
    ('Edo State Polytechnic', 'Edo', 'South South'),
    ('University of Port Harcourt', 'Rivers', 'South South'),
    ('Rivers State University', 'Rivers', 'South South'),
    ('Captain Elechi Amadi Polytechnic', 'Rivers', 'South South'),
    ('Ignatius Ajuru University of Education', 'Rivers', 'South South'),
    ('University of Calabar', 'Cross River', 'South South'),
    ('Cross River University of Technology', 'Cross River', 'South South'),
    ('Federal Polytechnic, Ugep', 'Cross River', 'South South'),
    ('University of Uyo', 'Akwa Ibom', 'South South'),
    ('Akwa Ibom State University', 'Akwa Ibom', 'South South'),
    ('Akwa Ibom State Polytechnic', 'Akwa Ibom', 'South South'),
    ('Delta State University', 'Delta', 'South South'),
    ('Dennis Osadebay University', 'Delta', 'South South'),
    ('Delta State Polytechnic, Otefe-Oghara', 'Delta', 'South South'),
    ('Delta State Polytechnic, Ogwashi-Uku', 'Delta', 'South South'),
    ('Delta State Polytechnic, Ozoro', 'Delta', 'South South'),
    ('Federal University, Otuoke', 'Bayelsa', 'South South'),
    ('Niger Delta University', 'Bayelsa', 'South South'),
    ('Bayelsa Medical University', 'Bayelsa', 'South South'),
    ('Michael Okpara University of Agriculture, Umudike', 'Abia', 'South East'),
    ('Abia State University', 'Abia', 'South East'),
    ('Abia State Polytechnic', 'Abia', 'South East'),
    ('Gregory University', 'Abia', 'South East'),
    ('Federal Polytechnic, Nekede', 'Imo', 'South East'),
    ('Imo State University', 'Imo', 'South East'),
    ('Kingsley Ozumba Mbadiwe University', 'Imo', 'South East'),
    ('Imo State Polytechnic', 'Imo', 'South East'),
    ('Ebonyi State University', 'Ebonyi', 'South East'),
    ('Alex Ekwueme Federal University, Ndufu-Alike', 'Ebonyi', 'South East'),
    ('Akanu Ibiam Federal Polytechnic, Unwana', 'Ebonyi', 'South East'),
    ('Federal College of Education, Zaria', 'Kaduna', 'North West'),
    ('Federal College of Education, Kano', 'Kano', 'North West'),
    ('Federal College of Education, Abeokuta', 'Ogun', 'South West'),
    ('Adeniran Ogunsanya College of Education', 'Lagos', 'South West')
),
normalized_seed as (
  select distinct on (slug)
    name,
    state,
    zone,
    slug
  from (
    select
      name,
      state,
      zone,
      lower(
        trim(
          both '-'
          from regexp_replace(
            regexp_replace(name || '-' || state, '[^a-zA-Z0-9]+', '-', 'g'),
            '-+',
            '-',
            'g'
          )
        )
      ) as slug
    from seed
  ) prepared
  order by slug, name
)
insert into public.universities (name, state, zone, slug)
select
  name,
  state,
  zone,
  slug
from normalized_seed
on conflict (slug) do update
set
  name = excluded.name,
  state = excluded.state,
  zone = excluded.zone,
  is_active = true;

create or replace function public.validate_self_service_signup_inputs(
  p_role text,
  p_full_name text,
  p_phone_number text,
  p_date_of_birth date,
  p_business_name text,
  p_location text,
  p_university_name text,
  p_university_state text,
  p_university_zone text
)
returns void
language plpgsql
as $$
declare
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_full_name text := public.normalize_marketplace_text(p_full_name);
  v_phone_number text := public.normalize_marketplace_text(p_phone_number);
  v_business_name text := public.normalize_marketplace_text(p_business_name);
  v_location text := public.normalize_marketplace_text(p_location);
  v_university_name text := public.normalize_marketplace_text(p_university_name);
  v_university_state text := public.normalize_marketplace_text(p_university_state);
  v_university_zone text := public.normalize_marketplace_text(p_university_zone);
begin
  if v_role not in ('buyer', 'seller') then
    return;
  end if;

  if v_full_name is null then
    raise exception 'A valid full name is required for signup.';
  end if;

  if length(v_full_name) < 2 or length(v_full_name) > 100 then
    raise exception 'Full name must be between 2 and 100 characters.';
  end if;

  if v_full_name like '%<%' or v_full_name like '%>%'
    or v_full_name !~ '^[A-Za-z0-9 .,''-]+$' then
    raise exception 'Full name contains invalid characters.';
  end if;

  if v_phone_number is null or v_phone_number !~ '^0[0-9]{10}$' then
    raise exception 'Phone number must be a valid 11-digit Nigerian number starting with 0.';
  end if;

  if p_date_of_birth is null then
    raise exception 'Date of birth is required for signup.';
  end if;

  if p_date_of_birth > current_date - interval '16 years' then
    raise exception 'You must be at least 16 years old to create an account.';
  end if;

  if p_date_of_birth < current_date - interval '120 years' then
    raise exception 'Date of birth must be realistic.';
  end if;

  if v_location is null or length(v_location) > 80 or v_location like '%<%' or v_location like '%>%' then
    raise exception 'A valid location is required for signup.';
  end if;

  if v_university_name is null or length(v_university_name) < 2 or length(v_university_name) > 120
    or v_university_name like '%<%' or v_university_name like '%>%' then
    raise exception 'A valid institution name is required for signup.';
  end if;

  if v_role = 'seller' then
    if v_business_name is null then
      raise exception 'A valid business name is required for seller signup.';
    end if;

    if length(v_business_name) < 2 or length(v_business_name) > 120 then
      raise exception 'Business name must be between 2 and 120 characters.';
    end if;

    if v_business_name like '%<%' or v_business_name like '%>%'
      or v_business_name !~ '^[A-Za-z0-9 .,''&()/ -]+$' then
      raise exception 'Business name contains invalid characters.';
    end if;

    if v_university_state is null or length(v_university_state) > 80 then
      raise exception 'Institution state is required for seller signup.';
    end if;

    if v_university_zone is null or length(v_university_zone) > 80 then
      raise exception 'Institution zone is required for seller signup.';
    end if;
  end if;
end;
$$;
