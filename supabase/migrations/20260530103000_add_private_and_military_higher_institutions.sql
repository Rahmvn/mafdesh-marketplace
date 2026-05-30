create temporary table tmp_private_military_institution_seed
on commit drop
as
with seed(name, state, zone) as (
  values
    ('Babcock University', 'Ogun', 'South West'),
    ('Igbinedion University', 'Edo', 'South South'),
    ('Madonna University', 'Anambra', 'South East'),
    ('Benson Idahosa University', 'Edo', 'South South'),
    ('Pan-Atlantic University', 'Lagos', 'South West'),
    ('Ajayi Crowther University', 'Oyo', 'South West'),
    ('Al-Qalam University', 'Katsina', 'North West'),
    ('Bingham University', 'Nasarawa', 'North Central'),
    ('Caritas University', 'Enugu', 'South East'),
    ('Crawford University', 'Ogun', 'South West'),
    ('Kwararafa University', 'Taraba', 'North East'),
    ('Lead City University', 'Oyo', 'South West'),
    ('Novena University', 'Delta', 'South South'),
    ('Renaissance University', 'Enugu', 'South East'),
    ('University of Mkar', 'Benue', 'North Central'),
    ('Joseph Ayo Babalola University', 'Osun', 'South West'),
    ('Caleb University', 'Lagos', 'South West'),
    ('Obong University', 'Akwa Ibom', 'South South'),
    ('Salem University', 'Kogi', 'North Central'),
    ('Tansian University', 'Anambra', 'South East'),
    ('Veritas University', 'FCT', 'North Central'),
    ('Wesley University', 'Ondo', 'South West'),
    ('Western Delta University', 'Delta', 'South South'),
    ('Oduduwa University', 'Osun', 'South West'),
    ('Paul University', 'Anambra', 'South East'),
    ('Rhema University', 'Rivers', 'South South'),
    ('Wellspring University', 'Edo', 'South South'),
    ('Adeleke University', 'Osun', 'South West'),
    ('Landmark University', 'Kwara', 'North Central'),
    ('Glorious Vision University', 'Edo', 'South South'),
    ('Evangel University', 'Ebonyi', 'South East'),
    ('McPherson University', 'Ogun', 'South West'),
    ('Southwestern University', 'Ogun', 'South West'),
    ('Augustine University', 'Lagos', 'South West'),
    ('Chrisland University', 'Ogun', 'South West'),
    ('Edwin Clark University', 'Delta', 'South South'),
    ('Hallmark University', 'Ogun', 'South West'),
    ('Hezekiah University', 'Imo', 'South East'),
    ('Kings University', 'Osun', 'South West'),
    ('Michael and Cecilia Ibru University', 'Delta', 'South South'),
    ('Mountain Top University', 'Ogun', 'South West'),
    ('Ritman University', 'Akwa Ibom', 'South South'),
    ('Christopher University', 'Ogun', 'South West'),
    ('KolaDaisi University', 'Oyo', 'South West'),
    ('Anchor University', 'Lagos', 'South West'),
    ('Dominican University', 'Oyo', 'South West'),
    ('Legacy University', 'Anambra', 'South East'),
    ('Arthur Jarvis University', 'Cross River', 'South South'),
    ('Coal City University', 'Enugu', 'South East'),
    ('Clifford University', 'Abia', 'South East'),
    ('Spiritan University', 'Abia', 'South East'),
    ('Precious Cornerstone University', 'Oyo', 'South West'),
    ('PAMO University of Medical Sciences', 'Rivers', 'South South'),
    ('Atiba University', 'Oyo', 'South West'),
    ('Eko University of Medical and Health Sciences', 'Lagos', 'South West'),
    ('Greenfield University', 'Kaduna', 'North West'),
    ('Dominion University', 'Oyo', 'South West'),
    ('Westland University', 'Osun', 'South West'),
    ('Topfaith University', 'Akwa Ibom', 'South South'),
    ('Thomas Adewumi University', 'Kwara', 'North Central'),
    ('Maranatha University', 'Lagos', 'South West'),
    ('Ave Maria University', 'Nasarawa', 'North Central'),
    ('Al-Istiqama University', 'Kano', 'North West'),
    ('Mudiame University', 'Edo', 'South South'),
    ('Havilla University', 'Cross River', 'South South'),
    ('Claretian University of Nigeria', 'Imo', 'South East'),
    ('Karl Kumm University', 'Plateau', 'North Central'),
    ('James Hope University', 'Lagos', 'South West'),
    ('Maryam Abacha American University of Nigeria', 'Kano', 'North West'),
    ('Capital City University', 'Kano', 'North West'),
    ('Ahman Pategi University', 'Kwara', 'North Central'),
    ('Mewar International University', 'Nasarawa', 'North Central'),
    ('Philomath University', 'FCT', 'North Central'),
    ('Khadija University', 'Jigawa', 'North West'),
    ('Anan University', 'Plateau', 'North Central'),
    ('North Eastern University', 'Gombe', 'North East'),
    ('Al-Ansar University', 'Borno', 'North East'),
    ('Margaret Lawrence University', 'Delta', 'South South'),
    ('Khalifa Isyaku Rabiu University', 'Kano', 'North West'),
    ('Sports University', 'Delta', 'South South'),
    ('Baba Ahmed University', 'Kano', 'North West'),
    ('Saisa University of Medical Sciences and Technology', 'Sokoto', 'North West'),
    ('Nigerian British University', 'Abia', 'South East'),
    ('Peter University', 'Anambra', 'South East'),
    ('Newgate University', 'Niger', 'North Central'),
    ('European University of Nigeria', 'FCT', 'North Central'),
    ('Rayhaan University', 'Kebbi', 'North West'),
    ('Muhammad Kamalud-Deen University', 'Kwara', 'North Central'),
    ('Sam Maris University', 'Ondo', 'South West'),
    ('Aletheia University', 'Ogun', 'South West'),
    ('Lux Mundi University', 'Abia', 'South East'),
    ('Maduka University', 'Enugu', 'South East'),
    ('Peaceland University', 'Enugu', 'South East'),
    ('Amadeus University', 'Abia', 'South East'),
    ('Vision University', 'Ogun', 'South West'),
    ('Azman University', 'Kano', 'North West'),
    ('Huda University', 'Zamfara', 'North West'),
    ('Franco British International University', 'Kaduna', 'North West'),
    ('Canadian University of Nigeria', 'FCT', 'North Central'),
    ('British Canadian University', 'Cross River', 'South South'),
    ('Hensard University', 'Bayelsa', 'South South'),
    ('Phoenix University', 'Nasarawa', 'North Central'),
    ('Wigwe University', 'Rivers', 'South South'),
    ('Hillside University of Science and Technology', 'Ekiti', 'South West'),
    ('University on the Niger', 'Anambra', 'South East'),
    ('Venite University', 'Ekiti', 'South West'),
    ('Shanahan University', 'Anambra', 'South East'),
    ('Miva Open University', 'FCT', 'North Central'),
    ('Iconic Open University', 'Sokoto', 'North West'),
    ('West Midlands Open University', 'Oyo', 'South West'),
    ('Al-Muhibbah Open University', 'FCT', 'North Central'),
    ('El-Amin University', 'Niger', 'North Central'),
    ('Jewel University', 'Gombe', 'North East'),
    ('Prime University', 'FCT', 'North Central'),
    ('Nigerian University of Technology and Management', 'Lagos', 'South West'),
    ('Al-Bayan University', 'Kogi', 'North Central'),
    ('Lighthouse University', 'Edo', 'South South'),
    ('African University of Economics', 'FCT', 'North Central'),
    ('New City University', 'Ogun', 'South West'),
    ('University of Fortune', 'Ondo', 'South West'),
    ('Eranova University', 'FCT', 'North Central'),
    ('Minaret University', 'Osun', 'South West'),
    ('Abdulrasaq Abubakar Toyin University', 'Kwara', 'North Central'),
    ('Southern Atlantic University', 'Akwa Ibom', 'South South'),
    ('Lens University', 'Kwara', 'North Central'),
    ('Monarch University', 'Ogun', 'South West'),
    ('Tonnie Iredia University of Communication', 'Edo', 'South South'),
    ('Isaac Balami University of Aeronautics and Management', 'Lagos', 'South West'),
    ('Kevin Eze University', 'Enugu', 'South East'),
    ('Tazkiyah University', 'Kaduna', 'North West'),
    ('Leadership University', 'FCT', 'North Central'),
    ('Jimoh Babalola University', 'Kwara', 'North Central'),
    ('Bridget University', 'Imo', 'South East'),
    ('Greenland University', 'Taraba', 'North East'),
    ('JEFAP University', 'Niger', 'North Central'),
    ('Azione Verde University', 'Imo', 'South East'),
    ('Unique Open University', 'Lagos', 'South West'),
    ('American Open University', 'Ogun', 'South West'),
    ('Nigerian Defence Academy', 'Kaduna', 'North West'),
    ('Nigerian Army University Biu', 'Borno', 'North East'),
    ('Air Force Institute of Technology', 'Kaduna', 'North West'),
    ('Nigeria Police Academy', 'Kano', 'North West'),
    ('Admiralty University of Nigeria', 'Delta', 'South South')
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
select
  name,
  state,
  zone,
  slug
from normalized_seed;

update public.universities as existing
set
  name = seeded.name,
  state = seeded.state,
  zone = seeded.zone,
  slug = seeded.slug,
  is_active = true
from tmp_private_military_institution_seed as seeded
where lower(btrim(existing.name)) = lower(btrim(seeded.name))
  and lower(btrim(existing.state)) = lower(btrim(seeded.state));

insert into public.universities (name, state, zone, slug)
select
  seeded.name,
  seeded.state,
  seeded.zone,
  seeded.slug
from tmp_private_military_institution_seed as seeded
where not exists (
  select 1
  from public.universities as existing
  where lower(btrim(existing.name)) = lower(btrim(seeded.name))
    and lower(btrim(existing.state)) = lower(btrim(seeded.state))
)
and not exists (
  select 1
  from public.universities as existing
  where existing.slug = seeded.slug
);
