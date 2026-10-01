# PegaJá customer PWA

## Repository and branch

This implementation is based directly on `MrPresident-collab/TrazJa`, starting from `main` at `aa82202dd2954c8582f7b3b67f5f753e2f15acfa`. Work is isolated on the customer-experience branch.

The product has been rebranded from TrazJá to **PegaJá**. The existing backend contracts, database model, delivery lifecycle and security architecture remain unchanged.

## Implemented surface

`apps/customer` is a mobile-first React/Vite PWA for authenticated customers. It provides the PegaJá navigation model (**Enviar**, **Atividades**, **Perfil**), a multi-step **Novo envio** flow with pickup, destination, optional waypoints, package details, delivery-service selection, native camera capture, backend quote review, payment method, and confirmation. Shipment history reads live delivery rows with ordered stops and packages and refreshes from `delivery_events` realtime changes. Delivery detail shows route stops and lifecycle events. Notifications and profile are backed by Supabase tables.

The evidence input uses `capture="environment"`, accepts only JPEG/WebP, and uploads to the live private `delivery-evidence` bucket. The evidence row records `bucket_id`, object path, package, draft delivery, capture user, and evidence type. The customer app never writes prices, totals, availability, dispatch state, or delivery lifecycle state from client calculations.

## Verified live contracts

The app uses `create_delivery_draft`, draft-RLS inserts into `delivery_stops`, `delivery_packages`, and `delivery_evidence`, private Storage upload, `calculate_delivery_quote`, and `confirm_delivery`. The live database exposes service levels, payment enum values, private evidence storage, and participant RLS for delivery history. No service-role key or secret is included in the client.

Paula is present in the customer experience and calls the zero-argument `customer_assistant_context()` RPC when opened. The live database currently does not expose that RPC, so the UI reports the missing contract and does not invent account or shipment context.

## Validation

- `pnpm typecheck`: passed
- `pnpm build`: passed
- `git diff --check`: passed
- customer source scan for service-role secrets and marketplace architecture terms: zero hits
- Repository test command: not defined in the canonical repository yet

## Remaining backend work

The current client workflow is intentionally honest about backend limits. A production atomic customer workflow should replace the multi-request draft sequence so partial rows and orphaned storage objects cannot remain after a later request fails. The backend also needs `customer_assistant_context()` and a message contract before Paula can answer questions; server-side dispatch, route/distance/ETA, wallet/payment transaction boundaries, and database-level RLS/state-transition tests remain in the backend audit. The client does not call `dispatch_delivery` because dispatch is an operational backend transition, not a customer-controlled state change.
