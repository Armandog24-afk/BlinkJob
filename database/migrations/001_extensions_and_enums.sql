-- BlinkJob — 001: extensions and enum types
-- Requires Supabase/Postgres with postgis available.

create extension if not exists "uuid-ossp";
create extension if not exists postgis;
create extension if not exists pgcrypto;

do $$ begin
  create type user_role as enum ('worker', 'recruiter', 'company_owner', 'support', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum ('incomplete', 'pending_verification', 'active', 'suspended', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_tier as enum ('t0', 't1', 't2', 't3');
exception when duplicate_object then null; end $$;

do $$ begin
  create type skill_level as enum ('base', 'intermedio', 'avanzato');
exception when duplicate_object then null; end $$;

do $$ begin
  create type company_status as enum ('pending_verification', 'active', 'limited', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type company_member_role as enum ('owner', 'recruiter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum (
    'draft', 'published', 'in_selection', 'confirmed',
    'in_progress', 'completed', 'disputed', 'canceled', 'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type urgency_tier as enum ('standard', 'blinknow');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_type as enum ('application', 'invite');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum (
    'sent', 'viewed', 'shortlisted', 'info_requested',
    'accepted', 'rejected', 'withdrawn', 'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type assignment_status as enum ('confirmed', 'in_progress', 'completed', 'disputed', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type check_event_type as enum ('check_in', 'check_out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type check_event_method as enum ('gps', 'manual', 'qr');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('draft', 'pending', 'confirmed', 'paid', 'refunded', 'disputed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type moderation_status as enum ('pending', 'published', 'hidden');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_status as enum ('open', 'collecting', 'deciding', 'resolved', 'appealed', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_channel as enum ('in_app', 'email');
exception when duplicate_object then null; end $$;

do $$ begin
  create type skill_taxonomy_status as enum ('active', 'deprecated');
exception when duplicate_object then null; end $$;
