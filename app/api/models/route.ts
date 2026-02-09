import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 500 });

  const ai = new GoogleGenAI({ apiKey });

  // listModels exists in current Gemini API docs; if your installed SDK version differs,
  // you’ll immediately see a runtime error (also useful).
  const models = await (ai as any).models.list();
  return NextResponse.json({ models });
}
