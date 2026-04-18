BEGIN;

UPDATE players
SET country = 'Unknown'
WHERE country IS NULL
   OR btrim(country) = ''
   OR lower(btrim(country)) IN ('-', '--', 'na', 'n/a', 'null', 'unknown');

COMMIT;
