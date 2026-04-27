# Heatsync server asks (from extension)

Tight spec for backend endpoints needed to complete the social-graph + cross-platform identity features shipped in the extension. Ranked by ROI.

Each entry: what it is, why, request/response, scope/auth, edge cases, schema notes.

---

## 1. Heatsync-native block / unblock — **HIGH ROI, SMALL SERVER WORK**

Mirrors `/api/follow/{userId}` (already implemented). Lets users block other heatsync users so their content doesn't reach you.

**Endpoints:**
```
POST   /api/block/{userId}    → 200 { ok: true }
DELETE /api/block/{userId}    → 200 { ok: true }
GET    /api/user/blocked      → 200 { blocked: [{ user_id, username, display_name, blocked_at }] }
```

**Auth:** `Authorization: Bearer {hs_token}`

**Effects (downstream behaviour):**
- Blocked user's posts hidden from blocker in `/api/messages` queries (filter at SQL level — `WHERE author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)`).
- DMs from blocked user dropped at `POST /api/dm` time → return 403 "blocked".
- Mentions of blocker by blocked user silenced (don't insert into `mentions` table).
- Heat given by blocked user to blocker's posts doesn't count (filter on aggregate).
- Blocked user not surfaced in blocker's discover/leaderboard/trending.

**Schema:**
```sql
CREATE TABLE user_blocks (
  blocker_id   bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id   bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX ON user_blocks (blocked_id);  -- for "who blocks me" reverse lookup
```

**Errors:**
- `400 self-block` — blocker_id == blocked_id
- `404 user not found`
- `400 already blocked` — idempotent for clients (extension treats as success, like follow does)
- `400 not blocked` — same

**Side-effect:** if blocker was following blocked user, auto-unfollow on block.

**Extension wiring** (~10 min once endpoint exists):
- Profile card actions list: add `[b] block` / `[b] unblock` action keyed off `data.relationship.youBlock` field.
- `data.relationship` returned by `/api/profile/{name}` should include `youBlock: bool`.
- Optimistic UI + rollback pattern (same as follow).

---

## 2. Import Twitch follows — **HIGHEST USER VALUE, MEDIUM SERVER WORK**

Solves the cold-start problem: user installs extension, has zero heatsync follows, gets zero live notifications. Most users have 50-500 Twitch follows already. One-click import bridges them.

**Endpoint:**
```
POST /api/import/twitch-follows
  → 200 { imported: N, skipped: M, total_twitch: T, total_matched_on_hs: H }
  → 403 { error: 'twitch_scope_missing', reauth_url: '...' }
```

**Auth:** Bearer hs token. Server uses stored Twitch OAuth token to call Twitch Helix.

**Twitch OAuth scope upgrade required:**
- Add `user:read:follows` to heatsync's Twitch app scopes
- Existing users need to re-auth once (server detects missing scope, returns reauth_url)

**Server flow:**
1. Resolve heatsync user → their stored Twitch OAuth token + twitch_user_id
2. If no token or scope missing: return `403 twitch_scope_missing` with re-auth URL
3. Paginate `GET https://api.twitch.tv/helix/channels/followed?user_id={id}&first=100` (cursor-based)
4. Collect all `broadcaster_id` values
5. Look up which of those exist in heatsync `users.twitch_user_id` column
6. Bulk-insert into `follows(follower_id, followed_id, source='twitch_import', created_at=now())` with `ON CONFLICT DO NOTHING`
7. Return counts

**Edge cases:**
- User with 5000 Twitch follows → server batches inserts in chunks of 500
- Twitch returns 401 → token expired → return 403 with reauth URL
- Heatsync user has many twitch follows but few are on heatsync → fine, skipped count documents the gap
- Re-running: idempotent due to PK on follows; only NEW twitch follows since last run get added
- Rate limit: Twitch Helix is 800 req/min per app. With 100 follows per page, 5000 follows = 50 pages = trivial.

**`source` column on follows table** lets us distinguish imports from manual follows for analytics ("X% of follows came via Twitch import").

**Extension wiring:**
- Button in popup or options page: `Import follows from Twitch`
- On click: POST to endpoint, show progress / counts
- On 403 reauth: open the reauth URL in new tab, instruct user to retry after completing Twitch consent

---

## 3. Twitch block / unblock proxy — **MEDIUM ROI**

Extension can't safely write to Twitch directly (would need user's Twitch token in extension context). Server proxies.

