# The prompt arc — how the human steered the build

A faithful, chronological trace of the human's prompts across the Granted (fundFinder)
buildout. Lightly grouped into phases. Verbatim where short; closely paraphrased where long.
This is the "director's track" that sits alongside `granted-retrospective.md`.

---

## Phase 0 — kickoff & config (the "given" materials)

The build opened from a fixed entry point rather than a chat: the orchestrator was told
to read, in order, `prompts/START-HERE.md` → `prompts/orchestrator-prompt.md` (the
1,210-line spec) → `northstar.md`, then `feedback.md` / `open-questions.md` /
`resolved-questions.md`, then the mock-auth bundle. `CLAUDE.md` (global + project) set the
standing rules: **orchestrator-only, plan-first, worktree isolation, PR-per-task, never
push to main.** Phase 1 was recon only (`as-built.md`, `hypothesis-check.md`, `canon.md`),
gated behind human approval.

---

## Phase A — first build, calibration & the loading bar

- "go ahead and set the GHA secrets. sure use the app credits for runtime-test"
- "continue. I just bought the $200 max plan"
- "make sure all background agents are running and haven't hit usage limit stops. Have them continue"
- (browser console) ERR_CONNECTION_REFUSED on :3001 → "Spin up some subagents to fix them, or a single subagent."
- "where is my loading bar"
- "I want a hybrid bar — it can be partially animated … fun facts like 'did you know that the government gave out $$ last year to similar companies?'"
- "animate it until there is something the program can claim as a step that has been done, and then include that progress."

## Phase B — fleet operations & the feature wave

- "also continue with all other open tasks. Divide and conquer, I want parallel subagent teams … delegate to the dispatchers who will then delegate to their subagents. Merge in all PRs as they pass CI and reviews."
- "for r6, I want an 'auto apply' button … locked behind a padlock … pop up modal that says they need a pro subscription … waiting for API keys from the grant sites … requirements … in a hamburger three-line menu in a settings submenu … active SAM.gov registration, a UEI, an authorized AOR, and E-Biz POC delegation."
- "when the current tasks are done, please continue with all other open tasks. I want everything that is planned completed. If there are questions or blockers, table them … put them in the open questions file … Don't allow yourself or other agents or subagents to get stuck waiting for input from me."
- "for the sidebar … A collapsible sidebar with an icon that isn't outlined in a box, with the company name to the left of the sidebar icon, and then the sidebar icon at the right edge." (+ a pasted claude.ai sidebar DOM)
- "spin up another dispatcher … aggregate our prompts … a short presentation of how this work was created … powerpoint slideshow … with links to github in the repo for the prompts."
- "when I click 'auto-apply', this div 'modal' appears, but you can no longer scroll … the hamburger menu isn't aligned with the login button … hamburger on the left … user login on the right … same sizes … the 'Opt in to sharing anonymized usage data' button to literally just say 'Opt in to sharing anonymized usage data' and nothing more."
- "when I click 'see a sample company', it shows 'Preparing a few quick questions…' for 10 seconds, but no questions … just show the company description and grant information immediately … remove the few quick questions altogether."
- "I added GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_CLIENT_ID to vercel … here is the publishable supabase api key: sb_publishable_…"
- "the real account still loads as a hackathon judge, it doesn't go thru the oauth flow …" → "it was 3002" → "ok that was it, 3001 works"
- "merge the design"
- "the login page doesn't honor system dark mode … on either 3002 or 3001. merge the design"
- "where is the settings side bar?"
- "when a user clicks the opt in checkbox, I don't want a recording of when they opted in displayed. Instead just have that 'Opted in …' in the user settings … Also, there is a javascript alert in the code. I want that to be a sweetalert SWAL modal instead."
- "when I click [chevron] in the sidebar, it doesn't collapse that section … collapse the section even if it's the only one open … expand … even if there are other sections expanded instead of closing the other sections."
- "what else is left?"
- "lets merge in everything as soon as we can and push it to main so vercel is live with the latest and greatest"

## Phase C — the architectural review

