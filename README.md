# PegaJá

**Tudo que precisa ir, Chega!**

PegaJá is an Angola-first logistics network for moving packages, documents and other items between people and businesses.

## Repository structure

- `apps/customer` — PegaJá customer PWA
- `apps/courier` — courier PWA
- `apps/operations` — operations web dashboard
- `packages/supabase` — shared Supabase client and generated database types
- `supabase/migrations` — versioned database changes

## Backend

Supabase project: `cswyxgawqqexytgcnjib` (eu-west-1).

The existing backend and logistics domain remain the source of truth. This rebrand changes the customer-facing product identity from TrazJá to PegaJá; it does not rewrite the delivery, dispatch, payment, evidence, or authorization model.

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

The PegaJá customer PWA is scaffolded in `apps/customer` on the customer-experience branch. Run it with `pnpm --filter @pegaja/customer dev` and provide the publishable Supabase key from `.env.example`.

The customer workflow uses only verified live contracts: `create_delivery_draft`, draft-scoped inserts into `delivery_stops`, `delivery_packages`, and `delivery_evidence`, private `delivery-evidence` Storage uploads, `calculate_delivery_quote`, and `confirm_delivery`. Prices, totals, service levels, availability, delivery state, and authorization remain backend-owned. Realtime delivery events refresh shipment tracking; no client-calculated shipment state is persisted.

The live backend does not currently expose `customer_assistant_context`; Paula is therefore visible but reports the missing contract instead of fabricating assistance. A production assistant RPC, plus atomic server-side validation of the complete draft (stops, package, evidence, quote snapshot, and confirmation), remain backend work before broad rollout. The exact live contract and security notes are recorded in `supabase/BACKEND_AUDIT.md`.
