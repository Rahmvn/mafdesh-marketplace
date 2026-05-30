create temporary table tmp_private_broader_institution_seed
on commit drop
as
with seed(name, state, zone) as (
  values
    ('Redeemer''s University', 'Osun', 'South West'),
    ('Achievers University', 'Ondo', 'South West'),
    ('Bells University of Technology', 'Ogun', 'South West'),
    ('Trinity University', 'Lagos', 'South West'),
    ('Ojaja University', 'Kwara', 'North Central'),
    ('University of Offa', 'Kwara', 'North Central'),
    ('Edusoko University', 'Niger', 'North Central'),
    ('Amaj University', 'FCT', 'North Central'),
    ('Elrazi Medical University', 'Kano', 'North West'),
    ('Mercy Medical University', 'Osun', 'South West'),
    ('The Duke Medical University', 'Cross River', 'South South'),
    ('Cosmopolitan University', 'FCT', 'North Central'),
    ('College of Petroleum and Energy Studies', 'Kaduna', 'North West'),
    ('Nigeria Army School of Education', 'Kwara', 'North Central'),
    ('Covenant Polytechnic, Aba', 'Abia', 'South East'),
    ('Iheachukwu Madubuike Institute of Technology, Isouchi', 'Abia', 'South East'),
    ('Madonna College of Health Technology, Olokoro Umuahia', 'Abia', 'South East'),
    ('Temple Gate Polytechnic, Aba', 'Abia', 'South East'),
    ('Uma Ukpai Polytechnic, Ohafia', 'Abia', 'South East'),
    ('Valley View Polytechnic, Ohafia', 'Abia', 'South East'),
    ('Brainfill Polytechnic, Ikot-Ekpene', 'Akwa Ibom', 'South South'),
    ('El-Thomp Polytechnic, Abak', 'Akwa Ibom', 'South South'),
    ('Foundation Polytechnic, Ikot Ekpene', 'Akwa Ibom', 'South South'),
    ('Gestric Polytechnic, Uyo', 'Akwa Ibom', 'South South'),
    ('Heritage Polytechnic, Eket', 'Akwa Ibom', 'South South'),
    ('Hope Polytechnic, Ikono', 'Akwa Ibom', 'South South'),
    ('Ibom Metropolitan Polytechnic, Uyo', 'Akwa Ibom', 'South South'),
    ('Loam Polytechnic, Ikono', 'Akwa Ibom', 'South South'),
    ('Southern Atlantic Polytechnic, Uyo', 'Akwa Ibom', 'South South'),
    ('Sure Foundation Polytechnic, Ikot-Akai', 'Akwa Ibom', 'South South'),
    ('Trinity Polytechnic, Uyo', 'Akwa Ibom', 'South South'),
    ('Ultra Excellence Polytechnic, Uyo', 'Akwa Ibom', 'South South'),
    ('Uyo City Polytechnic, Uyo', 'Akwa Ibom', 'South South'),
    ('Gozie Anyachebelu Oragram Polytechnic, Oraukwu', 'Anambra', 'South East'),
    ('Grundtvig Polytechnic, Oba', 'Anambra', 'South East'),
    ('Ashi Polytechnic, Anyin', 'Benue', 'North Central'),
    ('Fidei Polytechnic, Gboko', 'Benue', 'North Central'),
    ('Gboko Polytechnic, Gboko', 'Benue', 'North Central'),
    ('Harry Pass Polytechnic, Gboko', 'Benue', 'North Central'),
    ('Intercontinental College of Technology, Makurdi', 'Benue', 'North Central'),
    ('The Polytechnic, Adoka', 'Benue', 'North Central'),
    ('NOGAK Polytechnic, Ikom', 'Cross River', 'South South'),
    ('Odaji Agbo Polytechnic, Ayeko Yala', 'Cross River', 'South South'),
    ('Bellarks Polytechnic, Kwale', 'Delta', 'South South'),
    ('Calvary Polytechnic, Owa-Oyibu', 'Delta', 'South South'),
    ('Nation Builders Polytechnic, Asaba', 'Delta', 'South South'),
    ('Global Polytechnic, Benin', 'Edo', 'South South'),
    ('Kings Polytechnic, Ubiaja', 'Edo', 'South South'),
    ('Lighthouse Polytechnic, Evbuobanosa', 'Edo', 'South South'),
    ('Oduduwa Polytechnic, Idu', 'Edo', 'South South'),
    ('Shaka Polytechnic, Benin City', 'Edo', 'South South'),
    ('Speedway Polytechnic, Osoba', 'Edo', 'South South'),
    ('Ajayi Polytechnic, Ara-Ekiti', 'Ekiti', 'South West'),
    ('Crown Polytechnic, Ado-Ekiti', 'Ekiti', 'South West'),
    ('Ekiti City Polytechnic, Umuooke Ekiti', 'Ekiti', 'South West'),
    ('Montgomery Polytechnic', 'Ekiti', 'South West'),
    ('Teedek Polytechnic, Ilogbo-Ekiti', 'Ekiti', 'South West'),
    ('The Polytechnic, Omuo-Ekiti', 'Ekiti', 'South West'),
    ('Marist Polytechnic, Emene', 'Enugu', 'South East'),
    ('Mater Dei Polytechnic, Egwuoba', 'Enugu', 'South East'),
    ('Our Saviour Institute of Science, Agriculture and Technology, Enugu', 'Enugu', 'South East'),
    ('Citi Polytechnic, Abuja', 'FCT', 'North Central'),
    ('Dorben Polytechnic, Bwari', 'FCT', 'North Central'),
    ('LeadTech School of Management and Technology, Abuja', 'FCT', 'North Central'),
    ('Raindrops Institute of Management and Technology, Amannachi', 'Imo', 'South East'),
    ('Mustibrah College of Information Technology and Management Studies', 'Kano', 'North West'),
    ('Gloryland Polytechnic, Ankpa', 'Kogi', 'North Central'),
    ('Prime Polytechnic, Jida Bassa, Ajaokuta', 'Kogi', 'North Central'),
    ('Graceland Polytechnic, Offa', 'Kwara', 'North Central'),
    ('Harvard Polytechnic, Ilorin', 'Kwara', 'North Central'),
    ('Newland Polytechnic, Ilorin', 'Kwara', 'North Central'),
    ('The Polytechnic, Aran-Orin', 'Kwara', 'North Central'),
    ('The Polytechnic, Igbo-Owu', 'Kwara', 'North Central'),
    ('Coastal Polytechnic, Badagry', 'Lagos', 'South West'),
    ('Eko College of Management and Technology', 'Lagos', 'South West'),
    ('Enville Institute of Management and Technology, Ikeja', 'Lagos', 'South West'),
    ('Grace Polytechnic, Surulere', 'Lagos', 'South West'),
    ('Inspire Polytechnic, Lagos', 'Lagos', 'South West'),
    ('Kalac Crystal Polytechnic, Lekki', 'Lagos', 'South West'),
    ('Paramount Polytechnic, Ejigbo', 'Lagos', 'South West'),
    ('Ronik Polytechnic, Ejigbo', 'Lagos', 'South West'),
    ('Timeon Kairos Polytechnic, Lagos', 'Lagos', 'South West'),
    ('Unique College of Management and Technology, Lagos', 'Lagos', 'South West'),
    ('Al-Hikma Polytechnic, Karu', 'Nasarawa', 'North Central'),
    ('NACABS Polytechnic, Akwanga', 'Nasarawa', 'North Central'),
    ('Vineyard Polytechnic', 'Nasarawa', 'North Central'),
    ('St. Mary Polytechnic, Kwamba, Suleja', 'Niger', 'North Central'),
    ('Allover Central Polytechnic, Sango-Ota', 'Ogun', 'South West'),
    ('First City Polytechnic, Abeokuta', 'Ogun', 'South West'),
    ('I-Con Universal Polytechnic', 'Ogun', 'South West'),
    ('Landmark Polytechnic, Ayetoro', 'Ogun', 'South West'),
    ('Redeemers College of Technology and Management, Mowe', 'Ogun', 'South West'),
    ('Stars Polytechnic, Ota', 'Ogun', 'South West'),
    ('Best Solution Polytechnic, Akure', 'Ondo', 'South West'),
    ('British Transatlantic Polytechnic, Akure', 'Ondo', 'South West'),
    ('Edward Olaseni Polytechnic, Ajowa-Akoko', 'Ondo', 'South West'),
    ('Daboss Polytechnic', 'Osun', 'South West'),
    ('Distinct Polytechnic, Ekosin', 'Osun', 'South West'),
    ('Igbajo Polytechnic, Igbajo', 'Osun', 'South West'),
    ('Interlink Polytechnic, Ijebu-Jesa', 'Osun', 'South West'),
    ('Iwo City Polytechnic, Iwo', 'Osun', 'South West'),
    ('The Polytechnic, Ile-Ife', 'Osun', 'South West'),
    ('Villanova Polytechnic, Imesi-Ile', 'Osun', 'South West'),
    ('Westland Polytechnic, Ilobu', 'Osun', 'South West'),
    ('Wolex Polytechnic, Iwo', 'Osun', 'South West'),
    ('American Polytechnic, Wasimi', 'Oyo', 'South West'),
    ('Bolmor Polytechnic, Ibadan', 'Oyo', 'South West'),
    ('Ibadan City Polytechnic, Ibadan', 'Oyo', 'South West'),
    ('Novelty Polytechnic, Kishi', 'Oyo', 'South West'),
    ('Saf Polytechnic, Iseyin', 'Oyo', 'South West'),
    ('The West African Polytechnic', 'Oyo', 'South West'),
    ('Tower Polytechnic, Ibadan', 'Oyo', 'South West'),
    ('United Polytechnic, Jos', 'Plateau', 'North Central'),
    ('Eastern Polytechnic, Port Harcourt', 'Rivers', 'South South'),
    ('Institute of Ecumenical Education, Thinkers Corner', 'Enugu', 'South East'),
    ('Delar College of Education', 'Oyo', 'South West'),
    ('City College of Education, Mararaba', 'Nasarawa', 'North Central'),
    ('Ansar-Ud-Deen College of Education, Isolo', 'Lagos', 'South West'),
    ('Yewa Central College of Education', 'Ogun', 'South West'),
    ('OSISA Tech College of Education', 'Enugu', 'South East'),
    ('St. Augustine College of Education, Akoka', 'Lagos', 'South West'),
    ('African Thinkers Community of Inquiry College of Education', 'Enugu', 'South East'),
    ('Muftau Olanihun College of Education', 'Oyo', 'South West'),
    ('Havard Wilson College of Education', 'Abia', 'South East'),
    ('Muhyideen College of Education', 'Kwara', 'North Central'),
    ('College of Education, Offa', 'Kwara', 'North Central'),
    ('Bauchi Institute of Arabic and Islamic Studies', 'Bauchi', 'North East'),
    ('Corner Stone College of Education', 'Lagos', 'South West'),
    ('Peaceland College of Education', 'Enugu', 'South East'),
    ('The College of Education, Nsukka', 'Enugu', 'South East'),
    ('Unity College of Education, Auka Adoka', 'Benue', 'North Central'),
    ('Diamond College of Education, Aba', 'Abia', 'South East'),
    ('Kinsey College of Education, Ilorin', 'Kwara', 'North Central'),
    ('ECWA College of Education, Jos', 'Plateau', 'North Central')
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
from tmp_private_broader_institution_seed as seeded
where lower(btrim(existing.name)) = lower(btrim(seeded.name))
  and lower(btrim(existing.state)) = lower(btrim(seeded.state));

insert into public.universities (name, state, zone, slug)
select
  seeded.name,
  seeded.state,
  seeded.zone,
  seeded.slug
from tmp_private_broader_institution_seed as seeded
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