- "lets do a full architectural review of the entire codebase with a divide and conquer method with a team of subagents all running appropriate models … Look for how data flows … critical user journeys … build some tests … bottlenecks, optimizations, cost savings … gather all the reviews, refine them once, and then start a new branch to address all critical and high findings. Any medium and low findings can wait … then a new branch for the medium and low findings. I want to A/B test those on the 3002 port before we merge."
- "also, lets start with the sidebar expanded and the account section expanded and a short swal modal … 'sign in to save your searches' … dismissed with a click on the X … or clicking anywhere else."
- "yes phase 4"

## Phase D — this session: polish, features, hardening

- (auto-apply modal opens halfway down the page) → portal it to the top / out of the grant element.
- "I want the sweet alert welcome guide … rather be almost like a tooltip on the sign in button … a welcome guide that shows where to sign in to save searches and shows the demo company list … then focus the cursor in the text area … 'give a good description of your company here with as much detail as you like'."
- "im wondering if the demo page is moot because we have example companies in the main page"
- "a feature that … compares business descriptions/business models of competitors and existing grants received to your description and provides tailored feedback … demonstrate at the hackathon … locked behind the pro plan … an option for demo … requires search tools to pull competing company profiles + public grants … investigation using an opus model on extra high effort. We need to determine if this is feasible based on public data."
- "spin up a dispatcher that then calls an opus extra high effort sub agent to begin that investigation and reporting back to that dispatcher. The dispatcher can be running haiku."
- "the demo page says 'Demo data pending' … I've refreshed my credits, lets get that built out. Use a dispatcher and subagent."
- "are we sure that when people opt in to sharing their data that it is properly sanitized and anonymized?"
- "yes fix the consent gating, and lets get the /demo page fully working with actual data."
- "I want the 'SETTINGS' in the sidebar menu to just say 'AUTO APPLY SETTINGS'"
- "I'm not seeing it on the 3001 local host page yet"
- "yes run the calibration re-validation"
- (banner + logo images) "The banner at the top left to take the place of the word 'Granted' … and the logo at the bottom left of the sidebar menu. Also, when the sidebar is collapsed it is completely hidden. I'd like … a few percent … the width of the sidebar icon … 1% larger so it doesn't collide."
- "lets spin up a dispatcher and a subagent team to delegate out … the remaining findings. Give me directions for adding the prod real auth. I'll upgrade vercel to the pro plan. OK it's upgraded to pro."
- "I want them to be transparent. I'll make them transparent and put new logos in the directory."
- "I actually want the logo image left off the page."
- "I also want a larger banner image centered above the main text, instead of 'Federal funding intelligence', please put the transparent logo."
- (console) "Warning: Extra attributes from the server: style … at body … RootLayout" and "A listener indicated an asynchronous response by returning true, but the message channel closed …" → "Perhaps they are nothing. lets tackle both with that same dispatcher and subagent team." + "spin up a dispatcher and subagent to fix the sidebar peek, it is too big and has a duplicate sidebar icon … lets just revert it and go back to the sidebar icon only."
- "the sweetalert welcome guide pop ups show every time. They should only show up the first time a new user interacts … only show once, even if they sign in. Spin up another dispatcher and subagent."
- "lets review and merge all [the parked findings], using a subagent team."
- "what is left? I want them all merged asap."
- "the vercel prod call back after oauth sign in is redirecting me to localhost:3001" → "I need the localhost redirect callback fixed asap" → "nevermind I fixed it by changing the default callback URL in supabase."
- "i closed PR #54, it's after the 2pm cutoff … Lets not merge it." → "what did we miss on the app by not merging it in?"
- "a full retrospective … all of my prompts, our starting prompts, the northstar guide and all other .md files … our pattern of using dispatchers and subagents, and gotchas … as a powerpoint … I'd like to use remotion to make a demo video."
- "I also want the prompts included in the retrospective directory … bundled together as part of a retro PR … but do not merge it or create the PR until after 3pm MST today."

---

### What the arc shows

The cadence climbs from **single fixes** ("where is my loading bar") to **fleet operations**
("divide and conquer, parallel subagent teams, merge as they pass CI"). The through-line is
product integrity — *"tell them plainly when there's nothing worth chasing"* — and a
consistent operating model: **dispatchers relay, workers build in isolation, the orchestrator
merges centrally.**
