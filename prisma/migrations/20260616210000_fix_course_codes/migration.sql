-- Fix course codes: update unofficial codes to official Uniandes codes,
-- then delete confirmed duplicates that have no tutor associations.

-- ─── STEP 1: Rename unofficial codes to official Uniandes codes ────────────

-- ISIS — Ingeniería de Sistemas
UPDATE courses SET code = 'ISIS1106' WHERE code = 'LYM';
UPDATE courses SET code = 'ISIS2203' WHERE code = 'INFRACOMP';
UPDATE courses SET code = 'ISIS2304' WHERE code = 'SISTRANS';
UPDATE courses SET code = 'ISIS2403' WHERE code = 'ARQUIEMP';
UPDATE courses SET code = 'ISIS2603' WHERE code = 'SOFTTEAM';
UPDATE courses SET code = 'ISIS3204' WHERE code = 'INFRACOM';
UPDATE courses SET code = 'ISIS3301' WHERE code = 'INTELNEG';
UPDATE courses SET code = 'ISIS3302' WHERE code = 'MODSIMOPT';
UPDATE courses SET code = 'ISIS3425' WHERE code = 'SISEMP';
UPDATE courses SET code = 'ISIS3710' WHERE code = 'PROGTECWEB';

-- IIND — Ingeniería Industrial
UPDATE courses SET code = 'IIND1000' WHERE code = 'INTROIIND';
UPDATE courses SET code = 'IIND2111' WHERE code = 'FUNDANDAT';
UPDATE courses SET code = 'IIND2112' WHERE code = 'FUNDMODEST';
UPDATE courses SET code = 'IIND2205' WHERE code = 'INGPROD';
UPDATE courses SET code = 'IIND2206' WHERE code = 'INGCADSUM';
UPDATE courses SET code = 'IIND2304' WHERE code = 'MODSIMSIS';
UPDATE courses SET code = 'IIND2405' WHERE code = 'FUNDANFIN';
UPDATE courses SET code = 'IIND2501' WHERE code = 'MODOPT';
UPDATE courses SET code = 'IIND2502' WHERE code = 'MODINCER';

-- ECON — Economía
UPDATE courses SET code = 'ECON1006' WHERE code = 'PENSARPROB';
UPDATE courses SET code = 'ECON2101' WHERE code = 'MICRO2';
UPDATE courses SET code = 'ECON2108' WHERE code = 'FUNDECON';

-- ADMI — Administración
UPDATE courses SET code = 'ADMI2554' WHERE code = 'MODMULTI';
UPDATE courses SET code = 'ADMI2555' WHERE code = 'VIZDAT';
UPDATE courses SET code = 'ADMI2558' WHERE code = 'OPTSIM';
UPDATE courses SET code = 'ADMI2559' WHERE code = 'MINDAT';
UPDATE courses SET code = 'ADMI2606' WHERE code = 'PROYORG';

-- MATE — Matemáticas
UPDATE courses SET code = 'MATE1102' WHERE code = 'MATESTRUC';
UPDATE courses SET code = 'MATE2301' WHERE code = 'ECUADIF';

-- FISI — Física
UPDATE courses SET code = 'FISI1518' WHERE code = 'FIS1';
UPDATE courses SET code = 'FISI1528' WHERE code = 'FIS2';

-- ICYA — Ingeniería Civil y Ambiental
UPDATE courses SET code = 'ICYA1114' WHERE code = 'INTROICIV';
UPDATE courses SET code = 'ICYA1116' WHERE code = 'ESTATICA';
UPDATE courses SET code = 'ICYA1117' WHERE code = 'RESISTMAT';
UPDATE courses SET code = 'ICYA1122' WHERE code = 'MATICIV';
UPDATE courses SET code = 'ICYA2001' WHERE code = 'CALCNUM';
UPDATE courses SET code = 'ICYA2203' WHERE code = 'SISESTRUC';
UPDATE courses SET code = 'ICYA2304' WHERE code = 'GEOTECN';
UPDATE courses SET code = 'ICYA2401' WHERE code = 'MECFLUIDOS';
UPDATE courses SET code = 'ICYA2402' WHERE code = 'HIDRAUL';
UPDATE courses SET code = 'ICYA3016' WHERE code = 'FUNDTRANS';
UPDATE courses SET code = 'ICYA3203' WHERE code = 'GERPROJ';
UPDATE courses SET code = 'ICYA3305' WHERE code = 'ESTRGEO';

