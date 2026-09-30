# TrazJá

**Tudo que precisa ir, chega!**

TrazJá is a logistics network for moving packages, documents and other items between people and businesses.

## Repository structure

- `apps/customer` — customer PWA
- `apps/courier` — courier PWA
- `apps/operations` — operations web dashboard
- `packages/supabase` — shared Supabase client and generated database types
- `supabase/migrations` — versioned database changes

## Backend

Supabase project: `cswyxgawqqexytgcnjib` (eu-west-1).

The database already contains the first TrazJá domain model. This repository starts by making the database state reproducible and hardening its authorization boundaries.

No service-role or secret key belongs in frontend environment variables.

## Core domain

The primary object is a **delivery**, not a merchant order.

A delivery contains ordered stops, packages, assignments, lifecycle events, payment state and proof of delivery.

Multi-stop delivery is first-class:

`A → B`, `A → B → C`, `A → B → C → D`.

## Security baseline

- Supabase Auth for identity.
- PostgreSQL RLS for row authorization.
- Authorization roles live in `public.user_roles`, not user-editable metadata.
- Operations access is checked server-side through `private.has_role('operations')`.
- Courier assignment acceptance is performed through a guarded database function.
- Frontend clients use only the publishable key.

## Current implementation status

The initial Supabase project was inspected before application scaffolding. Existing policies contained several object-level authorization defects; those were corrected before frontend work began.

The next implementation layer is the three application surfaces and their shared domain services.
