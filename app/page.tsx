"use client";

import { useMemo, useState } from "react";

type Blueprint = {
  role_focus: string[];
  likely_interview_type: "behavioral" | "technical" | "mixed";
  risk_gaps: string[];
  company_notes: string[];
  sample_questions: { type: "behavioral" | "technical" | "case"; question: string }[];
};

const MOCK_RESUME = `Caroline Nkan
- Led cross-functional projects and stakeholder communication
- Built dashboards and presented insights
- Tools: Excel, Power BI, SQL, Next.js
`;

const MOCK_JD = `Associate Product Manager
Responsibilities: define requirements, analyze metrics, work cross-functionally, communicate clearly.
Qualifications: analytics, execution, user empathy, stakeholder management.
`;

export default function Home() {
  const [company, setCompany] = useState("Google");
  const [resumeText, setResumeText] = useState(MOCK_RESUME);
  const [jdText, setJdText] = useState(MOCK_JD);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [raw, setRaw] = useState<string>("");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);

  const canGenerate = useMemo(() => {
    return company.trim().length > 1 && resumeText.trim().length > 20 && jdText.trim().length > 20;
  }, [company, resumeText, jdText]);

  async function generateBlueprint() {
    setLoading(true);
    setError("");
    setRaw("");
    setBlueprint(null);

    const res = await fetch("/api/blueprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, resumeText, jdText }),
    });

    const data = await res.json();

    if (data?.blueprint) {
      setBlueprint(data.blueprint);
      // store for Day 3
      sessionStorage.setItem("interviewee_blueprint", JSON.stringify(data.blueprint));
      sessionStorage.setItem("interviewee_company", company);
    } else {
      setError(data?.error || "No blueprint returned");
      if (data?.raw) setRaw(data.raw);
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Interviewee</h1>
        <p className="text-sm opacity-80">
          Day 2 — Interview Blueprint Engine (judges can see reasoning)
        </p>
      </header>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Company</label>
            <input
              className="w-full border rounded p-2"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g., Google or a company URL"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Resume (paste text for now)</label>
            <textarea
              className="w-full border rounded p-2 min-h-[180px]"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Job Description</label>
            <textarea
              className="w-full border rounded p-2 min-h-[180px]"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
            />
          </div>

          <button
            onClick={generateBlueprint}
            disabled={!canGenerate || loading}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate Interview Blueprint"}
          </button>

          {error && (
            <div className="border rounded p-3 text-sm">
              <p className="font-semibold">Error</p>
              <p className="opacity-80">{error}</p>
            </div>
          )}
        </div>

        <div className="md:col-span-2 space-y-4">
          {!blueprint ? (
            <div className="border rounded p-6 text-sm opacity-80">
              Paste your inputs and generate a blueprint. This screen will become the “reasoning dashboard.”
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <Card title="Likely interview type">
                  <span className="inline-block px-2 py-1 border rounded text-sm">
                    {blueprint.likely_interview_type.toUpperCase()}
                  </span>
                </Card>

                <Card title="Role focus (what they’ll test)">
                  <ul className="list-disc pl-5 space-y-1">
                    {blueprint.role_focus.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </Card>

                <Card title="Risk gaps (what to strengthen)">
                  <ul className="list-disc pl-5 space-y-1">
                    {blueprint.risk_gaps.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </Card>

                <Card title="Company notes (what to know)">
                  <ul className="list-disc pl-5 space-y-1">
                    {blueprint.company_notes.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </Card>
              </div>

              <Card title="Sample questions (preview)">
                <div className="space-y-3">
                  {blueprint.sample_questions.map((q, i) => (
                    <div key={i} className="border rounded p-3">
                      <div className="text-xs uppercase opacity-70">{q.type}</div>
                      <div className="text-sm">{q.question}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="flex gap-3">
                <button
                  onClick={() => alert("Day 3: this will route to /interview")}
                  className="px-4 py-2 rounded bg-black text-white"
                >
                  Start Interview (Day 3)
                </button>

                <button
                  onClick={() => {
                    setBlueprint(null);
                    setRaw("");
                    setError("");
                  }}
                  className="px-4 py-2 rounded border"
                >
                  Reset
                </button>
              </div>
            </>
          )}

          {raw && (
            <Card title="Raw model output (debug)">
              <pre className="whitespace-pre-wrap text-xs">{raw}</pre>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded p-4 space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="text-sm">{children}</div>
    </div>
  );
}
