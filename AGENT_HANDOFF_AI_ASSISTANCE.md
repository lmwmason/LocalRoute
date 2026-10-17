# AI assistance handoff

Implemented 2026-10-17. This commit contains only the new `server/ai-assistance/**`, `shared/ai-assistance.ts`, `src/ai-assistance/**`, associated tests/fixtures and this handoff. It does not edit App, server assembly/config/repository, ContributionForm, Admin, QA_REPORT, environment or dependencies. Other work is present in the shared checkout and is excluded from this commit. No live Gemini/provider calls, remote DB operations or deployment were performed.

## What is provided

- `createAssistanceModel` reuses the existing **unchanged** `server/gemini.ts` class, including its JSON schema, finish-reason and budget enforcement. Its dedicated fetch transport converts the menu envelope into a real Gemini `inlineData` image Part. Passing a menu image to an ordinary text-only `new Gemini(...)` instance is insufficient; use this factory for menu extraction.
- `createAiAssistance` authenticates every operation with the existing repository, checks server-owned moderator/admin roles for review, enforces global/per-user budgets and concurrency, and returns typed failure states. It never accepts an actor, role, review body, contact information or LP balance from the client.
- `attachAiAssistance` exports isolated Express endpoints, ready to mount before the existing `/api` 404 handler. No routes are mounted by this commit.
- `MenuPhotoAssistant` provides optional upload, explicit Google Gemini/privacy consent, loading/errors, manual entry/skip and editable Korean/English confirmation. `MenuExtractionPreview` can also be used independently. Neither persists or publishes anything. The parent receives a confirmed draft through `onConfirm`.
- `ContributionReviewAid` displays evidence, uncertainty and a suggested **human** review action. It contains no approve/ban/LP buttons or action calls.
- `createAiAssistanceClient` makes same-origin requests and validates typed responses, including HTTP failure responses. Do not use the current generic `src/api.ts` request helper for these routes: that helper discards the typed assistance failure on non-2xx responses.

## Exact server connection

Main agent should add the following imports/composition **inside `createApp`, before `app.use("/api", ...)`**, after existing security middleware. This is an integration recipe, not an edit made here:

```ts
import { createAiAssistance, createAssistanceModel, attachAiAssistance } from "./ai-assistance";

if (repository) {
  const enabled = config.live && config.database && Boolean(config.geminiKey)
    && (config.menuExtraction || config.moderation);
  const assistance = createAiAssistance({
    repository,
    enabled,
    menuEnabled: config.menuExtraction,
    reviewEnabled: config.moderation,
    model: enabled ? createAssistanceModel({
      key: config.geminiKey,
      model: config.geminiModel,
      budget: config.aiBudget,
      timeoutMs: 15_000,
    }) : undefined,
    maxCalls: enabled ? config.aiBudget : 0,
    perUserCalls: 3,
    timeoutMs: 15_000,
    maxConcurrent: 2,
  });
  attachAiAssistance(app, assistance);
}
```

Keep a single assistance instance per server process; do not construct it per request. Existing config fields already read `FEATURE_GEMINI_MENU_EXTRACTION`, `FEATURE_GEMINI_MODERATION`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_REQUESTS_PER_HOUR`. Use the existing root `.env` only and keep flags disabled until intentional activation; never put the key in a VITE variable. The module itself reads no environment. Without a repository, leave both health capabilities false and offer manual/skip UI. With a repository but missing key/disabled flags, endpoints return `disabled` after authentication. Health capabilities currently remain unchanged by this commit and must reflect actual configured capability during integration.

Both `enabled` and `maxCalls` default to **false/zero**. Per-feature gates default to true under that explicit master gate, so pass the two existing config flags individually as shown. No live calls occur by importing or constructing a disabled service. `repository.authenticate` already uses Supabase Auth `getUser(token)`, checks non-anonymous confirmed email, and reads `user_roles` on the server. Reuse that method; do not substitute user metadata/JWT role values or trust a client-selected user ID.

Endpoints:

| Method/path | Input | Permission/output |
| --- | --- | --- |
| POST `/api/ai-assistance/menu` | Raw JPEG/PNG/WebP bytes, `Authorization: Bearer ...`, `X-Menu-Options: JSON.stringify({language, privacyConfirmed:true, redactions:[]})` | Verified account; `MenuAssistanceResult` |
| POST `/api/ai-assistance/review` | JSON `{id,kind,language}`, bearer token | Moderator/admin only; `ReviewAssistanceResult` |

Menu options header is bounded at 8KB and strictly validated. Review kinds are the existing queue kinds. Review text is loaded from `repository.community(actor, "queue", null, {})` and matched by **both ID and kind**. Missing entries return `not_found`; client-supplied body/evidence/role fields are rejected. Repository calls from review assistance are queue reads only, never `decide` or reward actions.

Responses use `Cache-Control: no-store`, typed status/failure codes, safe HTTP status and optional Retry-After. Unauthorized=401, forbidden=403, absent queue item=404, invalid input=400, photo format/decode failure=415, oversize=413, budget/busy=429, timeout=504, unavailable=503, invalid model output=502. Exceptions, raw provider bodies and keys are not returned or logged. Upload/body parsing is bounded even before service authorization; expensive image decoding and model calls occur after authentication.

## Exact frontend connection

Create a client using the existing session for **token transport only**; all authorization stays on the server:

```tsx
import { supabase } from "./supabase"; // adjust relative path at call site
import { createAiAssistanceClient } from "./ai-assistance/client";
import { MenuPhotoAssistant } from "./ai-assistance/MenuPhotoAssistant";
import { ContributionReviewAid } from "./ai-assistance/ContributionReviewAid";

