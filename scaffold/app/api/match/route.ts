import { NextRequest } from "next/server";
import { handleMatchRequest } from "./handler";

// Novel input can take up to ~2 minutes; give the function room (and stream so
// bytes flow the whole time rather than a single blocking response).
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return handleMatchRequest(req);
}
