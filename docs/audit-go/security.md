# Security Audit — Go rewrite (mktorder_com)

Scope: go/internal/httpapi, go/internal/store, go/internal/webull, go/internal/providers,
go/internal/live, go/web/js/{app.js,api.js,charts.js}. Comparison baseline: server/src (Node).
Explicitly excluded (already audited): auth/sessions/cookies, Caddy/nginx security headers,
rate limiting, body-size limits, HTTP timeouts, recover(), GET /api/settings key leak, docker-compose env.

Read-only review. No code changed, nothing executed against a live target.

---

### [CRITICAL] Data-provider API keys leak to the browser on network-level failures

- **Где:** `go/internal/providers/client.go` — `alphaHistory` (:184-186), `finnhubHistory` (:249-250),
  `finnhubQuote` (:280-281), `twelveHistory` (:312-313), `polygonHistory` (:349-351),
  `GlobalQuotePrice` (:137-139), `TwelvePrice` (:165-166), all via the shared `c.get(rawURL)` (:73-84).
  Surfaces at `go/internal/httpapi/server.go`: `writeProviderError` (:1117-1127, used by `handleQuote`,
  `handleYahooFinance`, `handleFetchProvider`, `handleWebullBatch`) and directly in
  `handleTestAlpha`/`handleTestFinnhub`/`handleTestTwelve`/`handleTestProvider` (:1027-1075+), which do
  `writeJSON(w, 200, map[string]any{"success": false, "error": err.Error()})`.
- **Проблема:** Every provider request URL is built with the API key embedded in the query string
  (e.g. `alphaHistory`: `...&apikey=%s` via `url.QueryEscape(c.AlphaKey)`; same pattern for Finnhub
  `token=`, Twelve Data `apikey=`, Polygon `apikey=`). `c.get()` calls `c.HTTP.Do(req)` and returns
  the raw Go error unwrapped on any transport-level failure (DNS failure, connection refused, TLS
  failure, timeout, etc.) — `return 0, nil, err`. Go's `net/http` wraps such failures in a `*url.Error`
  whose `Error()` string is literally `"Get \"<full URL>\": <cause>"`, i.e. it contains the full
  request URL **including the api key**. None of `alphaHistory`/`finnhubHistory`/`finnhubQuote`/
  `twelveHistory`/`polygonHistory`/`GlobalQuotePrice`/`TwelvePrice` wrap this error into a sanitized
  `*providers.HTTPError` — they just `return X, err`. That raw error then reaches
  `writeProviderError`, which for anything that isn't `*providers.HTTPError` does
  `writeJSON(w, 500, map[string]any{"error": err.Error()})` — i.e. ships the provider API key straight
  into the JSON response body, which the SPA then surfaces to the user (`api.js` throws
  `new Error(data.error)`, `app.js` shows it via `toast(err.message)` / `out.textContent = err.message`).
  The "test provider" buttons in Settings (`handleTestAlpha/Finnhub/Twelve/handleTestProvider`) hit the
  exact same unwrapped-error path and are the most likely place an admin triggers this
  (misconfigured `*_BASE` env var, transient DNS hiccup, provider outage/timeout all qualify —
  none of this requires the attacker to control anything, just requires the outbound call to fail
  at the transport level instead of returning a normal HTTP status).
- **Как эксплуатируется:** No exploitation needed beyond normal operation: any time an outbound
  call to Alpha Vantage / Finnhub / Twelve Data / Polygon fails at the TCP/TLS/DNS layer (provider
  outage, network blip, firewall block, wrong base URL after a config typo, or the provider taking
  >30s so the client times out), the resulting JSON error response — visible to anyone with access
  to that endpoint/browser session, and logged by any client-side error logger or browser devtools —
  contains the corresponding provider API key in cleartext. An attacker who can nudge a provider
  request into failing (e.g. by exhausting the free-tier rate limit until the provider starts
  returning connection resets, or simply by waiting for a routine outage) can harvest the key from
  the error text.
