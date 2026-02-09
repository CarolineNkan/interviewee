import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

type Mode = "behavioral" | "technical" | "case";

type Scorecard = {
  mode: Mode;
  star: {
    situation: { present: boolean; evidence: string };
    task: { present: boolean; evidence: string };
    action: { present: boolean; evidence: string };
    result: { present: boolean; evidence: string };
  };
  scores: {
    overall: number;
    clarity: number;
    structure: number;
    impact: number;
    roleFit: number;
  };
  strengths: string[];
  gaps: string[];
  rewrite: {
    improvedAnswer: string;
    bulletsToAdd: string[];
  };
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateWithRetry(ai: GoogleGenAI, model: string, text: string) {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text }] }],
      });

      const raw =
        typeof (result as any)?.text === "function"
          ? (result as any).text()
          : (result as any)?.text ?? "";

      return { ok: true as const, raw };
    } catch (err: any) {
      const status = err?.status ?? err?.code;
      const msg = err?.message ?? "";

      // 404 model name wrong -> don't retry this model
      if (status === 404) return { ok: false as const, fatal: true, err };

      // 429/503 -> backoff a bit
      if (status === 429 || status === 503) {
        if (attempt === maxRetries) return { ok: false as const, fatal: false, err };
        const match = msg.match(/retry in\s+([\d.]+)s/i);
        const waitS = match ? Number(match[1]) : 2 + attempt * 2;
        await sleep(Math.min(20, waitS) * 1000);
        continue;
      }

      return { ok: false as const, fatal: true, err };
    }
  }

  return { ok: false as const, fatal: false, err: new Error("Retry exhausted") };
}

function safeJsonParse<T>(raw: string): { ok: true; data: T } | { ok: false; error: string } {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const sliced = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
    return { ok: true, data: JSON.parse(sliced) as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Failed to parse JSON" };
  }
}