**Endpoints:**
```
POST   /api/twitch/block/{twitchUserId}    → 200 { ok: true }
DELETE /api/twitch/block/{twitchUserId}    → 200 { ok: true }
GET    /api/twitch/blocks                  → 200 { blocks: [{ user_id, login, display_name, blocked_at }] }
```

**Twitch scope upgrade:** add `user:manage:blocked_users` to OAuth.

**Server flow:**
- `PUT https://api.twitch.tv/helix/users/blocks?target_user_id={twitchUserId}`
- `DELETE` same path
- `GET https://api.twitch.tv/helix/users/blocks?broadcaster_id={ownId}`

**Pairing with heatsync block (#1):** consider auto-syncing — when user blocks on heatsync, also block on Twitch if they're linked. Optional toggle in user settings: `Block on linked platforms when I block on heatsync`.

**Errors:** 401 token expired → 403 with reauth URL.

**Extension wiring:** profile card `[b] block` action could trigger BOTH heatsync + Twitch block in one call (server-side combined endpoint, or sequential client-side calls).

---

## 4. WebSocket live-status push — **PERFORMANCE OPTIMIZATION**

Extension currently polls `/api/live/following` every 60s in background. Replace with WS push for instant transitions.

**WS message types** (added to existing heatsync WS protocol):
```
{ type: 'live_status', user_id, platform, is_live, viewer_count, started_at }
```

Server emits when twitch_is_live or kick_is_live changes for any user that any other user follows. Existing WS clients filter to messages for users they follow.

**Server work:**
- EventSub subscription per linked Twitch user (or use existing live-status detection)
- Already-existing live-status detection mechanism feeds into WS broadcaster
- Per-client subscription model (subscribe to follows only)

**Extension wiring:**
- Background subscribes via existing WS on auth
- On `live_status` event, update `_liveStatusState` + `_liveFollowedSnapshot`, fire notification if off→on transition
- Drop the 1-min `live-poll` alarm
- Net: instant transitions, ~0 polling traffic

**Pricing:** WS messages cheaper than 60s polling × N users. Probably a wash overall, but latency improves from 0-60s → <1s.

---

## 5. EventSub webhook for follow sync — **NICE TO HAVE, LOW PRIORITY**

When user follows/unfollows on Twitch (not via heatsync import), mirror to heatsync follows.

Requires:
- Server subscribes to `channel.follow` EventSub events for each heatsync user's twitch_user_id (read scope)
- Webhook receiver matches twitch_user_id → heatsync user_id, inserts into follows
- Same for unfollow (Twitch doesn't have unfollow event; would need periodic diff)

**Truthfully:** import-once (#2) covers 95% of user value. Ongoing sync is for the very small population of users who actively manage Twitch follows day-to-day after onboarding. Defer until import data shows demand.

---

## Implementation order (recommended)

| Priority | Item | Effort | User-facing payoff |
|---|---|---|---|
| P0 | #1 heatsync block | small | completes social graph; basic moderation |
| P0 | #2 Twitch follow import | medium (scope + endpoint) | killer onboarding flow |
| P1 | #3 Twitch block proxy | small (after #1) | unifies block across platforms |
| P2 | #4 WS live push | medium | latency improvement, polling elimination |
| P3 | #5 EventSub follow sync | medium-large | edge-case ongoing sync |

P0 items are the immediate value adds. P2/P3 are optimizations after the foundation is solid.

---

## Coordination notes

- Extension is at `~/projects/heatsync-extension` (public repo).
- Extension auth uses bearer token from heatsync session cookie via `chrome.cookies.get` → forwarded as `Authorization: Bearer …`.
- Existing `/api/follow/{userId}` POST/DELETE pattern is the template for #1.
- Existing `/api/user/following` is the template for `GET /api/user/blocked`.
- `/api/profile/{name}` should be extended to include `relationship.youBlock` once #1 ships, mirroring `relationship.youFollow`.
- Profile card and tooltip both call `/api/profile/{name}` — adding `youBlock` makes both UIs auto-aware.