- **Было в Node:** Not present. Node's provider clients (`server/src/providers/alphaVantage.js`,
  `finnhub.js`, `twelveData.js`, `polygon.js`) use `https.get(...).on('error', reject)`; Node's
  `http.ClientRequest` error objects (`ECONNREFUSED`, `ENOTFOUND`, etc.) do **not** embed the request
  URL/query string in `.message`, so the same failure class never leaked the key. The project's own
  `eba10a6 "Fix security scan findings"` commit shows this codebase has previously hardened exactly
  this class of leak for Webull raw logs (`redactSensitivePayload`/`sanitizeHeaders` added to
  `server/src/services/webullClient.js`) and for Polygon's `next_url` pagination (validated
  host/protocol before re-appending the key) — the Go port reintroduces an analogous leak via a
  different mechanism (Go's `*url.Error` string format) that the Node code never had.
- **Фикс:** In `providers/client.go`, wrap the error returned by `c.get()` at each call site into a
  sanitized `*HTTPError` (e.g. `&HTTPError{502, "provider request failed"}`) instead of propagating
  the raw `err`; or better, change `c.get()` itself to catch transport errors and return a generic
  `fmt.Errorf("request to %s failed", provider)` that never touches `rawURL`. Add a regression test
  (analogous to Node's `security-regression-check.js`) asserting that no response body from
  `/api/quote/*`, `/api/yahoo-finance/*`, `/api/fetch/*`, `/api/test-provider` ever contains any of
  the configured API key values.

---

### [INFORMATIONAL / no finding] XSS surface in go/web/js/app.js

Exhaustively reviewed all 36 `innerHTML` assignment sites and ~650 template-literal interpolations
in `app.js` (3341 lines), plus `api.js` and `charts.js`. Every place that renders server- or
user-controlled data into HTML consistently routes through `esc()` (`app.js:256`, standard
`&<>"'` entity escaping) — including: dataset names/tags/company names (`pageData`, ~:1140-1170),
tickers everywhere, `err.message`/API error bodies (`overlay()`/`toast()` at :983-1005 and the
error blocks at :1258, :1738, :1886), Webull `normalizePositions`/`normalizeOrders` output rendered
in the positions/orders/fills tables (:1735-1789 — every cell wrapped in `esc()`), autotrade/monitor
logs (:1888-1897, `esc(monitor)`/`esc(auto)`/`esc(raw)`), calendar holiday/short-day names
(:1511-1516), split events (:1163, :3215, :3274), monitor trade notes (:2627-2635), and settings
values. `state.modal` and `state.toast`/`state.error` (the three raw-`innerHTML`-inserted state
fields) are only ever assigned pre-escaped strings. No `insertAdjacentHTML`, `document.write`,
`eval(`, `new Function`, string-built `onclick=`/`onerror=` attributes, or unescaped `href`
built from dynamic data were found. `charts.js` never builds HTML strings at all. This matches the
recent commit history (`af12593`/`b8447b8`/`bd62be8` — "Fix the same nested-payload gaps
site-wide") which appears to have already closed this class of bug across the SPA. **No exploitable
gap found** — flagging as resolved rather than fabricating a finding, since the task specifically
asked not to invent issues that aren't backed by a concrete line.

---

### [INFORMATIONAL / no finding] Path traversal

- `serveWeb` (`go/internal/httpapi/server.go:1180-1206`): `full := filepath.Join(s.WebDir,
  filepath.Clean(p))` where `p := r.URL.Path` is always an absolute path (`net/http` decodes and
  normalizes the path before the handler sees it, and Go's `filepath.Clean` collapses `..` segments
  that would go above `/` when the input is itself absolute, e.g. `Clean("/../../etc/passwd")`
  resolves to `/etc/passwd`, not something escaping the join). The extra `strings.HasPrefix(full,
  s.WebDir)` check is redundant defense-in-depth but the underlying Clean+Join pattern is the
  standard safe idiom already. No traversal possible.
- `handleCreateDataset` multipart upload (`server.go:388-410`): the uploaded file is read fully into
  memory via `io.ReadAll(f)` and parsed as JSON — no filename from the multipart form is ever used to
  construct a filesystem path, so there's no attacker-controlled filename reaching disk.
- All dataset/splits/trades lookups key off `store.SafeTicker()` (regex `[^A-Za-z0-9.-]` stripped,
  10-char cap, uppercased) or numeric IDs bound as SQL parameters — never raw path/file operations.

---

### [INFORMATIONAL / no finding] SSRF

- `/api/fetch/{provider}/{symbol}`, `/api/quote/{symbol}`, `/api/yahoo-finance/{symbol}`,
  `/api/quotes/webull-batch`, `/api/test-provider` all end up calling `providers.Client.Quote()` /
  `.Historical()`, both of which `switch` on the `provider` string over a **fixed, hardcoded set of
  cases** (`"finnhub"`, `"webull"`, `"alpha_vantage"`, `"twelve_data"`, `"polygon"`) with an explicit
  `default: return ..., &HTTPError{400, "Unknown provider"}`. An unrecognized provider value is
  rejected before any network call is made — this whitelist lives inside the provider client itself,
  so it's enforced regardless of whether a given HTTP handler pre-validates `provider` (e.g.
  `handleYahooFinance` doesn't have its own allowlist, but it doesn't need one).
- Each provider's base host (`AlphaBase`, `FinnhubBase`, `TwelveBase`, `PolygonBase`) is a **fixed
  constant** sourced only from server-side env vars at process start (`envOr(...)`), never from
  request input — there is no way for a request to redirect a provider call to an arbitrary host.
- `symbol` is always passed through `store.SafeTicker()` before being placed in a URL (via
  `url.QueryEscape`/`url.PathEscape`), so it can't inject `://`, `@`, or additional query params.
- `handleWebullBatch` (`server.go:905-933`) caps the symbol list at 50 (`if len(symbols) > 50 {
  ... "Too many symbols (max 50)" }`), bounding fan-out amplification against the upstream provider.

---

### [INFORMATIONAL / no finding] SQL injection

- Every query in `go/internal/store/db.go` and `live_persist.go` uses `?` placeholders with the
  values passed as `Exec`/`Query` args — no `fmt.Sprintf` interpolation of user data into SQL text
  anywhere in either file.
- The one place table names are string-concatenated into SQL — `ListTrades`, `GetTrade`,
  `InsertTrade`, `PatchTrade`, `DeleteTrade` (`db.go:695-880`, pattern: `` `SELECT ... FROM `+table+`
  WHERE ...` ``) — is guarded by an explicit whitelist at the top of every one of these functions:
  `if table != "trades" && table != "broker_trades" { table = "trades" }`. Checked every call site
  in `go/internal/httpapi/server.go` (:835-901) and tests: `table` is always the Go string literal
  `"trades"` or `"broker_trades"`, never derived from `r.PathValue`/query/body. Not injectable.

---

### [MEDIUM] `limit` on `/api/autotrade/logs` has no upper bound

- **Где:** `go/internal/httpapi/live_handlers.go:153-155` (`handleAutoLogs`):
  `limit, _ := strconv.Atoi(r.URL.Query().Get("limit")); writeJSON(w, 200, s.liveEng().Logs(limit))`
  → `go/internal/store/live_persist.go:74-77` (`ListAutotradeLogs`): `if limit <= 0 { limit = 200 }`,
  then `SELECT ts, message FROM autotrade_logs ORDER BY id DESC LIMIT ?` with the raw value.
- **Проблема:** Only a floor is enforced (non-positive values fall back to 200); there is no ceiling.
  `?limit=100000000` is passed straight through to SQLite's `LIMIT`.
- **Как эксплуатируется:** A caller can request the entire `autotrade_logs` table in a single
  response instead of the intended bounded page — amplifies response size/DB read cost per request
  and increases exposure if log lines ever contain sensitive operational detail (order IDs, account
  status, error text from the broker). Not a crash/overflow risk (SQLite just returns however many
  rows exist), but it is exactly the "million rows" amplification the endpoint should prevent.
- **Было в Node:** N/A — not specifically checked in Node's equivalent trade-history endpoints (out of
  the requested Go-focused scope), but Go here has no defense at all: worth capping regardless of
  parity.
- **Фикс:** Clamp: `if limit <= 0 { limit = 200 } else if limit > 500 { limit = 500 }` (or whatever
  the UI actually needs — the SPA log viewer only ever reads pending/recent tracked orders capped at
  20, and the "logs" tab shows a scrollable `<pre>`, so 500-1000 is generous headroom).

---

### [LOW] Negative split factor accepted at write time (inert, but should be rejected)

- **Где:** `go/internal/httpapi/helpers.go:77-86` (`toSplits`, used by `handlePutSplits` /
  `handlePatchSplits`, `server.go:609-620`): `factor, _ := e["factor"].(float64); if date == "" ||
  factor == 0 { continue }` — only rejects exactly `0`, not negative values.
- **Проблема:** `PUT/PATCH /api/splits/{symbol}` with `{"date": "...", "factor": -2}` is accepted and
  persisted to the `splits` table.
- **Как эксплуатируется:** Not actually exploitable for price corruption: the bar-adjustment path
  (`go/internal/splits/splits.go:15-19`, `normalize()`) independently filters
  `!isFinite(s.Factor) || s.Factor <= 0 || s.Factor == 1` before any cumulative-factor math runs, so a
  stored negative factor never reaches `cumulative *= event.Factor`. The only visible effect is a
  dead/nonsensical row sitting in the Splits UI (`SplitsTab`) that silently does nothing when
  "applied," which is confusing but not a security issue.
- **Было в Node:** not compared (out of stated scope); noting for consistency since it's a one-line
  fix.
- **Фикс:** `if date == "" || factor <= 0 { continue }` in `toSplits`, matching the same guard already
  used in `splits.normalize()`.

---

### [LOW] Webull bearer token stored in cleartext; DB file world/group-readable

- **Где:** `go/internal/store/live_persist.go:57-67` (`SaveWebullToken`) writes the raw token string
  into `webull_token.token` with no encryption/hashing. `go/data/trading.db` is `-rw-r--r--` (644) and
  `go/data/` is `drwxr-xr-x` (755) on this host.
- **Проблема:** Any local account on the host (or anything with read access to `go/data/`, e.g. a
  misconfigured backup job or a second process running as a different user) can read the live-trading
  Webull bearer token directly from the SQLite file, bypassing the app entirely.
- **Как эксплуатируется:** Requires local file-system access rather than a network vector — this is a
  defense-in-depth gap, not a remotely triggerable bug. Relevant mainly if the host is ever shared,
  or if deployment/backup tooling copies `go/data/trading.db` somewhere less restrictive.
- **Было в Node:** Same — Node's `webullToken.js`/`server/src/db.js` store the token in the same
  plaintext column in the same SQLite schema. This is **not a Go-introduced regression**, it's an
  existing project pattern; flagging per the audit checklist item but it's unchanged behavior, not a
  new gap.
- **Фикс (optional hardening):** `chmod 600` the DB file / `chmod 700` the data dir at startup (or via
  deploy script), and/or encrypt the `token` column at rest with a key from the environment. Lower
  priority than the CRITICAL finding above.

---

### [MEDIUM] Go container image runs as root

- **Где:** `docker/go.Dockerfile` — final stage (`FROM debian:bookworm-slim`) never creates or
  switches to a non-root user; there is no `USER` directive, so `CMD ["/app/mktorder"]` runs as root
  inside the container.
- **Проблема:** Standard container-hardening gap: any RCE/file-write primitive found in the app or a
  dependency would run with root privileges inside the container (able to write anywhere in the
  container filesystem, install packages, etc.), rather than being confined to an unprivileged user.
- **Как эксплуатируется:** Not directly exploitable on its own; it's a severity multiplier for any
  other vulnerability (e.g. a future path-traversal write or dependency RCE) rather than a
  standalone bug.
- **Было в Node:** Not checked (Node Dockerfile out of the requested Go-focused scope), noting only
  for the Go image per the task's explicit ask.
- **Фикс:** Add a non-root user in the final stage, e.g.:
  ```
  RUN useradd -r -u 10001 -g root appuser
  USER appuser
  ```
  and ensure `/app` and the mounted `/data` volume are writable by that UID.

---

### [INFORMATIONAL / no finding] TLS certificate verification

- Grepped all of `go/internal` for `InsecureSkipVerify`, custom `tls.Config`, and custom
  `http.Transport` — none found. `providers.Client` and `webull.Client` both use the zero-value
  `*http.Client{Timeout: ...}`, which uses Go's default `http.DefaultTransport` semantics (full
  certificate verification, no custom `RootCAs` override). TLS verification is not weakened anywhere
  in the Go codebase.

