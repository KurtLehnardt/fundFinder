# Grant Portal Field Map — Phase 1 Recon

## Honesty preamble

- **What the extension does:** fills form fields and navigates between sections/pages inside the founder's **own authenticated portal session**. A human — the organization's Authorized Organization Representative (AOR) — reviews the filled form and clicks the final submit button. **The extension never submits.**
- **What this recon is:** mapping of **public / reachable** pages only. No login was attempted with any credentials, no accounts were created, and no auth gate was bypassed. Where a flow is gated, this doc records **exactly where** the gate sits so a later **in-session** pass (a human logged into their own account, driving the extension in dev/debug mode) can capture the true field selectors.
- **Live-captured vs. Documented:** every row in every table below is marked either:
  - `Live-captured` — observed directly from a rendered page via browser automation (accessibility snapshot / DOM inspection), or
  - `Documented (not live-captured)` — derived from public page text/structure (via a text-rendering fetch, not a real DOM/accessibility inspection) or from well-known public documentation of a federal standard form.
- **Important limitation encountered during this recon pass:** the Playwright browser automation tools (`browser_navigate`, `browser_snapshot`, etc.) were **not available** in this environment — every call failed with `Extension connection timeout: Make sure the "Playwright MCP Bridge" extension is installed` (confirmed on 2 attempts against grants.gov). As a result, **no accessibility-tree snapshots and no real DOM `id`/`name`/`aria-*` attributes were captured for any portal in this pass.** All findings below come from a text-content fetch tool (renders page text/structure, not raw DOM attributes) plus well-known public documentation of the SF-424 form family. **Every selector in this document is a `TODO: in-session selector capture` placeholder — none is a verified, fabricated, or guessed `id`/`name` string.** This is a hard blocker for "robust selector" capture and should be re-run with working Playwright/browser tooling before the extension's field-map config is finalized.

---

## Recon method + reachability

Recon date: 2026-08-16.

| # | URL | Method | Result |
|---|---|---|---|
| 1 | `https://www.grants.gov/applicants/workspace-overview` | browser_navigate (Playwright) | **Blocked** — tool error, no browser session available |
| 2 | `https://www.grants.gov/applicants/workspace-overview` | Text-content fetch | Loaded. Public informational page, no login required to view. |
| 3 | `https://www.grants.gov/applicants/workspace-roles` | Text-content fetch | Loaded. Public informational page, no login required to view. |
| 4 | `https://www.grants.gov/forms` | Text-content fetch | Loaded. Public Forms Repository landing page. |
| 5 | `https://www.grants.gov/forms/sf-424-family` (guessed slug) | Text-content fetch | Loaded but resolved to a generic/empty page — **wrong URL slug**, not the true SF-424 family page. Not re-attempted (time-boxed). |
| 6 | `https://www.research.gov` | Text-content fetch | Loaded. Public landing page with nav to gated sub-apps. |
| 7 | `https://public.era.nih.gov/assist/` | Text-content fetch | Loaded. **This URL itself is the login screen** — no public content beyond the auth gate. |
| 8 | `https://www.sbir.gov` | Text-content fetch | Loaded. Public landing page. |
| 9 | `https://www.sbir.gov/topics` | Text-content fetch | Loaded. **Public, unauthenticated** topic/solicitation search form. |
| 10 | `https://legacy.www.sbir.gov/topics` | Text-content fetch | Failed — DNS error (bad guessed hostname), not the real domain. |

**Reachability summary:** Grants.gov informational/Forms-Repository pages, research.gov's landing page, and SBIR.gov's landing + topic-search pages are all publicly reachable. NIH ASSIST is fully gated at the first URL. Grants.gov's actual application-filling surface (Workspace) requires login and was not reached. No SF-424 *HTML* entry form (as opposed to the concept/PDF form) was found publicly reachable — Grants.gov's Forms Repository explicitly states its forms are "for information only and cannot be submitted with your application package"; the real fillable instance only exists inside an authenticated Workspace.

---

## 1. Grants.gov

### Reachable pages
- `/applicants/workspace-overview` — guidance on Workspace usage patterns (Basic / Intermediate / Advanced org setups, Custom Roles).
- `/applicants/workspace-roles` — general navigational/footer content; no live role-detail content rendered in this fetch pass.
- `/forms` — public Forms Repository: lists form families (**R&R Family**, **SF-424 Family**, **SF-424 Individual Family**, **SF-424 Mandatory Family**, **SF-424 Short Organization Family**, Post-Award Reporting Forms, Retired Forms). States forms here are for reference only.

### Field table

