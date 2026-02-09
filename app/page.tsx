"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InterviewType = "behavioral_technical" | "behavioral_case";

type Blueprint = {
  role_focus: string[];
  likely_interview_type: InterviewType;
  risk_gaps: string[];
  company_notes: string[];
  sample_questions: { type: "behavioral" | "technical" | "case"; question: string }[];
};

export default function Home() {
  const router = useRouter();

  
  const [company, setCompany] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [raw, setRaw] = useState<string>("");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);

  const canGenerate = useMemo(() => {
    return (
      company.trim().length > 1 &&
      resumeText.trim().length > 20 &&
      jobDescription.trim().length > 20
    );
  }, [company, resumeText, jobDescription]);

  function labelLikely(t: InterviewType) {
    return t === "behavioral_technical" ? "Behavioral + Technical" : "Behavioral + Case";
  }

  async function generateBlueprint() {
    setLoading(true);
    setError("");
    setRaw("");
    setBlueprint(null);

    try {
      const res = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, resumeText, jobDescription }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status})`);
        if (data?.raw) setRaw(data.raw);
        return;
      }

      if (data?.blueprint) {
        setBlueprint(data.blueprint);
        sessionStorage.setItem("interviewee_blueprint", JSON.stringify(data.blueprint));
        sessionStorage.setItem("interviewee_company", company);
        sessionStorage.setItem("interviewee_resumeText", resumeText);
        sessionStorage.setItem("interviewee_jobDescription", jobDescription);
      } else {
        setError(data?.error || "No blueprint returned");
        if (data?.raw) setRaw(data.raw);
      }
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Top bar (dark) */}
      <div className="border-b bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Interviewee</h1>

          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Gemini-powered
            </span>
          </div>
        </div>
      </div>

      {/* Dashboard layout */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* Left panel */}
          <aside className="lg:sticky lg:top-6 h-fit">
            <Panel>
              <div className="space-y-1">
                <h2 className="text-sm font-semibold">Inputs</h2>
                <p className="text-xs text-black/60">
                  Paste your info, generate a blueprint, then run a live interview.
                </p>
              </div>

              <Divider />

              <Field label="Company">
                <input
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-emerald-200 focus:border-emerald-500"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g., Google, Shopify, Deloitte"
                />
              </Field>

              <Field label="Resume (paste text)">
                <textarea
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm min-h-[160px] resize-y outline-none focus:ring-4 focus:ring-emerald-200 focus:border-emerald-500"
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your resume text here…"
                />
              </Field>

              <Field label="Job Description (paste text)">
                <textarea
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm min-h-[160px] resize-y outline-none focus:ring-4 focus:ring-emerald-200 focus:border-emerald-500"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the job description here…"
                />
              </Field>

              <button
                onClick={generateBlueprint}
                disabled={!canGenerate || loading}
                className="w-full rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600"
              >
                {loading ? "Generating…" : "Generate Interview Blueprint"}
              </button>

              <div className="rounded-xl border bg-neutral-50 p-3">
                <p className="text-xs text-black/60">
                  <span className="font-semibold text-black/70">Tip:</span> Use your real resume +
                  the real JD for the most convincing “judge flow”.
                </p>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
                  <div className="font-semibold text-red-700 mb-1">Error</div>
                  <div className="text-red-700/90 whitespace-pre-wrap break-words">{error}</div>
                </div>
              )}
            </Panel>
          </aside>

          {/* Right panel */}
          <section className="space-y-6">
            {!blueprint ? (
              <Panel>
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">Reasoning dashboard</h2>
                      <p className="text-sm text-black/60">
                        Your blueprint appears here (role focus, gaps, interview type, sample questions).
                      </p>
                    </div>
                    <span className="hidden sm:inline-flex rounded-full border bg-white px-3 py-1 text-xs text-black/60">
                      Step 1 → Generate blueprint
                    </span>
                  </div>

                  <div className="mt-4 grid sm:grid-cols-2 gap-3">
                    <SkeletonCard title="Likely interview type" />
                    <SkeletonCard title="Role focus" />
                    <SkeletonCard title="Risk gaps" />
                    <SkeletonCard title="Company notes" />
                  </div>
                </div>
              </Panel>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold">Reasoning dashboard</h2>
                    <p className="text-xs text-black/60">
                      This is the “judge explanation layer” — what the model inferred and why.
                    </p>
                  </div>

                  <span className="inline-flex items-center rounded-full border bg-white px-3 py-1 text-xs font-semibold text-black/70">
                    {labelLikely(blueprint.likely_interview_type)}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Card title="Role focus (what they’ll test)">
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      {blueprint.role_focus.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </Card>

                  <Card title="Company notes (what to know)">
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      {blueprint.company_notes.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </Card>

                  <Card title="Risk gaps (what to strengthen)">
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      {blueprint.risk_gaps.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </Card>

                  <Card title="Likely interview type">
                    <div className="text-sm text-black/70">
                      Your strongest “live interview” mode is already selected based on this.
                    </div>
                    <div className="mt-3 inline-flex items-center rounded-full border bg-neutral-50 px-3 py-1 text-xs font-semibold">
                      {labelLikely(blueprint.likely_interview_type)}
                    </div>
                  </Card>
                </div>

                <Card title="Sample questions (preview)">
                  <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
                    {blueprint.sample_questions.map((q, i) => (
                      <div key={i} className="rounded-xl border bg-white p-3">
                        <div className="text-[11px] font-semibold tracking-wider text-black/50 uppercase">
                          {q.type}
                        </div>
                        <div className="text-sm">{q.question}</div>
                      </div>
                    ))}
                  </div>
                </Card>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => router.push("/interview")}
                    className="rounded-xl bg-black text-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-black/90"
                  >
                    Start Interview
                  </button>

                  <button
                    onClick={() => {
                      setBlueprint(null);
                      setRaw("");
                      setError("");
                    }}
                    className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold hover:bg-neutral-50"
                  >
                    Reset
                  </button>
                </div>
              </>
            )}

            {raw && (
              <Panel>
                <div className="text-sm font-semibold mb-2">Raw model output (debug)</div>
                <pre className="whitespace-pre-wrap text-xs text-black/70">{raw}</pre>
              </Panel>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/* ---------- UI helpers ---------- */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4 md:p-5 space-y-4 shadow-sm">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-black/10" />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-black/70">{label}</label>
      {children}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4 md:p-5 space-y-2 shadow-sm">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div>{children}</div>
    </div>
  );
}

function SkeletonCard({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-5/6 rounded bg-black/10" />
        <div className="h-3 w-4/6 rounded bg-black/10" />
        <div className="h-3 w-3/6 rounded bg-black/10" />
      </div>
    </div>
  );
}