---

### [INFORMATIONAL / no finding] Webull request signing — Go vs Node parity

- **Go:** `go/internal/webull/sign.go` (`BuildSignature`) — merges query+headers-to-sign into a map,
  sorts keys, joins as `k=v&k=v...`, forms `str3 = path + "&" + str1 (+ "&" + MD5(body)_upper if body
  non-empty)`, percent-encodes `str3` with a custom `encodeURIComponent`, then
  `HMAC-SHA1(appSecret+"&", encoded str3)`, base64-encoded.
- **Node:** `server/src/services/webullClient.js:165-196` (`buildSignature`) — identical merge/sort/
  join, identical `str3` construction (`path&str1&MD5(body)` iff body present, else `path&str1`),
  identical `encodeURIComponent` + `HMAC-SHA1(appSecret+"&", ...)` → base64.
- **Nonce/timestamp:** Go uses `uuid.NewString()` (dashes stripped) + `time.Now().UTC().Format(...)`
  for `x-signature-nonce`/`x-timestamp` (`go/internal/webull/client.go:83-91`); Node uses
  `crypto.randomUUID()` + ISO timestamp (`webullClient.js:169-174`). Both are per-request random
  nonces with a fresh timestamp — no replay window introduced by either implementation; this app only
  produces outgoing signed requests to Webull, it never verifies an inbound signature from Webull, so
  constant-time comparison is not applicable here (nothing in this codebase compares a
  Webull-supplied signature against a locally computed one). **No algorithmic divergence, no
  regression found.**

