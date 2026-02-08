import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

type Blueprint = {
  role_focus: string[];
  likely_interview_type: "behavioral" | "technical" | "mixed";
  risk_gaps: string[];
  sample_questions: { type: "behavioral" | "technical" | "case"; question: string }[];
  company_notes: string[];
};

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

export async function POST(req: Request) {
  try {
    const { resumeText, jdText, company } = await req.json();

    if (!resumeText || !jdText || !company) {
      return NextResponse.json(
        { error: "Missing required fields: resumeText, jdText, company" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in web/.env.local" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are Interviewee — an orchestrated interview simulation system.

GOAL:
Create an Interview Blueprint that proves orchestration (not a prompt wrapper).

INSTRUCTIONS:
- Use the Job Description as the primary signal for what will be tested.
- Use the Resume to personalize strengths and gaps.
- Use the Company to tailor priorities (values, products, interview style).
- Output must be VALID JSON ONLY (no markdown, no commentary).

INPUTS:
Company: ${company}

Resume:
${resumeText}

Job Description:
${jdText}

OUTPUT JSON schema (must match exactly):
{
  "role_focus": ["...top 5 skills being tested..."],
  "likely_interview_type": "behavioral" | "technical" | "mixed",
  "risk_gaps": ["...specific gaps between resume and JD..."],
  "company_notes": ["...what to know about the company for interview..."],
  "sample_questions": [
    { "type": "behavioral", "question": "..." },
    { "type": "technical", "question": "..." },
    { "type": "case", "question": "..." }
  ]
}
`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const raw = result.text ?? "";
    const parsed = safeJsonParse<Blueprint>(raw);

    if (!parsed.ok) {
      return NextResponse.json(
        { error: "Model did not return valid JSON", raw, parseError: parsed.error },
        { status: 200 } // 200 so UI can still show raw output for debugging
      );
    }

    return NextResponse.json({ blueprint: parsed.data });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

