# APL-01 — R6 Assisted-Apply Feasibility Memo (S2S / Federal Portal Research)

**Status:** Research only. No code, no credentials, no portal integration. Written per §8.3 —
anything below flagged **ESCALATE** must go to the orchestrator/legal for a decision; it is not
resolved by this memo.

**Author:** Team Apply (research task, unblocked, runs before any R6 code)

**Retrieval window:** All web sources below were fetched during this research pass (August 2026).
Every claim carries its source and is marked with a confidence/verification level. Per the task's
hard rule, anything that could not be verified against a current official source is marked
**UNKNOWN** rather than asserted. **Federal system requirements change** — this memo must be
re-verified again immediately before any R6 code is scheduled, not assumed still-current at that
point.

---

## 1. Executive summary

- Grants.gov now exposes **two public, unauthenticated REST endpoints** (`search2`,
  `fetchOpportunity`) for opportunity discovery — safe, low-risk, no credentials involved. This is
  usable today for the package builder's opportunity-detail pull.
- Grants.gov's **application-submission path is not yet available as an open, self-service REST
  API.** It exists only via a legacy SOAP-based System-to-System (S2S) interface that (a) requires
  a commercial PKI certificate, (b) requires roles a user's organization must grant, and (c) — for
  third-party submission specifically — requires **Grants.gov's Program Management Office (PMO) to
  designate your certificate with a "Third Party Submitter" role.** This is a gatekept approval,
  not a signup form. A modern REST submission workflow is in limited partner-agency testing as of
  early 2026 and is not generally available.
- **The single most important finding for the liability analysis:** Grants.gov's own third-party
  submission web services (`Authenticate AOR [Expanded]` + `Submit Application As Third Party
  [Expanded]`) technically allow a third-party system to authenticate as the AOR using the AOR's
  **username and password** and then submit an application with **no human browser click at the
  moment of submission.** NIH's own ASSIST system uses exactly this mechanism today. This proves
  the "a human must click submit" boundary is a **product/policy choice fundFinder must impose on
  itself** — it is not a technical wall Grants.gov puts up for you. That makes the assist/submit
  boundary a decision this memo escalates rather than resolves (see §6).
- Every portal in scope (Grants.gov, NIH ASSIST/eRA Commons, NSF Research.gov) requires the
  submitting user to be an **Authorized Organization Representative (AOR)** (or NIH's equivalent,
  **Signing Official**) — a role the user's own organization grants to a specific person, and which
  that person alone may exercise. **fundFinder cannot hold this role for a customer**; SAM.gov's own
  terms of use bar assigning an administrative/representative role to anyone not directly connected
  to the entity (officer, board member, employee).
- Recommendation (§7): build the **thin assisted-apply slice** — package builder, human
  review-and-attest screen, human logs in and submits themselves, in their own session, with their
  own credentials. **fundFinder never requests, stores, or transmits AOR/SAM.gov/eRA
  Commons/Research.gov credentials, never calls the third-party-submission web services, and never
  pursues the PMO's Third Party Submitter designation without a separate legal-review gate.**
  Headless-browser submission stays an explicit non-goal, consistent with the orchestrator prompt.

---

## 2. Grants.gov System-to-System (S2S) / API — what's currently possible

### 2.1 Public REST APIs (no auth) — usable today, low risk

Grants.gov has been rolling out a RESTful API (via the Simpler.Grants.gov modernization effort)
alongside its legacy SOAP-based S2S interface.