---

### [INFORMATIONAL / no finding] Dependencies / build

- `go.mod`: `go 1.25.0`, dependencies are `google/uuid`, `modernc.org/sqlite` (pure-Go SQLite,
  no cgo — matches `CGO_ENABLED=0` in the Dockerfile), `golang.org/x/crypto`, `golang.org/x/sys`,
  `dustin/go-humanize`. All are widely used, actively maintained modules; nothing archived/abandoned
  or obviously outdated pinned at the time of this review.
- `go vet ./...` — clean, no output/warnings.
- `docker/go.Dockerfile` — genuinely multi-stage (`golang:1.25-bookworm AS build` → 
  `debian:bookworm-slim` runtime). Only `go.mod`/`go.sum` then `go/` source are copied into the build
  stage; only the compiled binary (`/out/mktorder`) and `go/web` static assets are copied into the
  final image — no `.env`, credentials, or Go source/tests end up in the shipped image. Root-user gap
  noted separately above (MEDIUM).
- `git log --all -S 'API_KEY'` / `-S 'SECRET'` — no real secret values found in history; hits are all
  either provider-integration feature commits (variable/env-var names) or the
  `security-regression-check.js` test script which uses an intentionally fake test password
  (`ADMIN_PASSWORD: 'secret'`) for a local, ephemeral test server. No CRITICAL secret-in-history
  finding.

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 1 |
| HIGH | 0 |
| MEDIUM | 2 |
| LOW | 2 |
| Informational (no finding, documented) | 7 |