No applicant-facing *data-entry* fields (organization name, UEI, project title, etc.) are publicly reachable on grants.gov outside of the authenticated Workspace — the public pages are informational/navigational only. The table below captures the public elements actually observed.

| Field label | Element type | Robust selector | Maps to package key | Live-captured or Documented | Notes |
|---|---|---|---|---|---|
| Search (site search) | input (search) | TODO: in-session selector capture | — | Documented (not live-captured) | Header search box on all grants.gov pages; not an application field. |
| Login (nav link) | link/button | TODO: in-session selector capture | — | Documented (not live-captured) | Routes to Grants.gov account login; gate for Workspace. |
| Register (nav link) | link/button | TODO: in-session selector capture | — | Documented (not live-captured) | Account creation entry point, distinct from AOR/SAM.gov registration. |
| Session-timeout "Ok" | button | TODO: in-session selector capture | — | Documented (not live-captured) | Modal shown on active sessions; keeps session alive. |
| SF-424 Family (Forms Repository link) | link | TODO: in-session selector capture | — | Documented (not live-captured) | Points to the public reference copy of the SF-424 family; informational only, not fillable/submittable. |

**No applicant data-entry fields (organization info, UEI, project title, funding amounts, dates, AOR info, etc.) were reachable outside login.** Those only exist once a user is inside a specific opportunity's Workspace application package — see Auth-gated section below.

### Section navigation + step flow (Grants.gov)
Not directly observable — the public pages are single informational pages, not a multi-step wizard. Grants.gov's actual step flow (documented from general public knowledge of the product, not live-captured) is: **create/select Workspace → add applicant to package → complete each SF-424-family form as a "task" in the package → Check Package for errors → AOR-only "Sign & Submit."** Each form task within Workspace is understood to have its own Save / Validate / Next-task navigation, but the exact button labels/selectors were not observed and must be captured in an authenticated session.

---

## 2. Research.gov (NSF)

### Reachable pages
- `https://www.research.gov` — public landing page.

### Field table

| Field label | Element type | Robust selector | Maps to package key | Live-captured or Documented | Notes |
|---|---|---|---|---|---|
| (none — landing page is navigational only) | — | — | — | — | No form-entry fields on the public landing page; it is a set of links into gated sub-applications. |

### Navigation observed (public landing page only)
Section headers: **"Prepare & Submit Proposals"**, **"Reviews, Panels & Meetings"**, **"Awards & Reporting"**, **"Fellowships & Opportunities"**, **"Manage Financials"**, **"Administration"**.
Key links: **"Letters of Intent and Proposals"**, **"Check Proposal Status"** (→ `/gapps-web/gapps/searchResults`), **"Volunteer to Review"**, **"Project Reports"**, **"Graduate Research Fellowship Program (GRFP)"**.

No explicit "log in" wall text was rendered on the landing page itself, but the linked destinations (proposal prep, financials, status search) are understood to require an NSF `research.gov` account to actually load content — this could not be confirmed live since those sub-pages were not fetched in this time-boxed pass (they are one click deeper and were deprioritized in favor of covering all 5 targets). **TODO:** fetch/navigate into `Prepare & Submit Proposals` directly in a follow-up pass to confirm exactly where the gate triggers.

### Section navigation + step flow (Research.gov)
Not captured — proposal-prep flow lives behind the "Prepare & Submit Proposals" link, not reached in this pass.

---

## 3. NIH ASSIST

### Reachable pages
- `https://public.era.nih.gov/assist/` — **this is itself the login page.** There is no public content beyond the authentication gate at this URL.

### Field table

The only fields visible at this URL are the login form's own fields — not application-data fields, so none map to a package key.

| Field label | Element type | Robust selector | Maps to package key | Live-captured or Documented | Notes |
|---|---|---|---|---|---|
| eRA username | input (text) | TODO: in-session selector capture | — (N/A, login field) | Documented (not live-captured) | Part of the "Login with eRA Credentials" option. |
| eRA password | input (password), with show/hide toggle | TODO: in-session selector capture | — (N/A, login field) | Documented (not live-captured) | Same login block. |
| Federated Account (institution) | select/dropdown | TODO: in-session selector capture | — (N/A, login field) | Documented (not live-captured) | "Login with Federated Account" option — institutional SSO picker. |
| "Login with Login.gov" | button | TODO: in-session selector capture | — (N/A, login field) | Documented (not live-captured) | Redirects to Login.gov. |
| "Forgot Password/Unlock Account" | link | TODO: in-session selector capture | — | Documented (not live-captured) | External-user account recovery. |

Page text confirms: *"Active Grants.gov and eRA Commons credentials are required to prepare and submit applications using ASSIST"* and *"Your account is required to use two-factor authentication to access NIH/eRA systems."*

