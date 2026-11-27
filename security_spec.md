# Security Specification: InPursuit

## 1. Data Invariants
1. **User Data Isolation**: Only the authenticated user whose `request.auth.uid == userId` may read/write `/users/{userId}` and its v4 subcollections (`lifeAreas`, `goals`, `projects`, `tasks`, `habits`, `habitLogMonths`, `dailyPlans`, `dailyReviews`, and `mindArchitecture/default`). Collection listing (`allow list`) on `/users` is strictly disabled (`if false`).
2. **Verified Identity**: All writes (`create`, `update`, `delete`) require `request.auth.token.email_verified == true`.
3. **Path Integrity**: `{userId}` and entity IDs MUST satisfy `isValidId(id)` (`1..128` chars matching `^[a-zA-Z0-9_-]+$`); date-keyed docs require `YYYY-MM-DD` / `YYYY-MM`; Mind Architecture doc ID is constrained to `'default'`.
4. **Strict Schema Enforcement & CEL Boundary**:
   - Every v4 subcollection doc and dailyPlan (`priorityTaskIds[0..2]`) is validated element-by-element in Firestore Rules.
   - `/users/{userId}/mindArchitecture/default` validates `schemaVersion == 1`, strict profile fields (`title`, `subtitle`, `mode in ['sample', 'custom']`), bounded custom arrays (`sources <= 200`, `nodes <= 600`, `edges <= 1200`), `hypothesisDecisions <= 400`, `recentExplorations <= 12`, and enforces `customDataset == null` in `'sample'` mode.
   - v3 `/users/{userId}` validates required keys, `allowedKeys` (including optional `syncVersion >= 0`), max list sizes, and prevents v3 clients from overwriting migrated `existing().schemaVersion == 4` documents.
   - Because Firestore Rules CEL cannot iterate arbitrary-length lists (up to 1000 tasks), per-element sanitization inside v3 arrays is enforced client-side by `sanitizeAppData()`, while full per-document rules enforcement applies on v4 subcollections.
5. **Privilege Isolation (Monetization)**:
   - `/admins/{userId}` is never writable by clients (`allow write: if false`).
   - `/entitlements/{userId}` is readable only by its owner or an admin (`allow get`) and writable **only** by `isAdmin()`. Users cannot self-assign `tier: "pro"`.
   - `/paymentRequests/{requestId}` is **fail-closed** (`allow create: if false`) for direct client writes until a trusted server/Cloud Function backend is implemented to enforce `referenceCode` uniqueness/anti-replay and rate limits. Only `isAdmin()` may transition an existing `'pending'` request to `'approved'` or `'rejected'` with exact plan pricing (`29000` monthly, `249000` annual).
6. **Default Deny**: All other Firestore paths are denied via `match /{document=**} { allow read, write: if false; }`.

## 2. Adversarial Payloads Blocked by Rules
1. **Cross-User Get/Write**: User A accesses `/users/userB`, `/users/userB/tasks/*`, or `/entitlements/userB` -> `PERMISSION_DENIED`.
2. **Collection Enumeration**: Client attempts `list(/users)` or `list(/admins)` or `list(/entitlements)` -> `PERMISSION_DENIED`.
3. **Self-Granted Pro Privilege Escalation**: User A writes `/entitlements/userA` with `{ tier: "pro", status: "active" }` -> `PERMISSION_DENIED`.
4. **Client Payment Request Creation / Replay / Price Tampering**: Any client attempt to `create` `/paymentRequests/*` -> `PERMISSION_DENIED`; admin attempts to re-open non-`pending` requests or tamper with pricing -> `PERMISSION_DENIED`.
5. **Admin Spoofing**: User A writes `/admins/userA` -> `PERMISSION_DENIED`.
6. **Unauthenticated / Unverified Write**: Anonymous or `email_verified: false` write -> `PERMISSION_DENIED`.
7. **Ghost / Shadow Field Injection**: Write payload containing `role: "admin"` or `isPro: true` on `/users/{uid}` -> rejected by `hasOnly(...)`.
8. **Immutable Field Mutation & v4 Downgrade**: Updating `createdAt` on v4 entity docs, mutating `userId`/`createdAt` on `/paymentRequests/*`, or overwriting a v4 `/users/{uid}` doc with a v3 payload -> `PERMISSION_DENIED`.
9. **Invalid Schema Version, Bad DailyPlan IDs, or Malformed Date Keys**: Writing `dailyReviews/not-a-date`, `priorityTaskIds[1] = "bad id"`, or `schemaVersion: 99` -> `PERMISSION_DENIED`.
10. **Denial-of-Wallet Oversized Payloads**: Writing strings exceeding max length or lists exceeding `WORKSPACE_LIMITS` -> `PERMISSION_DENIED`.
