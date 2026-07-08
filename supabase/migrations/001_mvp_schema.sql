-- Road to Reentry MVP Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE resource_coverage AS ENUM ('single', 'multi', 'statewide');
CREATE TYPE resource_status AS ENUM ('active', 'archived');

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  description_es TEXT,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  state TEXT,
  county TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  hours TEXT,
  eligibility TEXT,
  eligibility_es TEXT,
  notes TEXT,
  notes_es TEXT,
  served_counties TEXT[] NOT NULL DEFAULT '{}',
  coverage resource_coverage NOT NULL DEFAULT 'single',
  services TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  status resource_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resources_status ON resources(status);
CREATE INDEX idx_resources_state ON resources(state);
CREATE INDEX idx_resources_county ON resources(county);
CREATE INDEX idx_resources_category ON resources(category_id);
CREATE INDEX idx_resources_name ON resources(name);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active categories"
  ON categories FOR SELECT
  USING (is_active = true);

CREATE POLICY "Public read active resources"
  ON resources FOR SELECT
  USING (status = 'active');