- **`search2`** and **`fetchOpportunity`** launched March 2025 and are explicitly public:
  "Authentication and authorization are not required" for these two endpoints. `search2` searches
  funding opportunities; `fetchOpportunity` retrieves opportunity detail (eligibility, deadlines,
  attachments).
  Source: [2 RESTful APIs Are Now Available for System-to-System Users](https://grantsgovprod.wordpress.com/2025/03/13/2-restful-apis-are-now-available-for-system-to-system-users/) (Grants.gov Community Blog, retrieved Aug 2026);
  [API Guide](https://grants.gov/api/api-guide) (Grants.gov, retrieved Aug 2026).
- Other REST endpoints exist under an "Applicant API" / "Grantor API" split but **require an API
  key issued by opening a Grants.gov Help Desk ticket**; the API Guide does not publish a fee.
  Source: [API Guide](https://grants.gov/api/api-guide); [API Resources](https://grants.gov/api) (retrieved Aug 2026).
- **Production**: `api.grants.gov`. **Staging**: `api.staging.grants.gov`.
- **Application submission via the new REST API is not yet generally available.** Per the
  Simpler.Grants.gov roadmap, the team is "testing a simpler, more intuitive application workflow
  with a small number of partner agencies and funding opportunities" as of early 2026, with a
  target of full legacy-platform replacement in 2027.
  Source: [Simpler.Grants.gov Roadmap](https://simpler.grants.gov/roadmap) (retrieved Aug 2026).
  **This is a moving target — re-check before any code that assumes REST submission exists.**

**Implication for R6:** the two public read-only endpoints are safe to use for the package
builder's opportunity-detail prefill (no credentials, no ToS ambiguity, matches §5.5's
allowlist-bounded-fetch requirement). Submission is not available this way yet.

### 2.2 Legacy SOAP-based Applicant System-to-System (search + submit)

This is the interface that actually supports submission today, and it is substantially more
involved than the REST APIs:

- Requires a **Grants.gov account with the Expanded AOR role** (or, for basic submission of your
  own workspace, Standard AOR).
  Source: [Applicant System-to-System](https://www.grants.gov/system-to-system/applicant-system-to-system/) (retrieved Aug 2026).
- Requires a **commercial PKI/TLS client certificate**: 2048-bit RSA key, SHA-2 signature, TLS 1.2+,
  port 443. Grants.gov explicitly **rejects self-signed certificates and certificates from
  unapproved/free CAs** — only Sectigo, DigiCert, GoDaddy, InCommon, and similar approved CAs are
  accepted.
  Source: [Certificates | Grants.gov](https://www.grants.gov/system-to-system/applicant-system-to-system/certificates) (retrieved Aug 2026).
- Requires developer-level XML/SOAP/Java familiarity and use of published WSDLs; a
  training.grants.gov sandbox account (via Login.gov) is available for testing before production.
  Source: [Applicant System-to-System](https://www.grants.gov/system-to-system/applicant-system-to-system/) (retrieved Aug 2026).

### 2.3 Third-party submission web services — the liability-critical finding

Two paired web services exist specifically to let one system submit **on behalf of** an AOR:

- **`Authenticate AOR`** (and its replacement, **`Authenticate AOR Expanded`**): takes an
  `AORUserID` and `AORPassword`, validates the Authorized Applicant role, and returns a token.
  Source: [Authenticate AOR](https://www.grants.gov/system-to-system/applicant-system-to-system/web-services/authenticate-aor);
  [Authenticate AOR Expanded](https://www.grants.gov/system-to-system/applicant-system-to-system/web-services/authenticate-aor-expanded) (retrieved Aug 2026).
- **`Submit Application As Third Party`** (and its replacement, **`Submit Application As Third
  Party Expanded`**): consumes that token and submits the application. Grants.gov's own
  documentation states plainly: **"Certificates should have a special role called Third Party
  Submitter role that will be designated by PMO."** and directs interested parties to "contact the
  PMO" for more information.
  Source: [Submit Application As Third Party Expanded](https://www.grants.gov/system-to-system/applicant-system-to-system/web-services/submit-application-as-third-party-expanded) (retrieved Aug 2026).
- Per Grants.gov documentation, this pairing is how **NIH's ASSIST system** submits on behalf of
  applicants through Grants.gov; NIH ASSIST was directed to move to the "Expanded" pair ahead of
  SAM's DUNS→UEI cutover.
  Source: same as above (retrieved Aug 2026).

**Read this precisely:** the mechanism that exists to let a third-party system submit a federal
grant application without the AOR touching a browser at the moment of submission (a) is real and
in production use by NIH ASSIST, (b) requires handling the **AOR's own username and password** (or
a token derived from them) inside the third-party system, and (c) is **not self-service** — it
requires Grants.gov's PMO to specifically designate your certificate with the Third Party Submitter
role. There is no published self-service enrollment path; it is a direct-contact/approval process.

This is exactly the combination the task rules out (no credentials, no code) and exactly what §8.3
requires escalating rather than resolving: it touches federal-system auth and the assist/submit
boundary directly. **See §6, escalation item E1.**

---

## 3. User prerequisites (organization side)

- **SAM.gov registration**, active and renewed annually. Registration itself is confirmed **free**
  by SAM.gov and by independent legal counsel — the government "never charges for SAM registration
  or for obtaining your Unique Entity Identifier (UEI)." A cottage industry of paid third-party
  "registration services" ($300–$3,000 observed) is explicitly a scam-adjacent risk SAM.gov and law
  firms warn about, not a required cost.
  Sources: [SAM.gov Is Free — Beware of Costly Registration Scams](https://www.woodsrogers.com/insights/publications/sam-gov-is-free-beware-of-costly-registration-scams) (Woods Rogers, retrieved Aug 2026);
  general corroboration across multiple registration-guide sites (retrieved Aug 2026, lower
  confidence — treat as directional, not authoritative).
- **UEI (Unique Entity Identifier)**: assigned through SAM.gov registration; has fully replaced the
  legacy DUNS number as the entity identifier across federal systems.
  Source: [Organization Registration | Grants.gov](https://grants.gov/applicants/applicant-registration/organization-registration) (retrieved Aug 2026).
  **Caution:** during this research pass, one third-party SBIR-adjacent guidance page (not an
  official DoD source) still referenced a DUNS-number requirement for DSIP account setup. That
  reads as stale content, not a current requirement — DUNS has been retired SAM-wide — but it is
  called out here explicitly per the task's instruction not to trust remembered/likely facts. **Do
  not build against DUNS; verify current DSIP registration fields directly against the live portal
  before any DSIP-specific work.**
- **E-Biz POC (Electronic Business Point of Contact)**: designated in SAM.gov by the organization;
  this is the role that unlocks Grants.gov registration for the org and that assigns downstream
  Grants.gov roles (AOR, Workspace Manager, etc.).
  Source: [Organization Registration | Grants.gov](https://grants.gov/applicants/applicant-registration/organization-registration) (retrieved Aug 2026).
- **AOR (Authorized Organization Representative)**: the only role(s) permitted to submit a Grants.gov
  application. Grants.gov's Workspace role model has two submission-capable roles — **Standard
  AOR** (submits for workspaces they own/participate in) and **Expanded AOR** (organization-wide,
  administrative, including certificate management) — and no other role can submit.
  Source: [Workspace Roles | Grants.gov](https://www.grants.gov/applicants/workspace-overview/workspace-roles.html) (retrieved Aug 2026). *(Note: this source's auto-summarized fetch also expanded "AOR" as "Authority to Obligate and Represent" in one place, which conflicts with every other official Grants.gov page's use of "Authorized Organization Representative." That expansion is treated as an artifact of automated summarization, not a verified fact, and is disregarded.)*
- **Organizational-role restriction (relevant to product design):** SAM.gov's own Terms of Use bar
  assigning any administrator/representative role to a person "not directly connected to your
  entity like an officer, board member, or employee," and bar accepting such a role if you are not
  directly connected. Source: [SAM.gov Terms of Use](https://sam.gov/about/terms-of-use) (retrieved
  Aug 2026). **This means fundFinder, as a vendor, structurally cannot be the E-Biz POC or the AOR
  for a customer — those roles must stay with the customer's own personnel.** This is a hard
  constraint on any future design, not just a preference.

---

## 4. Portal differences — auth, MFA, PIV/CAC

| Portal | Login mechanism | MFA | Who may submit | Confidence |
|---|---|---|---|---|
| **Grants.gov** | Grants.gov account (Login.gov-backed for sandbox/newer flows) | Not separately documented beyond Login.gov's own MFA where used | Standard AOR / Expanded AOR only | High — official docs |
| **NIH ASSIST / eRA Commons** | eRA Commons ID via Login.gov or InCommon federated account | **MFA mandatory.** Plain username/password-only eRA accounts are no longer permitted; InCommon accounts without 2FA are no longer permitted. | Signing Official (SO); SOs can delegate submission-adjacent privileges (e.g., RPPR submission) to PIs, but the core certifying signature authority sits with the SO role. | High — official NIH/eRA docs |
| **DoD DSIP (SBIR/STTR)** | Login.gov account, then a DSIP "firm profile" | **UNKNOWN — not confirmed from an official source in this pass.** Secondary sources describe Login.gov-based sign-in; one source mentions firms without CAC/PIV must purchase an External Certificate Authority (ECA) certificate for **encrypted email**, which is distinct from portal login and should not be conflated with a login requirement. | Proposals must be submitted "via DSIP; proposals submitted by any other means will be disregarded" — i.e., portal-only, no alternate submission channel. Role/authority model within DSIP (who is the DSIP equivalent of an AOR) is **UNKNOWN** — not confirmed in this pass. | Low-medium — WebFetch could not load DSIP's own pages directly during this research session; findings here are from search snippets, not a directly fetched primary source. **Flagging for direct re-verification against dodsbirsttr.mil before any DSIP-specific package-builder work.** |
| **NSF Research.gov** | NSF credentials or Login.gov | **MFA mandatory for all users since October 27, 2024.** Financial/administrative roles must use phishing-resistant MFA specifically (e.g., Login.gov with a phishing-resistant method, security key, biometric). | Only the AOR may submit a proposal to NSF; PI/Sponsored Project Office (SPO) can prepare and must share submission access with the AOR for solicitations requiring AOR submission. | High — official NSF/Research.gov docs |

No public, documented API for **programmatic proposal submission** was found for NSF Research.gov
or DoD DSIP during this pass. Absence of evidence is not proof of absence — mark this **UNKNOWN**,
not "confirmed absent" — but no self-service developer path surfaced anywhere in NSF's or DoD's own
documentation, in contrast to Grants.gov's (gatekept, but at least documented) S2S path.

Sources: [Use an InCommon Federated Account to Log In to eRA Modules](https://www.era.nih.gov/register-accounts/access-modules-with-federated-account.htm); [Signing Official (SO) — eRA Commons](https://www.era.nih.gov/erahelp/commons/commons/roles/SO.htm); [FAQs for Signing Into Research.gov](https://resources.research.gov/common/attachment/Desktop/FAQs_Signing_Into_Rgov.pdf); [How to Submit Letters of Intent and Proposals](https://resources.research.gov/common/attachment/Desktop/How%20to%20Submit%20LOIs%20and%20Proposals_Final_508.pdf); DSIP-related search snippets citing dodsbirsttr.mil solicitation instruction PDFs (all retrieved Aug 2026).

---

## 5. Cost

- **SAM.gov registration:** free (government-confirmed; see §3). Annual renewal, also free.
- **Grants.gov registration:** no fee identified in official docs.
- **eRA Commons / ASSIST, Research.gov, DSIP accounts:** no fee identified in official docs for the
  applicant-side account itself.
- **PKI/TLS certificate for legacy Applicant S2S:** Grants.gov requires a certificate from an
  approved commercial CA (Sectigo, DigiCert, GoDaddy, InCommon) and explicitly rejects free CAs.
  **No price was published by Grants.gov in the pages reviewed.** Commercial CA certificates of this
  class are not free, but this memo does **not** assert a dollar figure — mark **UNKNOWN**, verify
  against a specific CA's current pricing if/when this path is actually pursued.
- **Grants.gov API key (for endpoints beyond the two public ones):** obtained via a Help Desk
  ticket; **no fee structure published** in the API Guide or API Resources pages reviewed. Mark
  **UNKNOWN** rather than assume free-forever or metered.
- **DSIP ECA certificate** (for firms without CAC/PIV, used for encrypted email per DoD SBIR
  guidance): implies a paid Entrust/IdenTrust-class certificate purchase, but **no price was
  confirmed from an official source** in this pass, and it is unclear this is required for the
  portal-submission flow itself vs. only for encrypted-email correspondence. Mark **UNKNOWN**.
- **Engineering cost** of building and maintaining any of the S2S paths (cert lifecycle management,
  SOAP/XML integration, PMO liaison for third-party-submitter designation) is real but not
  quantified by this memo — it is a build estimate, not a research fact, and belongs in a separate
  engineering-scoping exercise if the PMO path is ever pursued.

**Bottom line on cost:** the thin assisted-apply slice recommended in §7 (package builder +
deep-link/export, no portal auth) has **no incremental federal-system cost** beyond the two free
public Grants.gov REST endpoints. The costs above only apply if a future phase pursues actual S2S
submission integration — which this memo recommends against for now (§7, §6).

---

## 6. Liability analysis and escalation items (§8.3)

Per §8.3, none of the following are resolved here. Each is a stop-and-surface item.

### The core liability fact

Submitting a federal grant application is an act of legal attestation. Grants.gov and EPA guidance
describe the AOR's action to submit as functioning as certification/assurance that the organization
has read and will operate in accordance with the application's requirements, and Grants.gov records
the AOR's electronic signature on submission, with the organization responsible for ensuring only a
properly authorized individual signs/submits.
Source: [Authenticate AOR | Grants.gov](https://www.grants.gov/system-to-system/applicant-system-to-system/web-services/authenticate-aor) (role/authorization description); general EPA applicant guidance on AOR responsibility (retrieved Aug 2026, directional — EPA's specific page fetched did not contain explicit "electronic signature = certification" language verbatim, so that phrasing is Grants.gov's own role documentation, not an EPA quote).

Federal false-statement exposure is real and general-purpose: 18 U.S.C. § 1001 criminalizes
knowingly false statements in matters within the jurisdiction of a federal agency (up to 5 years
imprisonment and fines up to $250,000 for individuals in the general case), and covers false
information submitted through authenticated federal electronic portals the same as a signed paper
form. Separately, the False Claims Act's "implied certification" theory can attach civil liability
(cited penalty range ~$13,946–$27,894 per false claim, a figure that adjusts periodically — treat as
approximate and time-bound, not a fixed number) when a submission implies compliance with material
program terms that turn out to be false.
Sources: [18 U.S.C. § 1001 False Statements: Elements and Penalties](https://legalclarity.org/18-u-s-c-1001-false-statements-and-federal-penalties/); [DOJ Justice Manual 903 — False Statements, Concealment](https://www.justice.gov/archives/jm/criminal-resource-manual-903-false-statements-concealment-18-usc-1001); [Be Careful What Certifications You Sign](https://www.thompsongrants.com/grants-intelligence/be-careful-what-certifications-you-sign-even-those-you-dont-sign) (retrieved Aug 2026). These are general secondary-source summaries of federal statute and DOJ guidance, not a legal opinion tailored to fundFinder — **actual applicability to fundFinder's product requires counsel, not this memo.**

### Escalation items (surfaced, not resolved)

- **E1 — Assist/submit boundary is a self-imposed policy, not a technical wall.** Grants.gov's own
  third-party-submission web services prove full automation is technically possible using AOR
  credentials, and NIH ASSIST does exactly this today. Whether fundFinder ever pursues anything
  resembling this path — even far in the future, even with the PMO's Third Party Submitter
  designation — is a legal/business decision that must go through the orchestrator and legal
  review before any exploration, per §8.3's "no exceptions and no interpretation." This memo's
  recommendation (§7) is to not pursue it, but that recommendation itself needs sign-off, not
  silent adoption.
- **E2 — Credential handling is a hard no under current scope**, and the only technical path to
  automated submission requires exactly the AOR username/password fundFinder is barred from
  touching. Flagging so this constraint is never quietly worked around by a future task that treats
  "assisted apply" as license to creep toward stored credentials.
- **E3 — fundFinder cannot be the AOR or E-Biz POC for a customer** (SAM.gov ToS, §3). Any product
  flow that implies fundFinder "handles filing on your behalf" in a way that suggests fundFinder
  exercises representative authority would misstate the legal relationship and should be reviewed
  by legal/marketing before any such copy ships (this also intersects with R7.7's guarantee-copy
  rule and §8.3's "copy that would state or imply an outcome guarantee").
- **E4 — Product-liability question distinct from the AOR's federal liability**: if fundFinder
  prefills a field incorrectly (e.g., from a misread NOFO or a stale profile fact) and a human
  attests to it anyway on the review screen, does presenting a wrong prefilled value with a
  provenance tag create liability exposure for fundFinder separate from the AOR's own § 1001 / FCA
  exposure? This is a legal question this memo cannot answer and does not attempt to.
- **E5 — DSIP's authentication and role model could not be confirmed from a directly-fetched
  official source in this pass** (§4). Before any DSIP-specific package-builder work is scoped,
  someone with actual DSIP portal access should verify current login, MFA, and role requirements
  directly against dodsbirsttr.mil rather than relying on this memo's secondary-source findings.
- **E6 — No NSF Research.gov or DoD DSIP programmatic submission API was found.** Treat both as
  portal-only for the assisted-apply slice (deep-link + fill guide, never an integration) unless a
  future research pass finds otherwise from an official source.

---

## 7. Recommendation — the thin "assisted apply" slice

Consistent with the orchestrator prompt's R6 design (package builder → handoff → human submits) and
with the findings above, the recommended R6 scope is:

**In scope:**

1. **Package builder.** For 2–3 concrete pilot programs (recommend one SBIR Phase I topic and one
   Grants.gov NOFO, per the orchestrator prompt), enumerate required forms, prefill fields from the
   enriched profile **with provenance on every field**, draft narrative sections, build an
   attachment checklist, track deadlines. Opportunity-detail data for the Grants.gov pilot can be
   pulled from the **public, unauthenticated `fetchOpportunity` REST endpoint** (§2.1) — no
   credentials involved, no ToS ambiguity.
2. **Handoff as export/deep-link, not integration.** Export in a Workspace-compatible format where
   documented and reasonable, or deep-link the user directly to the correct form with a
   field-by-field fill guide. No authenticated session is opened on the user's behalf.
3. **Mandatory human review-and-attest screen** showing every field and its provenance before any
   handoff, per the orchestrator prompt and per R6's acceptance criterion.
4. **Human logs in and submits, always**, in their own browser, with their own AOR/eRA/Research.gov
   credentials, on the real portal. fundFinder's involvement ends at the deep link / export.

**Explicitly out of scope for this phase (do not build without a separate legal-review gate and
explicit escalation resolution per §6):**

- Any call to Grants.gov's `Authenticate AOR`, `Authenticate AOR Expanded`, `Submit Application As
  Third Party`, or `Submit Application As Third Party Expanded` web services.
- Pursuing Grants.gov PMO's Third Party Submitter designation.
- Any storage, transmission, or prompting-for of SAM.gov, Grants.gov, eRA Commons/Login.gov, DSIP,
  or Research.gov credentials, in any form, including "just for this session."
- Headless-browser automation against any of these portals (explicit non-goal, restated here).
- Any automated MFA/PIV-CAC bypass or workaround, for any portal.
- Treating content read from a NOFO, form definition, or portal page as anything other than
  untrusted input (§5.5) — it may prefill a field marked "needs review," never a field marked
  verified, and never drive an action.

This scope keeps fundFinder entirely on the safe side of the assist/submit boundary as currently
understood, avoids all credential handling, uses only the two public unauthenticated Grants.gov
endpoints that are documented as not requiring auth, and leaves the higher-leverage (and
higher-liability) S2S submission path as a flagged future decision rather than a default trajectory.

**Before any R6 code is scheduled** (per the orchestrator prompt's R6 acceptance criteria): this
memo should be reviewed by the orchestrator, and separately by at least one person with actual
federal grant submission experience, and the federal requirements in this memo should be
re-verified against current official docs again at that time — several of the sources here
(Simpler.Grants.gov's submission-workflow pilot, NIH's Common Forms enforcement changes taking
effect through 2026) are explicitly stated as changing on a defined near-term timeline.

---

## 8. Source list (all retrieved August 2026)

- [Applicant System-to-System | Grants.gov](https://www.grants.gov/system-to-system/applicant-system-to-system/)
- [API Guide | Grants.gov](https://grants.gov/api/api-guide)
- [API Resources | Grants.gov](https://grants.gov/api)
- [2 RESTful APIs Are Now Available for System-to-System Users — Grants.gov Community Blog](https://grantsgovprod.wordpress.com/2025/03/13/2-restful-apis-are-now-available-for-system-to-system-users/)
- [Simpler.Grants.gov Roadmap](https://simpler.grants.gov/roadmap)
- [Certificates | Grants.gov (Applicant S2S)](https://www.grants.gov/system-to-system/applicant-system-to-system/certificates)
- [Authenticate AOR | Grants.gov](https://www.grants.gov/system-to-system/applicant-system-to-system/web-services/authenticate-aor)
- [Authenticate AOR Expanded | Grants.gov](https://www.grants.gov/system-to-system/applicant-system-to-system/web-services/authenticate-aor-expanded)
- [Submit Application As Third Party Expanded | Grants.gov](https://www.grants.gov/system-to-system/applicant-system-to-system/web-services/submit-application-as-third-party-expanded)
- [Organization Registration | Grants.gov](https://grants.gov/applicants/applicant-registration/organization-registration)
- [Workspace Roles | Grants.gov](https://www.grants.gov/applicants/workspace-overview/workspace-roles.html)
- [SAM.gov Terms of Use](https://sam.gov/about/terms-of-use)
- [SAM.gov Is Free — Beware of Costly Registration Scams (Woods Rogers)](https://www.woodsrogers.com/insights/publications/sam-gov-is-free-beware-of-costly-registration-scams)
- [Use an InCommon Federated Account to Log In to eRA Modules | eRA (NIH)](https://www.era.nih.gov/register-accounts/access-modules-with-federated-account.htm)
- [Signing Official (SO) — eRA Commons | NIH](https://www.era.nih.gov/erahelp/commons/commons/roles/SO.htm)
- [NOT-OD-26-079 — Common Forms Enforcement Notice | NIH](https://grants.nih.gov/grants/guide/notice-files/NOT-OD-26-079.html)
- [FAQs for Signing Into Research.gov | NSF](https://resources.research.gov/common/attachment/Desktop/FAQs_Signing_Into_Rgov.pdf)
- [How to Submit Letters of Intent and Proposals | Research.gov](https://resources.research.gov/common/attachment/Desktop/How%20to%20Submit%20LOIs%20and%20Proposals_Final_508.pdf)
- [How a PI/co-PI Shares Proposal Access with SPO/AOR | Research.gov](https://resources.research.gov/common/attachment/Desktop/How_PIs_Share_Access_with_SPO_AOR_Final_508.pdf)
- [DSIP (DoW SBIR/STTR Innovation Portal)](https://www.dodsbirsttr.mil/) *(page reachable but content not directly extractable in this pass — see E5)*
- [18 U.S.C. § 1001 False Statements: Elements and Penalties (LegalClarity)](https://legalclarity.org/18-u-s-c-1001-false-statements-and-federal-penalties/)
- [DOJ Justice Manual 903 — False Statements, Concealment — 18 U.S.C. § 1001](https://www.justice.gov/archives/jm/criminal-resource-manual-903-false-statements-concealment-18-usc-1001)
- [Be Careful What Certifications You Sign (Even Those You Don't Sign) — Thompson Grants](https://www.thompsongrants.com/grants-intelligence/be-careful-what-certifications-you-sign-even-those-you-dont-sign)

**Sources treated as lower-confidence / not relied on for factual assertions:** general SEO/guide
sites on SAM.gov registration costs and steps (directional corroboration only); a third-party
SBIR-connect page referencing DUNS for DSIP registration (flagged as likely stale, not used as a
fact).
