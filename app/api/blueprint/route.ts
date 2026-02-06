import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: Request) {
  try {
    const { resumeText, jdText, company } = await req.json();

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

TASK:
Analyze the resume, job description, and company.
Create an INTERVIEW BLUEPRINT for a mock interview.

Resume:
${resumeText}

Job Description:
${jdText}

Company:
${company}

Return JSON ONLY in this exact structure:
{
  "role_focus": ["skill 1", "skill 2", "skill 3"],
  "likely_interview_type": "behavioral | technical | mixed",
  "risk_gaps": ["gap 1", "gap 2"],
  "sample_questions": [
    { "type": "behavioral", "question": "..." },
    { "type": "technical", "question": "..." }
  ]
}
`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "IMPORTANT: Output must be valid JSON only. No markdown. No commentary.\n\n" +
                prompt,
            },
          ],
        },
      ],
    });

    return NextResponse.json({ output: result.text });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

