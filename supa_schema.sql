-- SQL Schema for Certificates Generation Database

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create settings table for certificate layouts and coordinates
create table if not exists public.settings (
    id text primary key default 'default',
    cert_prefix text default 'TGH-KU50-',
    bg_image_en text, -- English template background image URL/base64
    bg_image_ar text, -- Arabic template background image URL/base64
    layouts jsonb default '{
        "en": {
            "name": {"x": 400, "y": 260, "fontSize": 32, "color": "#1a1d24", "fontWeight": "bold", "fontFamily": "Outfit"},
            "facilitator": {"x": 400, "y": 380, "fontSize": 18, "color": "#4a5568", "fontWeight": "normal", "fontFamily": "Inter"},
            "certId": {"x": 100, "y": 520, "fontSize": 12, "color": "#718096", "fontWeight": "normal", "fontFamily": "Inter"},
            "projectCode": {"x": 100, "y": 540, "fontSize": 12, "color": "#718096", "fontWeight": "normal", "fontFamily": "Inter"},
            "qrCode": {"x": 650, "y": 450, "size": 100}
        },
        "ar": {
            "name": {"x": 400, "y": 260, "fontSize": 32, "color": "#1a1d24", "fontWeight": "bold", "fontFamily": "Cairo"},
            "facilitator": {"x": 400, "y": 380, "fontSize": 18, "color": "#4a5568", "fontWeight": "normal", "fontFamily": "Cairo"},
            "certId": {"x": 700, "y": 520, "fontSize": 12, "color": "#718096", "fontWeight": "normal", "fontFamily": "Cairo"},
            "projectCode": {"x": 700, "y": 540, "fontSize": 12, "color": "#718096", "fontWeight": "normal", "fontFamily": "Cairo"},
            "qrCode": {"x": 50, "y": 450, "size": 100}
        }
    }'::jsonb,
    created_at timestamp with time zone default now()
);

-- Create certificates table
create table if not exists public.certificates (
    id uuid primary key default gen_random_uuid(),
    cert_id text unique not null,
    name text not null,
    facilitator text,
    project_code text,
    batch text,
    status text not null default 'pending', -- pending, generating, saved, failed
    pdf_url text,
    language text not null default 'EN', -- EN, AR
    metadata jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now()
);

-- Index for fast verification query by cert_id
create index if not exists idx_certificates_cert_id on public.certificates(cert_id);

-- Enable RLS (Row Level Security) - customize as needed
alter table public.settings enable row level security;
alter table public.certificates enable row level security;

-- Policies for public reading (needed for verification and fetching layout)
create policy "Allow public read access to settings" 
on public.settings for select 
using (true);

create policy "Allow public read access to certificates" 
on public.certificates for select 
using (true);

-- Policies for admin write access (allow all operations for anonymous client in sandbox, or configure custom roles)
create policy "Allow all operations for settings" 
on public.settings for all 
using (true)
with check (true);

create policy "Allow all operations for certificates" 
on public.certificates for all 
using (true)
with check (true);

-- Insert default layout settings if not present
insert into public.settings (id, cert_prefix) 
values ('default', 'TGH-KU50-')
on conflict (id) do nothing;

-- Migration for existing databases (run this in Hasura Console if database is already created):
-- ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS batch text;