// super lightweight STAR detector (no model needed)
function starDetect(answer: string) {
  const t = (answer || "").toLowerCase();
  const hasSituation = /(when|at the time|in my role|we had|the context|situation)/i.test(answer);
  const hasTask = /(my task|goal|responsible for|i needed to|objective)/i.test(answer);
  const hasAction = /(i did|i led|i built|i analyzed|i created|i implemented|i coordinated|i communicated)/i.test(answer);
  const hasResult = /(result|impact|increased|reduced|improved|grew|decreased|%|percent|\d+)/i.test(answer);

  return {
    situation: { present: hasSituation, evidence: hasSituation ? "Mentions context." : "Add 1 line of context." },
    task: { present: hasTask, evidence: hasTask ? "States goal/ownership." : "Add your goal + responsibility." },
    action: { present: hasAction, evidence: hasAction ? "Shows what you did." : "Add 2–3 concrete actions." },
    result: { present: hasResult, evidence: hasResult ? "Shows outcomes/metrics." : "Add outcome + metric." },
  };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const step: "start" | "followup" = body?.step;
    const company: string = body?.company ?? "";
    const mode: Mode = body?.mode ?? "behavioral";
    const blueprint = body?.blueprint ?? null;

    if (!step || !company || !blueprint) {
      return NextResponse.json(
        { error: "Missing required fields: step, company, blueprint" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_API_KEY (or GEMINI_API_KEY) in .env.local" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const modelCandidates = [
      process.env.GEMINI_MODEL,
      "gemini-3-flash-preview",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ].filter(Boolean) as string[];

    // --- START: return first question immediately ---
    if (step === "start") {
      const seed =
        (blueprint?.sample_questions || [])
          .filter((q: any) => q?.type === mode)
          .map((q: any) => q?.question)
          .slice(0, 2)
          .join("\n- ") || "";

      const prompt = `
You are the interviewer for ${company}.
Mode: ${mode.toUpperCase()}.

Blueprint focus:
- role_focus: ${(blueprint?.role_focus || []).join(", ")}
- risk_gaps: ${(blueprint?.risk_gaps || []).join(", ")}

Task:
Ask ONE strong first interview question for this mode.
- Keep it concise (1–2 sentences).
- No preamble.
- If behavioral: prefer a conflict/stakeholder/impact STAR-style prompt.
- If technical: pick a practical question aligned to the role focus.
- If case: pick a product/strategy case aligned to the role focus.

If helpful, you may adapt one of these sample questions:
- ${seed}

Return ONLY the question text.
`.trim();

      let lastErr: any = null;
      for (const model of modelCandidates) {
        const out = await generateWithRetry(ai, model, prompt);
        if (out.ok) {
          const q = (out.raw || "").trim();
          return NextResponse.json({ interviewer: q || "Tell me about yourself and why this role." });
        }
        lastErr = out.err;
        // try next model if 404
        if ((out.err?.status ?? out.err?.code) === 404) continue;
        // for other errors, stop
        return NextResponse.json({ error: out.err?.message ?? "Interview start failed" }, { status: 500 });
      }
      return NextResponse.json({ error: lastErr?.message ?? "No model succeeded" }, { status: 500 });
    }

    // --- FOLLOWUP: return follow-up + coach + scorecard ---
    const transcript: string = body?.transcript ?? "";
    const candidateAnswer: string = body?.candidateAnswer ?? "";

    if (!transcript || !candidateAnswer) {
      return NextResponse.json(
        { error: "Missing required fields for followup: transcript, candidateAnswer" },
        { status: 400 }
      );
    }

    // Create a follow-up question
    const followPrompt = `
You are the interviewer for ${company}.
Mode: ${mode.toUpperCase()}.

Given the transcript below, ask ONE follow-up question that tests depth and closes gaps.
Keep it 1 sentence.

Transcript:
${transcript}

Return ONLY the follow-up question text.
`.trim();

    let followQ = "";
    let lastErr: any = null;

    for (const model of modelCandidates) {
      const out = await generateWithRetry(ai, model, followPrompt);
      if (out.ok) {
        followQ = (out.raw || "").trim();
        break;
      }
      lastErr = out.err;
      if ((out.err?.status ?? out.err?.code) === 404) continue;
      return NextResponse.json({ error: out.err?.message ?? "Follow-up failed" }, { status: 500 });
    }

    // Lightweight STAR + scoring (fast, reliable, no extra quota)
    const star = starDetect(candidateAnswer);

    const starCount =
      Number(star.situation.present) +
      Number(star.task.present) +
      Number(star.action.present) +
      Number(star.result.present);

    const clarity = clamp(10 + starCount * 3, 0, 25);
    const structure = clamp(8 + starCount * 4, 0, 25);
    const impact = clamp(6 + (star.result.present ? 12 : 3), 0, 25);
    const roleFit = clamp(10 + (mode === "behavioral" ? 6 : 4), 0, 25);
    const overall = clamp(Math.round((clarity + structure + impact + roleFit) / 1), 0, 100);

    const strengths: string[] = [];
    const gaps: string[] = [];

    if (star.situation.present) strengths.push("You set context (Situation).");
    else gaps.push("Add 1 sentence of context (Situation).");

    if (star.task.present) strengths.push("You stated your goal/ownership (Task).");
    else gaps.push("State your goal + what success looked like (Task).");

    if (star.action.present) strengths.push("You included concrete actions (Action).");
    else gaps.push("Add 2–3 specific actions you took (Action).");

    if (star.result.present) strengths.push("You included outcome/impact (Result).");
    else gaps.push("Add a measurable result (metric, % change, time saved).");

    const improvedAnswer =
      mode === "behavioral"
        ? `Situation: [1 line context]\nTask: [your goal + ownership]\nAction: [2–3 steps you took]\nResult: [metric + impact + what you learned]`
        : `Answer: [clear approach]\nTrade-offs: [2–3]\nDecision: [what you’d choose + why]\nValidation: [how you’d test/measure]`;

    const scorecard: Scorecard = {
      mode,
      star,
      scores: { overall, clarity, structure, impact, roleFit },
      strengths,
      gaps,
      rewrite: {
        improvedAnswer,
        bulletsToAdd: [
          "Add one hard metric (%, $, time saved).",
          "Call out a trade-off and why you chose your approach.",
          "Mention stakeholder alignment or validation step.",
        ],
      },
    };

    const coach = {
      mode,
      star: `S:${star.situation.present ? "Y" : "N"} T:${star.task.present ? "Y" : "N"} A:${star.action.present ? "Y" : "N"} R:${star.result.present ? "Y" : "N"}`,
      missing: gaps.slice(0, 2).join(" | ") || "None",
      why: "Strong answers are structured and measurable. STAR makes it easy to evaluate quickly.",
      intent: "Follow-up targets depth and validates your claim.",
    };

    return NextResponse.json({
      interviewer: followQ || "What was the biggest challenge, and how did you handle it?",
      coach,
      scorecard,
    });
  } catch (err: any) {
    console.error("Interview API error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Interview failed" },
      { status: 500 }
    );
  }
}