### Top items
1. **[CRITICAL]** Provider API keys (Alpha Vantage/Finnhub/Twelve Data/Polygon) leak into JSON error
   responses whenever an outbound request fails at the transport level — `providers/client.go` +
   `writeProviderError`/`handleTestProvider*` in `httpapi/server.go`. Go-specific regression vs Node
   (different error-object shape). Fix: never propagate raw transport errors that were built from a
   URL containing the key.
2. **[MEDIUM]** `/api/autotrade/logs?limit=` has no upper bound — can pull the entire log table in one
   call.
3. **[MEDIUM]** Go Docker image runs as root — no `USER` directive in `docker/go.Dockerfile`.
4. **[LOW]** `toSplits` accepts negative split factors at write time (harmless — filtered out again
   before use in `splits.normalize()`, but should be rejected up front).
5. **[LOW]** Webull token stored in cleartext in SQLite; DB file is 644 / data dir 755 — unchanged
   from Node, worth tightening perms regardless.
6. **[No finding]** XSS in `app.js` — exhaustively reviewed, every dynamic-data render path is
   `esc()`-escaped; no exploitable gap found.
7. **[No finding]** Path traversal, SSRF, SQL injection, TLS verification, Webull signature algorithm
   parity — all reviewed and found sound (whitelisted table names, whitelisted providers, fixed base
   URLs, `SafeTicker` sanitization, standard Clean+Join static-file serving, no `InsecureSkipVerify`).