### Section navigation + step flow (NIH ASSIST)
**Not observable.** The entire proposal-prep UI (forms, sections, Next/Save/Submit controls) is 100% behind this login gate. This portal is **fully auth-gated** — nothing past the credential-entry screen is public.

---

## 4. SBIR.gov

### Reachable pages
- `https://www.sbir.gov` — public landing page (nav: About, Impact, Portfolio, Apply, Community; Register / Login links).
- `https://www.sbir.gov/topics` — **public, unauthenticated** funding-opportunity search form. This is the most substantive live public form found across all 5 targets.

### Field table

| Field label | Element type | Robust selector | Maps to package key | Live-captured or Documented | Notes |
|---|---|---|---|---|---|
| Keywords | input (text) | TODO: in-session selector capture | funding_opportunity_title (search-side match only, not a fill target) | Documented (not live-captured) | Free-text keyword search over topic titles. |
| Open Date From | input (date) | TODO: in-session selector capture | — | Documented (not live-captured) | Filter, not an application field. |
| Open Date To | input (date) | TODO: in-session selector capture | — | Documented (not live-captured) | Filter. |
| Close Date From | input (date) | TODO: in-session selector capture | — | Documented (not live-captured) | Filter. |
| Close Date To | input (date) | TODO: in-session selector capture | — | Documented (not live-captured) | Filter. |
| Status | select (Open / Closed) | TODO: in-session selector capture | — | Documented (not live-captured) | Open: 337 results, Closed: 22,338 results at capture time. |
| Agency | multi-select dropdown | TODO: in-session selector capture | awarding_agency (search-side match only) | Documented (not live-captured) | Lists DoD, NASA, NSF, EPA, etc. |
| Phase | select (Phase I / Phase II) | TODO: in-session selector capture | — | Documented (not live-captured) | Phase I: 335, Phase II: 2 at capture time. |
| Program | select (SBIR / STTR) | TODO: in-session selector capture | — | Documented (not live-captured) | SBIR: 327, STTR: 285 at capture time. |
| Funding Year | select dropdown (1984–2027) | TODO: in-session selector capture | — | Documented (not live-captured) | Wide historical range. |
| "Apply" (execute search) | button | TODO: in-session selector capture | — | Documented (not live-captured) | Note: this is the *search filter* apply button, unrelated to the extension's own "apply/fill" action — naming collision to be careful of in the field-map config. |
| "Reset" | button | TODO: in-session selector capture | — | Documented (not live-captured) | Clears filters. |
| Pagination ("Next", page numbers) | buttons/links | TODO: in-session selector capture | — | Documented (not live-captured) | Result-list paging. |
| Register (nav link) | link/button | TODO: in-session selector capture | — | Documented (not live-captured) | Company registration entry point — likely where organization_name / uei-style fields first appear, but the registration form itself was not fetched in this pass (time-boxed). |
| External User Login | button | TODO: in-session selector capture | — | Documented (not live-captured) | Page notes "SBIR.gov has transitioned to a new and more secure identity verification and login feature." |
| SBA Employee Login | button | TODO: in-session selector capture | — | Documented (not live-captured) | Separate internal-staff login path. |

### Section navigation + step flow (SBIR.gov)
Public topic search is a single-page filter/results flow (no multi-step wizard): set filters → **Apply** → paginate results with **Next**/page-number links → **Reset** to clear. The actual company-registration and application-submission flow (where organization/UEI/AOR-style fields would appear) sits behind **Register** → **External User Login** and was not reached in this pass — **TODO:** follow-up recon into the registration flow specifically.

---

## SF-424 canonical field table (backbone form)

The SF-424 ("Application for Federal Assistance") is the OMB-standard cover form shared, in whole or in relevant part, by nearly every Grants.gov application package (SF-424 Family, SF-424 Individual Family, SF-424 Mandatory Family, SF-424 Short Organization Family all derive from it). **This table is entirely `Documented (not live-captured)`** — it reflects the well-known public structure of the standard SF-424 form (boxes 1–21, per OMB 4040-0004) rather than a rendered instance of the form, since no fillable HTML/XFA instance was reachable without a Workspace login in this pass.

