import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY!,
});

/* ---------------------------------- */
/* Helpers                            */
/* ---------------------------------- */

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function isOverloadError(err: any) {
  return (
    err?.status === 503 ||
    err?.code === 503 ||
    err?.message?.includes("overloaded") ||
    err?.message?.includes("UNAVAILABLE")
  );
}

async function generateWithRetry(opts: {
  model: string;
  text: string;
  retries?: number;
}) {
  const retries = opts.retries ?? 2;
  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: opts.model,
        contents: [{ role: "user", parts: [{ text: opts.text }] }],
      });

      // ✅ Correct way to extract text in @google/genai
      const anyRes = result as any;
      const text =
        typeof anyRes.text === "function"
          ? anyRes.text()
          : (anyRes.candidates?.[0]?.content?.parts || [])
              .map((p: any) => p?.text || "")
              .join("");

      return String(text || "").trim();
    } catch (err: any) {
      lastErr = err;
      if (!isOverloadError(err)) break;
      await sleep(500 * (attempt + 1));
    }
  }

  throw lastErr;
}

/* ---------------------------------- */
/* Route                              */
/* ---------------------------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      company,
      blueprint,
      mode,
      transcript,
      candidateAnswer,
      step, // "start" | "followup"
    } = body;

    if (!company || !blueprint || !mode) {
      return NextResponse.json(
        { error: "Missing required interview context" },
        { status: 400 }
      );
    }

    /* ---------------------------------- */
    /* START INTERVIEW                    */
    /* ---------------------------------- */

    if (step === "start") {
      const system = `
You are a professional interviewer at ${company}.
Ask ONE ${mode} interview question.
Base it strictly on this blueprint:

${JSON.stringify(blueprint, null, 2)}

Rules:
- Ask only ONE question
- Do not explain
- Sound realistic and human
`;

      const question = await generateWithRetry({
        model: "gemini-3-flash-preview",
        text: system,
      });

      return NextResponse.json({
        interviewer: question,
      });
    }

    /* ---------------------------------- */
    /* FOLLOW-UP + COACH FEEDBACK         */
    /* ---------------------------------- */

    if (step === "followup") {
      if (!candidateAnswer) {
        return NextResponse.json(
          { error: "Missing candidate answer" },
          { status: 400 }
        );
      }

      const followupPrompt = `
You are continuing a ${mode} interview at ${company}.

Previous transcript:
${transcript}

Candidate just answered:
"${candidateAnswer}"

TASK:
1. Ask ONE natural follow-up interview question
2. Then provide structured coach feedback

Coach feedback format EXACTLY:
Mode: ${mode.toUpperCase()}
STAR: STRONG | OK | WEAK | NONE
Missing: Situation, Task, Action, Result (only if applicable)
Why: <1–2 sentences>
Follow-up intent: <what you are testing next>

Respond in this JSON shape:
{
  "interviewer": "...",
  "coach": {
    "mode": "...",
    "star": "...",
    "missing": "...",
    "why": "...",
    "intent": "..."
  }
}
`;

      const raw = await generateWithRetry({
        model: "gemini-3-flash-preview",
        text: followupPrompt,
      });

      // Safely parse JSON from model
      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return NextResponse.json({
          interviewer: raw,
          coach: null,
          raw,
        });
      }

      return NextResponse.json({
        interviewer: parsed.interviewer,
        coach: parsed.coach,
        raw,
      });
    }

    return NextResponse.json(
      { error: "Invalid interview step" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("Interview API error:", err);

    return NextResponse.json(
      {
        error:
          err?.message ||
          "Interview model unavailable. Please try again.",
      },
      { status: 500 }
    );
  }
}