const ai = createAiAssistanceClient({
  token: async () => (await supabase?.auth.getSession())?.data.session?.access_token ?? null,
});

// ContributionForm: separate from the REQUIRED actual-place photograph.
<MenuPhotoAssistant
  language={language}
  onExtract={(file, options) => ai.extractMenu(file, options)}
  onConfirm={draft => setMenuDraft(draft)}
  onSkip={() => { setMenuDraft(null); setShowMenuAssistant(false); }}
/>

// Admin: on an explicit "request review aid" action, with stale-selection guard:
const result = await ai.assessContribution({ id: selected.id, kind: selected.kind, language });
// Apply result only if selected ID/kind is still the requested item.
<ContributionReviewAid result={result} loading={loadingAid} language={language} />
```

The `setMenuDraft`, `setShowMenuAssistant`, selected-item result state and UI trigger above are parent integration state, not existing functions this commit claims to add. Keep contribution identity, actual-place photo, recommendation text and normal submit usable if menu extraction fails or is skipped. Do not require menu data in contribution validation. Gate only the AI action when unavailable; manual entry/skip remain usable.

`onConfirm` receives `ConfirmedMenu`: `{items:[{name,price,currency}],confirmed:true,source:"user_confirmed_draft"}`. Blank price/currency are null, never zero/default KRW. Validate with `confirmedMenuSchema` again at any future persistence boundary. This callback confirms a local draft; it does not save menu facts to a database. The current contribution schema/storage path has no menu-draft persistence. Adding private versioned menu facts, observation date/photo reference, human review and authorization is a **separate integration task**; do not append unknown menu fields to the existing contribution RPC, overwrite canonical facts, auto-publish or claim a server save succeeded. Metadata includes model/prompt version/time for a future minimal outcome record; never store raw image data, tokens, contact data or a full model prompt in audit records.

## Evidence and limits

Menu schema is limited to visible names, a literal visible price token, numeric price or null, literal printed currency or null, qualitative confidence, uncertainty codes and unreadable image regions. Server checks that names/currency/price tokens occur in the supplied visible-row evidence and that numbers match the literal price token. Ambiguous prices stay null; missing currencies are not inferred from Korea/location. Exact duplicate rows are removed. These checks cannot independently prove model OCR accuracy: visibleText is model-supplied evidence, and user comparison/correction is mandatory. No hours, venue identity, URLs, generated venue images or hidden menu facts are accepted.

Review output allows only `human_review`/`request_clarification`, categorical signals, exact excerpts with `title`/`body` references, and explicit uncertainty. Invented citations and extra fields such as ban/publish/LP/probabilities are rejected. Deterministic instruction-like input checks avoid a model call and return a human-review suggestion; they do not block an honest contribution. No model tools, URL following, actions or autonomous decision path exist. The review assist analyzes **text evidence**, not the authenticity/content of a required venue photograph.

Photos are capped at 5MiB; decoded JPEG/PNG/WebP, single image, max 20M input pixels and at least 320px per side. Existing `preparePlacePhoto` is reused to strip EXIF, orient and resize to max 1600px. Optional normalized redaction rectangles are applied server-side after orientation/resize and before external transmission. `left/top/width/height` are fractions of that normalized image; invalid/out-of-bounds rectangles are rejected. The default UI asks the contributor to crop/remove private details before selecting a file; it does not claim automatic face/name detection or provide an image editor. The API accepts additional redaction rectangles from a future editor.

Common emails, phones, URLs and recognizable credential patterns in review text are redacted before model input. Returned text is screened again. This conservative screening is not comprehensive PII recognition: names/faces/arbitrary private text cannot be reliably recognized by regex. Keep the crop/privacy-consent requirement, minimize fields, retain admin-only access, and do not represent this module as certified automatic redaction. Images remain transient in request/model-processing memory; no external Files API uploads, storage bucket, file URLs, background photo retention or logging are introduced.

Budgets include failed/invalid-photo attempts, and both features share the instance's global/per-user request limits. Limits default to zero global calls, 3 requests/user/hour and max 2 active operations. The existing Gemini client's own budget/concurrency remains an additional bound. There are no automatic retries or hidden repair model calls. The service deadline includes image preparation and response validation; expired preprocessing cannot start a later model call. An uncooperative model retains its concurrency slot until settling, so repeated client timeouts cannot open unlimited model calls. The vision transport uses an abort signal and refuses redirects. Budgets are process-local and reset on restart; multi-worker deployment requires a shared account budget and ingress rate/body limits. This module never issues/debits LP.

## Verification and references

- Related server/client/browser tests: **57 passed** across three files in the final bounded-worker whole-suite run. All model HTTP calls and callbacks are mocked. Includes visible/unknown items, malformed/oversize/spoofed images, EXIF/redaction, 401/403, server-only evidence, injected instructions/unsafe outputs, fake citations, PII screening, timeout/budget/concurrency, malformed/truncated model responses, actual inlineData transport and same-origin client validation. A partial numeric token (12 from 12,000) cannot satisfy visible-price validation.
- Interactive Chromium fixtures at **360px, 390px and 1440px**, Korean/English, reduced motion, touch and keyboard: editing resets confirmation, blanks remain null, errors allow manual/skip, late extraction does not overwrite a skipped/manual draft, rejected confirmation does not show success, no overflow and accessible primary control heights. These are isolated component tests, not a claim that forbidden parent files have been integrated.
- Earlier whole-checkout unit suite: **24 files / 234 tests passed**, before the final client tests and partial-price regression were added. Overlapping full/targeted runs later hit browser and PGlite startup deadlines; these failures are not described as passes. Final `rtk npm test -- --maxWorkers=2`: **23 suites passed, 5 failed; 218 tests passed, 42 skipped, 260 total**. All assistance tests passed. The five remaining failures are 10-second PGlite `beforeAll` timeouts in `booking`, `database`, `legal-database`, `local-contributions` and `sharing`; none of those suites/files was changed here. More tests were concurrently added by other owners, explaining the larger final inventory. Do not claim the final entire checkout suite passed.
- Whole checkout lint/typecheck/build passed earlier in this turn; build emitted an existing >500KB chunk-size advisory. The **latest** whole-checkout typecheck then failed in concurrently added `tests/release-security-database.test.ts:414` (an Itinerary cast has `evaluation` without required `checks`); that file is outside this task and was not modified. A fresh strict scoped TypeScript check of every assistance module, component, client and test passed using `tsc --ignoreConfig` with the project's compiler options, and scoped ESLint/Prettier passed. Do not claim the latest whole-checkout typecheck/build is green until the other owner fixes that test. Build/test artifacts are ignored and not committed.
- No DB schema changes/RLS surface added. Existing database tests run against disposable in-memory fixtures. Hosted authorization/storage settings and live Gemini OCR accuracy are not verified by mocks.

Read AGENTS.md/PRD.md/QA_REPORT.md and the applicable [Supabase skill](/home/just_grassy/.agents/skills/supabase/SKILL.md). Verified the existing server Auth flow against [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser) and reviewed the current [changelog](https://supabase.com/changelog.md); no SDK/schema/auth changes were made. Vision transport follows Google's [image understanding documentation](https://ai.google.dev/gemini-api/docs/image-understanding), [generateContent Part/Blob reference](https://ai.google.dev/api/generate-content), and [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output). Existing Gemini implementation remains unchanged.
