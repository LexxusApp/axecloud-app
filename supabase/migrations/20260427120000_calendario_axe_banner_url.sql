-- Banner opcional nos eventos (capa na gestão e para filhos de santo)
ALTER TABLE calendario_axe ADD COLUMN IF NOT EXISTS banner_url text;
