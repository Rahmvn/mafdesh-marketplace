alter table if exists public.universities
  add column if not exists abbreviation text;

create index if not exists universities_abbreviation_lower_idx
  on public.universities (lower(btrim(abbreviation)))
  where abbreviation is not null and is_active = true;

create temporary table tmp_institution_abbreviation_seed
on commit drop
as
with seed(name, state, zone, abbreviation) as (
  values
    ('University of Lagos', 'Lagos', 'South West', 'UNILAG'),
    ('Lagos State University', 'Lagos', 'South West', 'LASU'),
    ('Yaba College of Technology', 'Lagos', 'South West', 'YABATECH'),
    ('University of Ibadan', 'Oyo', 'South West', 'UI'),
    ('The Polytechnic, Ibadan', 'Oyo', 'South West', 'IBADANPOLY'),
    ('Obafemi Awolowo University', 'Osun', 'South West', 'OAU'),
    ('Federal Polytechnic, Ede', 'Osun', 'South West', 'EDEPOLY'),
    ('Osun State Polytechnic, Iree', 'Osun', 'South West', 'IREEPOLY'),
    ('Covenant University', 'Ogun', 'South West', 'CU'),
    ('Federal University of Agriculture, Abeokuta', 'Ogun', 'South West', 'FUNAAB'),
    ('Moshood Abiola Polytechnic', 'Ogun', 'South West', 'MAPOLY'),
    ('Federal Polytechnic, Ilaro', 'Ogun', 'South West', 'ILAROPOLY'),
    ('Federal University of Technology, Akure', 'Ondo', 'South West', 'FUTA'),
    ('Adekunle Ajasin University', 'Ondo', 'South West', 'AAUA'),
    ('Ekiti State University', 'Ekiti', 'South West', 'EKSU'),
    ('University of Ilorin', 'Kwara', 'North Central', 'UNILORIN'),
    ('Kwara State University', 'Kwara', 'North Central', 'KWASU'),
    ('Al-Hikmah University', 'Kwara', 'North Central', 'ALHIKMAH'),
    ('Summit University', 'Kwara', 'North Central', 'SUMMIT'),
    ('Federal Polytechnic, Offa', 'Kwara', 'North Central', 'OFFA POLY'),
    ('Kwara State Polytechnic', 'Kwara', 'North Central', 'KWARA POLY'),
    ('Lens Polytechnic', 'Kwara', 'North Central', 'LENS POLY'),
    ('Graceland Polytechnic, Offa', 'Kwara', 'North Central', 'GRACELAND POLY'),
    ('Harvard Polytechnic, Ilorin', 'Kwara', 'North Central', 'HARVARD POLY'),
    ('Newland Polytechnic, Ilorin', 'Kwara', 'North Central', 'NEWLAND POLY'),
    ('The Polytechnic, Aran-Orin', 'Kwara', 'North Central', 'ARAN-ORIN POLY'),
    ('The Polytechnic, Igbo-Owu', 'Kwara', 'North Central', 'IGBO-OWU POLY'),
    ('College of Education, Offa', 'Kwara', 'North Central', 'COE OFFA'),
    ('Muhyideen College of Education', 'Kwara', 'North Central', 'MUHYIDEEN COE'),
    ('Kinsey College of Education, Ilorin', 'Kwara', 'North Central', 'KINSEY COE'),
    ('University of Offa', 'Kwara', 'North Central', 'UNIOFFA'),
    ('Thomas Adewumi University', 'Kwara', 'North Central', 'TAU'),
    ('Lens University', 'Kwara', 'North Central', 'LENS'),
    ('Ahman Pategi University', 'Kwara', 'North Central', 'APU'),
    ('Muhammad Kamalud-Deen University', 'Kwara', 'North Central', 'MKDU'),
    ('Abdulrasaq Abubakar Toyin University', 'Kwara', 'North Central', 'AATU'),
    ('Jimoh Babalola University', 'Kwara', 'North Central', 'JBU'),
    ('Nigeria Army School of Education', 'Kwara', 'North Central', 'NASE'),
    ('University of Abuja', 'FCT', 'North Central', 'UNIABUJA'),
    ('University of Jos', 'Plateau', 'North Central', 'UNIJOS'),
    ('Benue State University', 'Benue', 'North Central', 'BSU'),
    ('Ahmadu Bello University', 'Kaduna', 'North West', 'ABU'),
    ('Kaduna Polytechnic', 'Kaduna', 'North West', 'KADPOLY'),
    ('Nuhu Bamalli Polytechnic', 'Kaduna', 'North West', 'NUBAPOLY'),
    ('Bayero University Kano', 'Kano', 'North West', 'BUK'),
    ('Al-Qalam University', 'Katsina', 'North West', 'AUK'),
    ('Federal University, Dutse', 'Jigawa', 'North West', 'FUD'),
    ('Usmanu Danfodiyo University', 'Sokoto', 'North West', 'UDUS'),
    ('University of Maiduguri', 'Borno', 'North East', 'UNIMAID'),
    ('Modibbo Adama University', 'Adamawa', 'North East', 'MAU'),
    ('Gombe State University', 'Gombe', 'North East', 'GSU'),
    ('University of Nigeria, Nsukka', 'Enugu', 'South East', 'UNN'),
    ('Enugu State University of Science and Technology', 'Enugu', 'South East', 'ESUT'),
    ('Nnamdi Azikiwe University', 'Anambra', 'South East', 'UNIZIK'),
    ('Chukwuemeka Odumegwu Ojukwu University', 'Anambra', 'South East', 'COOU'),
    ('Federal Polytechnic, Oko', 'Anambra', 'South East', 'OKO POLY'),
    ('University of Benin', 'Edo', 'South South', 'UNIBEN'),
    ('Auchi Polytechnic', 'Edo', 'South South', 'AUCHI POLY'),
    ('University of Port Harcourt', 'Rivers', 'South South', 'UNIPORT'),
    ('Rivers State University', 'Rivers', 'South South', 'RSU'),
    ('University of Calabar', 'Cross River', 'South South', 'UNICAL'),
    ('University of Uyo', 'Akwa Ibom', 'South South', 'UNIUYO')
),
prepared_seed as (
  select distinct on (lower(btrim(name)), lower(btrim(state)))
    name,
    state,
    zone,
    abbreviation,
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
  order by lower(btrim(name)), lower(btrim(state)), abbreviation
)
select
  name,
  state,
  zone,
  abbreviation,
  slug
from prepared_seed;

update public.universities as existing
set
  name = seeded.name,
  state = seeded.state,
  zone = seeded.zone,
  abbreviation = seeded.abbreviation,
  slug = seeded.slug,
  is_active = true
from tmp_institution_abbreviation_seed as seeded
where lower(btrim(existing.name)) = lower(btrim(seeded.name))
  and lower(btrim(existing.state)) = lower(btrim(seeded.state));

insert into public.universities (name, state, zone, slug, abbreviation)
select
  seeded.name,
  seeded.state,
  seeded.zone,
  seeded.slug,
  seeded.abbreviation
from tmp_institution_abbreviation_seed as seeded
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
