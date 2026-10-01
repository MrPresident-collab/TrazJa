# PegaJá Backend Audit — 2026-09-30

## Current backend state

Supabase project: `cswyxgawqqexytgcnjib`  
Region: `eu-west-1`

The live database is the current runtime source of truth while the reproducible baseline migration is being reconstructed.

### Domain model currently present

- Identity: `profiles`, `user_roles`
- Business: `businesses`, `business_members`
- Addresses: `addresses`
- Delivery core: `deliveries`, `delivery_stops`, `delivery_packages`
- Dispatch: `delivery_assignments`, `courier_profiles`, `courier_availability`
- Tracking/events: `courier_locations`, `delivery_events`
- Pricing/quotes: `pricing_rules`, `service_levels`, `delivery_quotes`, `delivery_gratuities`
- Evidence/security: `delivery_evidence`, `delivery_pins`, private `delivery-evidence` Storage bucket
- Finance: `payments`, `wallet_accounts`, `wallet_transactions`, `courier_earnings`
- Operations: `service_zones`, `incidents`, `notifications`

## Security hardening completed

- All public domain tables have RLS enabled.
- Courier approval state is no longer client-writable.
- Courier self-service profile updates are column-restricted.
- Courier online state requires courier role and approved courier state.
- Customer package evidence is restricted to draft deliveries and a private evidence bucket.
- Evidence objects have no client update/delete path.
- Delivery PIN is stored as a hash, has expiry and attempt limits, and is verified server-side.
- Courier delivery completion through the normal transition function no longer permits direct `delivered`; delivery completion is gated by PIN verification.
- Delivery transition event logging was corrected to record the actual previous status.
- Delivery idempotency is enforced per requester.
- Newly introduced foreign-key indexes were added.
- Security Advisor currently returns zero findings.

## Intentional architecture

FleetPulse is being used as a backend/domain reference, not copied 1:1. The PegaJá model keeps the same important logistics primitives—delivery lifecycle, ordered stops, assignment/dispatch, courier telemetry, evidence, payments, and auditable events—while adapting them to PegaJá requirements.

PegaJá-specific rules include:

1. Customer package photo is captured as a direct-camera evidence artifact.
2. Customer package photo is not proof of delivery.
3. Delivery completion uses a recipient PIN.
4. Multi-stop delivery is first-class.
5. Operations-controlled configuration must not be hardcoded in clients.
6. Wallet and courier earnings are separate financial domains, not fields hidden inside delivery rows.

## Known next backend work

1. Build the atomic customer delivery workflow:
   - draft creation
   - route/stops validation
   - package validation
   - quote generation
   - quote snapshot
   - confirmation
2. Build server-side dispatch workflow:
   - eligible courier pool
   - offer expiry
   - concurrency-safe assignment
   - reassignment
3. Build route/distance/ETA calculation.
4. Build wallet/payment transaction boundaries and idempotency.
5. Add database-level tests for RLS and state transitions.
6. Consolidate remaining multiple-permissive-policy performance warnings.
7. Generate a complete reproducible baseline migration from the live database before production rollout.

## Customer PWA contract verification

The first PegaJá customer PWA implementation uses only the following live contracts: `create_delivery_draft`, `calculate_delivery_quote`, and `confirm_delivery`, plus RLS-protected draft inserts into `delivery_stops`, `delivery_packages`, and `delivery_evidence`. The client uploads package evidence only to the private `delivery-evidence` bucket, whose live policy accepts JPEG and WebP objects up to 10 MiB. Delivery history reads participant-authorized rows and subscribes to `delivery_events` for tracking refreshes.

The live database currently exposes no `customer_assistant_context` RPC. Paula is visible in the customer UI but reports this missing contract rather than fabricating account or delivery context. The current draft workflow is still multi-request from the client; an atomic server-side customer workflow should replace it before production rollout so partial draft rows or orphaned evidence objects cannot be left when a later step fails. The client does not delete evidence objects because the storage contract intentionally provides no client delete path.

## Important audit note

The database is currently populated structurally but has no application rows. Performance Advisor reports unused indexes; these are expected until real workloads exist. They should not be removed merely to silence the advisor.

Frontend work is intentionally blocked until the backend contracts above are stable enough to serve as the source of truth.
