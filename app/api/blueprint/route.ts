import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

type InterviewType = "behavioral_technical" | "behavioral_case";

type Blueprint = {
  role_focus: string[];
  likely_interview_type: InterviewType;
  risk_gaps: string[];
  company_notes: string[];
  sample_questions: {
    type: "behavioral" | "technical" | "case";
    question: string;
  }[];
};

function safeJsonParse<T>(
  raw: string
): { ok: true; data: T } | { ok: false; error: string } {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const sliced = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
    return { ok: true, data: JSON.parse(sliced) as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Failed to parse JSON" };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateWithRetry(ai: GoogleGenAI, model: string, prompt: string) {
  // retries help with 503 overload + 429 burst limits
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      // @google/genai returns text() (function) in many versions
      const raw =
        typeof (result as any)?.text === "function"
          ? (result as any).text()
          : (result as any)?.text ?? "";

      return { ok: true as const, raw };
    } catch (err: any) {
      const status = err?.status ?? err?.code;
      const msg = err?.message ?? "";

      // If model id is wrong (404), do NOT retry this model.
      if (status === 404) return { ok: false as const, raw: "", fatal: true, err };

      // Retry-after handling (429 quota / rate limit)
      // Gemini often includes "Please retry in XXs" in message
      const match = msg.match(/retry in\s+([\d.]+)s/i);
      const waitSeconds = match ? Number(match[1]) : 2 + attempt * 2;

      if (status === 429 || status === 503) {
        if (attempt === maxRetries) return { ok: false as const, raw: "", fatal: false, err };
        await sleep(Math.min(30, waitSeconds) * 1000);
        continue;
      }

      return { ok: false as const, raw: "", fatal: true, err };
    }
  }

  return { ok: false as const, raw: "", fatal: false, err: new Error("Retry loop exhausted") };
}

export async function POST(req: Request) {
  try {
    const { resumeText, jobDescription, company } = await req.json();

    if (!resumeText || !jobDescription || !company) {
      return NextResponse.json(
        { error: "Missing inputs: resumeText, jobDescription, company" },
        { status: 400 }
      );
    }

    // Accept either env var name (you’ve used both during debugging)
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_API_KEY (or GEMINI_API_KEY) in .env.local" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // ✅ Use Gemini 3 Flash API model name (preview) first.
    // Fallbacks help if a judge’s environment doesn’t have the preview enabled.
    const modelCandidates = [
      process.env.GEMINI_MODEL, // allow override
      "gemini-3-flash-preview", // <— correct for v1beta examples :contentReference[oaicite:1]{index=1}
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ].filter(Boolean) as string[];

    const prompt = `
You are Interviewee — an interview orchestration engine.

DECISION RULE (IMPORTANT):
- If role emphasizes coding / systems / data → behavioral_technical
- If role emphasizes strategy / product / business → behavioral_case
- NEVER return "mixed"

INPUTS
Company:
${company}

Resume:
${resumeText}

Job Description:
${jobDescription}

OUTPUT JSON ONLY. No markdown. No commentary.

SCHEMA (exact):
{
  "role_focus": ["top 5 skills being tested"],
  "likely_interview_type": "behavioral_technical" | "behavioral_case",
  "risk_gaps": ["specific resume vs JD gaps"],
  "company_notes": ["interview-relevant company insights"],
  "sample_questions": [
    { "type": "behavioral", "question": "..." },
    { "type": "technical", "question": "..." },
    { "type": "case", "question": "..." }
  ]
}
`.trim();

    let lastErr: any = null;
    let raw = "";

    for (const model of modelCandidates) {
      const out = await generateWithRetry(ai, model, prompt);

      if (out.ok) {
        raw = out.raw;
        break;
      }

      lastErr = out.err;

      // If it's 404 model-not-found, try next model candidate
      if (out.fatal === false) continue;
      if (out.fatal === true && (out.err?.status ?? out.err?.code) === 404) continue;

      // Other fatal errors: stop early
      return NextResponse.json(
        { error: out.err?.message ?? "Blueprint generation failed" },
        { status: 500 }
      );
    }

    if (!raw) {
      return NextResponse.json(
        {
          error: "No model succeeded (check GEMINI_MODEL / model availability).",
          detail: lastErr?.message ?? String(lastErr),
        },
        { status: 500 }
      );
    }

    const parsed = safeJsonParse<Blueprint>(raw);

    if (!parsed.ok) {
      return NextResponse.json(
        { error: "Invalid JSON from model", raw, parseError: parsed.error },
        { status: 200 }
      );
    }

    return NextResponse.json({ blueprint: parsed.data });
  } catch (err: any) {
    console.error("Blueprint API error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Blueprint generation failed" },
      { status: 500 }
    );
  }
}