-- IBIO — Ingeniería Biomédica
UPDATE courses SET code = 'IBIO1010' WHERE code = 'INTROBIOM';
UPDATE courses SET code = 'IBIO2099' WHERE code = 'FISIOBIOM1';
UPDATE courses SET code = 'IBIO2102' WHERE code = 'FISIOBIOM2';
UPDATE courses SET code = 'IBIO2250' WHERE code = 'FENTRBIOM';
UPDATE courses SET code = 'IBIO2340' WHERE code = 'FUNDML';
UPDATE courses SET code = 'IBIO2650' WHERE code = 'BIOMATERI';
UPDATE courses SET code = 'IBIO3160' WHERE code = 'BIOMECAN';
UPDATE courses SET code = 'IBIO3260' WHERE code = 'MODSIMBIOM';
UPDATE courses SET code = 'IBIO3270' WHERE code = 'DISEXPBIOM';
UPDATE courses SET code = 'IBIO3560' WHERE code = 'SIGBIOM';
UPDATE courses SET code = 'IBIO3590' WHERE code = 'SENSBIOM';
UPDATE courses SET code = 'IBIO3670' WHERE code = 'FUNDVIS';

-- MBIO / QUIM / IMEC
UPDATE courses SET code = 'MBIO2100' WHERE code = 'BIOQUIM';
UPDATE courses SET code = 'MBIO2104' WHERE code = 'FUNDBIOL';
UPDATE courses SET code = 'IMEC1410' WHERE code = 'CIENMAT';
UPDATE courses SET code = 'QUIM1303' WHERE code = 'FUNDQUIMORG';

-- ─── STEP 2: Delete confirmed duplicates (only if no tutor associations) ───
-- Safe: ON DELETE CASCADE in tutor_courses means the delete would cascade,
-- so we guard with NOT IN to avoid removing courses tutors teach.

DELETE FROM courses
WHERE code IN (
  -- MATE duplicates (official: MATE1201, MATE1203, MATE1105, MATE1207, MATE1252, MATE1253)
  'PRECALCULO', 'CALCDIF', 'CALCVEC', 'ALGLIN', 'CALCINTPROB', 'ALGLIN3',
  -- ISIS duplicates (official: ISIS1001, ISIS1107, ISIS1221, ISIS1225, ISIS1226,
  --   ISIS1311, ISIS1511, ISIS1611, ISIS2112, ISIS2211, ISIS2212, ISIS2213,
  --   ISIS2214, ISIS2311, ISIS2411, ISIS2611, ISIS3211, ISIS3311)
  'INTROISIS', 'IP', 'FMC', 'EDA', 'DPOO', 'INFRATEC', 'FUNDBD',
  'INTELIG', 'DALGO', 'ISOFTMOD', 'ARQUISOFT', 'DISAPCOM', 'TI',
  'REDESCOM', 'INEGDIGITAL', 'APRENDMAQ', 'FABSOFT', 'CIBERSEG',
  -- ADMI duplicates (official: ADMI1101, ADMI1203, ADMI1602, ADMI1603, ADMI2104,
  --   ADMI2204, ADMI2301, ADMI2302, ADMI2403, ADMI2501, ADMI2801, ADMI3110,
  --   ADMI3405, ADMI3701)
  'FUNDADM', 'PLANFIN', 'AUTODEV', 'ORGCO', 'HISTEMPCOL', 'DECINV',
  'FUNDMKT', 'INVMKT', 'OPELOG', 'ANALMENT', 'GESTPUB', 'EMPRINNOV',
  'SIG', 'NEGINT',
  -- ECON duplicates (official: ECON2107, ECON2203)
  'INTROMICRO', 'INTROMACRO', 'MICRO1', 'MACRO1',
  -- IIND duplicates (official: IIND2106, IIND2401)
  'PROBESTAD', 'PROBESTAD1', 'ANALDECINV', 'ANADEC',
  -- Other duplicates
  'CONTFIN',       -- dup of CONT1412
  'FUNDDERNEGO'    -- dup of DERE1202
)
AND id NOT IN (SELECT DISTINCT course_id FROM tutor_courses);