| SF-424 box # | Field label | Element type (typical) | Maps to package key | Live-captured or Documented | Notes |
|---|---|---|---|---|---|
| 1 | Type of Submission (Application / Preapplication / Changed-Corrected Application) | radio group | — | Documented (not live-captured) | Not one of the listed package keys; flow-control field. |
| 1 | Type of Application (New / Continuation / Revision) | radio group | — | Documented (not live-captured) | Flow-control field. |
| 2 | Date Received | input (date, often system-set) | — | Documented (not live-captured) | Usually system-populated on submit, not applicant-filled. |
| 4 | Applicant Identifier | input (text) | — | Documented (not live-captured) | Applicant's own internal tracking number, optional. |
| 5a/5b | Federal Entity Identifier / Federal Award Identifier | input (text) | funding_opportunity_number (related) | Documented (not live-captured) | 5b used for continuations/renewals of an existing award. |
| 8a | Legal Name (applicant organization) | input (text) | organization_name | Documented (not live-captured) | |
| 8b | Employer/Taxpayer Identification Number (EIN/TIN) | input (text) | — | Documented (not live-captured) | Not in the listed package-key set but commonly required alongside UEI. |
| 8c | Unique Entity Identifier (UEI) | input (text) | uei | Documented (not live-captured) | Replaced DUNS government-wide as of April 2022. |
| 8d | Address (street) | input (text) | applicant_street | Documented (not live-captured) | |
| 8d | Address (city) | input (text) | applicant_city | Documented (not live-captured) | |
| 8d | Address (state) | select/dropdown | applicant_state | Documented (not live-captured) | |
| 8d | Address (zip / postal code) | input (text) | applicant_zip | Documented (not live-captured) | |
| 8d | Address (county, country) | input/select | applicant_location (partial) | Documented (not live-captured) | County + country fields roll up into the broader `applicant_location` concept. |
| 8e | Organizational Unit (department/division) | input (text) | — | Documented (not live-captured) | Not in listed package-key set. |
| 8f | Name and contact information of person to be contacted (first/last name, title, org, phone, fax, email) | input group | authorized_representative_name (partial) | Documented (not live-captured) | Box 8f is the general applicant contact; Box 21's AOR signature block is the authoritative source for `authorized_representative_name`. |
| 9 | Type of Applicant (1–3; org classification) | select/radio | entity_type | Documented (not live-captured) | e.g. Nonprofit, State government, Small business, etc. |
| 10 | Name of Federal Agency | input (text, often pre-filled from opportunity) | awarding_agency | Documented (not live-captured) | |
| 11 | Catalog of Federal Domestic Assistance (CFDA)/Assistance Listing Number and Title | input (text) | funding_opportunity_number (related) | Documented (not live-captured) | Assistance Listing Number, formerly CFDA. |
| 12 | Funding Opportunity Number / Title | input (text) | funding_opportunity_number, funding_opportunity_title | Documented (not live-captured) | Usually system-populated from the selected opportunity. |
| 13 | Competition Identification Number/Title | input (text) | — | Documented (not live-captured) | Not in listed package-key set. |
| 14 | Areas Affected by Project | input (text) | — | Documented (not live-captured) | Not in listed package-key set. |
| 15 | Descriptive Title of Applicant's Project | input (text/textarea) | project_title | Documented (not live-captured) | |
| 16 | Congressional Districts (Applicant / Program-Project) | input (text) | applicant_congressional_district | Documented (not live-captured) | |
| 17 | Proposed Project Start/End Date | input (date) x2 | project_start_date, project_end_date | Documented (not live-captured) | |
| 18a | Federal Estimated Funding | input (currency) | federal_funding_requested | Documented (not live-captured) | |
| 18b–18e | Applicant / State / Local / Other estimated funding | input (currency) | total_project_cost (component of) | Documented (not live-captured) | Sum of 18a–18e typically equals `total_project_cost`. |
| 18f | Program Income | input (currency) | — | Documented (not live-captured) | Not in listed package-key set. |
| 19 | Is Application Subject to Review by State Executive Order 12372 Process | radio group | — | Documented (not live-captured) | Not in listed package-key set. |
| 20 | Is the Applicant Delinquent on any Federal Debt | radio (Yes/No + explanation) | sam_registration_status (adjacent) | Documented (not live-captured) | Related-but-distinct compliance signal from SAM.gov registration status. |
| 21 | Authorized Representative — Prefix, First/Last Name, Title, Telephone, Fax, Email | input group | authorized_representative_name | Documented (not live-captured) | AOR signature block — the extension must never auto-populate the signature/date itself; only pre-fill the identity fields for the human AOR to review. |
| 21 | Signature of Authorized Representative + Date Signed | signature widget + date | — | Documented (not live-captured) | **Explicitly out of scope for auto-fill** — this is the human-only final-submit action per the honesty rules. |
| (n/a) | NAICS Code | input (text), common on SF-424 supplements (e.g. SBIR/STTR cover pages) rather than base SF-424 | naics_code | Documented (not live-captured) | Appears on agency-specific supplemental forms, not base SF-424 boxes 1–21. |
| (n/a) | Capital Requirement Range | not part of standard SF-424; agency/program-specific | capital_requirement_range | Documented (not live-captured) | No standard SF-424 box; likely only relevant to specific funding-program intake forms (e.g. non-dilutive/loan program applications), not the base federal form. |

