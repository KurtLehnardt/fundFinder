# Granted — LinkedIn posts

Two ready-to-paste posts. Plain text (no markdown), so they paste into LinkedIn
without stray asterisks. Run through the "signs of AI writing" guide to read as
human. Swap `[your link]` for the live URL (or the `granted.*` domain once set).

---

## Post 1 — for people looking for grants

Most founders I know have a grant story that ends the same way. Three weeks writing an application they were never eligible to win.

The tools don't help much. Grants.gov lists everything and ranks nothing. And if you paste your pitch into ChatGPT, it'll happily invent a perfect-sounding program that doesn't exist and tell you to go for it.

So I built Granted.

You describe your company in plain English. It maps you against 968 real federal funding opportunities (SBIR/STTR, grants, procurement, loans), scores your fit the way a program officer would, and then does the one thing no other tool will do. It tells you when not to apply.

If your idea doesn't fit how federal money actually works, you get a straight "we don't recommend applying," plus where to look instead. Not a wall of maybes. And every match points back to a real award record, so it can't just make one up to keep you hopeful.

And it's yours to run. Clone the repo, npm install, and drop in an API key for whatever model you prefer. Or point it at a local model like Gemma on your own machine, and your company description never leaves your laptop.

Try it, or run your own copy: [your link]

If you've ever chased a federal grant, or quit one halfway through, I'd love to hear how this lands.

#SBIR #startups #federalgrants #opensource

---

## Post 2 — how it was built (orchestration → spec-driven design)

I built a federal funding tool for a hackathon this week, and I wrote almost none of the code myself. Here's how that actually worked.

The first prompts I wrote didn't describe a feature. They described a role. One agent runs as the orchestrator and never touches code. It breaks the work down, hands each piece to a focused sub-agent, and reviews what comes back. Each sub-agent works in its own isolated copy of the repo, opens a pull request, and the orchestrator is the only thing allowed to merge. Anything risky stays behind an off-by-default flag until it passes the automated checks. A dozen agents working at once, nobody stepping on anyone, one reviewer holding the line.

But the structure mattered less than what we pointed it at first.

We spent the week not writing code.

We had a reasonable feature list: ask better questions, show a progress bar, add competitor analysis, auto-apply to grants. We could have started building any of them Monday. Instead we turned the list into a specification, then attacked the specification. Four rounds. Here's what that surfaced.

The progress bar wasn't the problem. Our search took three minutes. The ask was a nicer loading experience. But a beautiful progress bar over three minutes is still three minutes, so the spec now requires a per-call latency profile before any optimization work is scheduled, because the intuition about what's slow is usually wrong. The bar became the mitigation. The waterfall became the fix.

"Auto-apply" became "assisted apply." Submitting a federal grant application is a legally attested act. An authorized representative certifies the contents are true. Building a product that clicks submit on someone's behalf doesn't save them time, it transfers liability to them. So we scoped it to package preparation, prefill, and a review-and-attest screen. The human submits. Always.

We found the gap that would have sunk it. Nothing in our original list required checking whether a company was eligible for the grants we surfaced. Perfect ranking on top of a set you can't apply to is worse than no list, because it costs a founder a week to discover. That's now the correctness floor the whole product sits on.

We also labeled every assumption we'd made about our own codebase as an explicit hypothesis to confirm before anyone acts on it. Turns out the fastest way to waste a sprint is to fix a problem you never verified exists.

Six requirements became eleven. Sixteen open decisions got named instead of silently defaulted. Nothing shipped.

Best week of the project so far.

The part I keep having to relearn: the hard bit was never building faster. It was being willing to cut the features that didn't deserve to exist. Once you've done that, handing the actual work to a system that runs itself is the easy part.

#buildinpublic #AI #hackathon
