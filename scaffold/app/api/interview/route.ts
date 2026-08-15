import { NextRequest, NextResponse } from "next/server";
import { generateQuestions, type InterviewQuestion } from "@/lib/interview/generateQuestions";

/**
 * FE-03 — R1 pre-search interview: question generation ROUTE.
 *
 * Thin server wrapper around INT-01 (`generateQuestions`). Runs the cheap/fast
 * model pass server-side ONLY — `generateQuestions` reads `OPENAI_API_KEY`
 * from the environment, which must never reach the client bundle.
 *
 * Contract with the client (components/IntakeForm.tsx /
 * components/PreSearchInterview.tsx): this route NEVER 5xxs on a generation
 * failure. `questions: []` (whether from a genuinely clean description, a
 * timeout, a missing key, or a malformed model response) is a valid 200
 * response, and the client treats it as "skip the interview, search
 * directly" — a broken/slow interview must never block the free path.
 */

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let description: string;
  try {
    const body = await req.json();
    description = body?.description;
  } catch {
    return badRequest("Invalid request body.");
  }

  if (!description || description.trim().length < 20) {
    return badRequest(
      "Add a bit more detail about your company — a sentence or two on what you build, your size, and what you need."
    );
  }

  let questions: InterviewQuestion[] = [];
  try {
    questions = await generateQuestions(description);
  } catch (err) {
    // Any generation failure (bad/missing key, timeout, malformed model
    // output) degrades to an empty interview rather than a 5xx — the client
    // falls back to searching directly. Log server-side for visibility.
    console.error("interview generation failed:", err);
    questions = [];
  }

  return NextResponse.json({ questions });
}