---

## Section navigation + step flow — summary across portals

| Portal | Flow observed publicly | Detail |
|---|---|---|
| Grants.gov | Partial (conceptual only) | Public pages are single informational pages, not a wizard. Actual flow (documented, not live): Workspace → package → per-form tasks → Check Package → AOR Sign & Submit. Real Next/Save/Continue button selectors unknown — TODO in-session. |
| Research.gov | Not observed | Landing page is link-out only; proposal-prep wizard lives behind "Prepare & Submit Proposals," not reached this pass. |
| NIH ASSIST | None public | Single login screen only; no post-login flow observable. |
| SBIR.gov | Observed (search only) | Single-page filter form: set filters → **Apply** → paginate (**Next**/page numbers) → **Reset**. Registration/application flow behind **Register**/**Login**, not reached this pass. |

---

## Auth-gated areas / TODO: in-session selector capture

The following require a real, logged-in session (a human driving the extension in a dev/debug pass inside their own authenticated portal) before true selectors can be captured. **None of these were, or should be, accessed with credentials the recon agent does not own:**

1. **Grants.gov Workspace** (entire application-filling surface — this is where every SF-424-family field, section Next/Save/Continue controls, and the "Check Package"/"Sign & Submit" controls actually live). Gate: Grants.gov account login (Login.gov-backed).
2. **Grants.gov Forms Repository — actual fillable form instance.** Only a static reference copy is public; the real interactive instance is inside Workspace (see #1).
3. **Research.gov → "Prepare & Submit Proposals"** and its sub-flows (proposal creation, budget, senior personnel, etc.). Gate: NSF `research.gov` account login. Not confirmed exactly which click triggers the gate — TODO to trace this precisely.
4. **Research.gov → "Check Proposal Status"** (`/gapps-web/gapps/searchResults`). Gate: NSF account login (assumed, not confirmed).
5. **NIH ASSIST — everything post-login.** 100% gated; the recon-visible URL is the login screen itself. Gate: Login.gov, eRA Commons credentials, or institutional federated SSO, plus mandatory two-factor authentication.
6. **SBIR.gov — Register (company registration) flow.** Not reached in this pass; likely where organization_name/UEI-equivalent fields first appear on this portal. Gate: none to view the form itself is assumed reachable pre-account-creation for at least the first step, but this was not confirmed — TODO.
7. **SBIR.gov — External User Login / SBA Employee Login destinations.** Gate: SBIR.gov account credentials (recently migrated to a "new and more secure identity verification and login feature" per on-page text — implementation unknown).

**Fully auth-gated portal (flagged for priority in-session capture): NIH ASSIST.** Its only public surface is the login screen; there is no public content to map at all beyond the three login-method affordances.

---

## Implications for the extension field-map config

- The config should be **per-portal** (grants.gov, research.gov, NIH ASSIST, SBIR.gov each get their own field-map namespace) since selectors, section flow, and even which SF-424 boxes are exposed as distinct fields will differ per portal/form family.
- Each field entry should carry a **tiered selector strategy**: try stable `id` first, fall back to `name`, then `aria-label`/`aria-labelledby`, then a label-text-association strategy (walk from a `<label for>` or adjacent text node to its control) as the last resort — matching the fallback chain the recon prompt specified, since gov portals are known to rehost/rebuild forms without guaranteed stable ids.
- Every field entry should be **keyed by the package `PrefilledField.key`** (e.g. `organization_name`, `uei`, `project_title`, ...) from the list in this recon's scope, with a `null`/absent key for portal-only UI controls (search filters, pagination, login fields) that have no corresponding package field.
- Because **zero live selectors were captured in this pass** (Playwright tooling unavailable), the config cannot be populated with real selector strings yet — it should ship with the `PrefilledField.key` → conceptual-field mapping from the SF-424 canonical table above, and every selector slot should be explicitly `TODO` until a working in-session Playwright/browser pass (ideally by a human logged into their own grants.gov/research.gov/ASSIST/SBIR.gov account, since 4 of 4 portals gate their real fill-target fields behind login) fills them in for real.
- Given the SBIR.gov `Apply` button naming collision noted above (search-filter "Apply" vs. the extension's own fill/apply action), the config's internal action-naming should avoid the word "apply" for the extension's own actions to prevent confusion in code and logs.
