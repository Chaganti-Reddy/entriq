-- packages/db/schema.sql
-- Run this FRESH in Supabase SQL Editor (drop all tables first).
-- Supabase Auth handles passwords — no password_hash in public.users.

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ────────────────────────────────────────────────────────────────────
-- Public profile table. id MUST match auth.users.id (set by trigger below).
-- Supabase Auth owns the email+password in auth.users — never duplicated here.
CREATE TABLE users (
  id         UUID        PRIMARY KEY,
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ORGANIZATIONS ────────────────────────────────────────────────────────────
CREATE TABLE orgs (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT        NOT NULL,
  email            TEXT        NOT NULL UNIQUE,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ORG MEMBERS ──────────────────────────────────────────────────────────────
CREATE TABLE org_members (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  org_id     UUID        NOT NULL REFERENCES orgs(id)   ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('admin', 'co_organizer')),
  status     TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  invited_by UUID        REFERENCES org_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, org_id)
);

-- ─── SUPER ADMINS ─────────────────────────────────────────────────────────────
-- Platform-level admins — separate from regular users, use bcrypt password.
CREATE TABLE super_admins (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EVENTS ───────────────────────────────────────────────────────────────────
CREATE TABLE events (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  description    TEXT,
  date           DATE,
  location       TEXT,
  slug           TEXT        NOT NULL UNIQUE,
  admin_password TEXT        NOT NULL,   -- bcrypt hashed gate password for scan page
  is_active      BOOLEAN     DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── REGISTRATIONS ────────────────────────────────────────────────────────────
CREATE TABLE registrations (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  surname       TEXT        NOT NULL,
  state         TEXT        NOT NULL,
  city          TEXT        NOT NULL,
  mobile        TEXT        NOT NULL,
  profession    TEXT        NOT NULL,
  other_info    TEXT,
  unique_code   TEXT        NOT NULL UNIQUE,
  status        TEXT        DEFAULT 'not_approved'
                            CHECK (status IN ('not_approved', 'approved')),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_registrations_event_user UNIQUE (event_id, user_id)
);

-- ─── CHECK-IN AUDIT LOG ───────────────────────────────────────────────────────
CREATE TABLE checkins (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID        NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  event_id        UUID        NOT NULL REFERENCES events(id)        ON DELETE CASCADE,
  approved_at     TIMESTAMPTZ DEFAULT NOW(),
  approved_by     TEXT        DEFAULT 'Admin'
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_users_email               ON users(email);
CREATE INDEX idx_org_members_user_id       ON org_members(user_id);
CREATE INDEX idx_org_members_org_id        ON org_members(org_id);
CREATE INDEX idx_orgs_status               ON orgs(status);
CREATE INDEX idx_events_slug               ON events(slug);
CREATE INDEX idx_events_org_id             ON events(org_id);
CREATE INDEX idx_registrations_event_id    ON registrations(event_id);
CREATE INDEX idx_registrations_user_id     ON registrations(user_id);
CREATE INDEX idx_registrations_unique_code ON registrations(unique_code);
CREATE INDEX idx_registrations_status      ON registrations(status);
CREATE INDEX idx_checkins_event_id         ON checkins(event_id);
CREATE INDEX idx_checkins_registration_id  ON checkins(registration_id);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins   ENABLE ROW LEVEL SECURITY;
ALTER TABLE events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins       ENABLE ROW LEVEL SECURITY;
-- No public policies — all access goes through the API with service_role key.

-- ─── SUPABASE AUTH TRIGGER ────────────────────────────────────────────────────
-- Automatically creates a public.users profile whenever a new auth.user is created.
-- name comes from user_metadata set during signUp.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ─── ORPHAN ORG CLEANUP TRIGGER ──────────────────────────────────────────────
-- When a user is deleted, their org_members row cascades away.
-- If they were the sole admin, the org becomes unmanageable → delete it.
-- This fires AFTER the org_members row is removed (via the user CASCADE).
CREATE OR REPLACE FUNCTION public.handle_org_member_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  remaining_admins INT;
BEGIN
  -- Only act when an admin member was removed
  IF OLD.role <> 'admin' THEN
    RETURN OLD;
  END IF;

  -- Count remaining active admins in the org
  SELECT COUNT(*) INTO remaining_admins
  FROM public.org_members
  WHERE org_id = OLD.org_id AND role = 'admin';

  -- If none left, cascade-delete the org (events + registrations follow via FK)
  IF remaining_admins = 0 THEN
    DELETE FROM public.orgs WHERE id = OLD.org_id;
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER on_org_member_deleted
  AFTER DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_org_member_deleted();