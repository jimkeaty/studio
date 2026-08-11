## Direct unified-form route 403 — 2026-08-11

- Build `3660ab8-master` is live.
- A direct browser request to `/dashboard/transactions/new?edit=M7EgOwdtDPtk5E7tsJaW` returned a plain server-level 403 before the application loaded.
- The same route loaded successfully before the new deployment, so this is a deployment/routing or client-cache issue, not an in-app transaction authorization message.
- Next.js configuration contains no middleware or explicit route block. App Hosting configuration contains no rewrite rule.
- Continue by checking the service-worker cache behavior and static-build output for the dynamic `dashboard/transactions/new` route.

## Fresh-access comparison

- The bare `/dashboard/transactions/new` route and a harmless `?type=listing` query returned the normal sign-in page.
- A fresh public extraction of the previously failing `?edit=M7EgOwdtDPtk5E7tsJaW` URL also returned the normal sign-in page on build `3660ab8-master`.
- This indicates the current server deployment accepts the direct edit URL. The 403 displayed in the logged-in browser is therefore most likely a stale service-worker/browser-cache response or a transient browser-session edge response, not a permanent route configuration failure.
