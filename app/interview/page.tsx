"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Blueprint = any;

type Turn = {
  role: "interviewer" | "candidate";
  content: string;
};

export default function InterviewPage() {
  const router = useRouter();

  const [company, setCompany] = useState<string>("");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);

  const [mode, setMode] = useState<"behavioral" | "technical" | "case">(
    "behavioral"
  );

  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");

  const [coach, setCoach] = useState<any>(null);
  const [raw, setRaw] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [loading, setLoading] = useState(false);

  const ready = useMemo(() => Boolean(company && blueprint), [company, blueprint]);

  // Load blueprint from sessionStorage
  useEffect(() => {
    const bp = sessionStorage.getItem("interviewee_blueprint");
    const comp = sessionStorage.getItem("interviewee_company");

    if (!bp || !comp) {
      router.push("/");
      return;
    }

    const parsed = JSON.parse(bp);
    setBlueprint(parsed);
    setCompany(comp);

    // seed mode from blueprint
    const t = parsed?.likely_interview_type;
    if (t === "behavioral" || t === "technical") setMode(t);
    else setMode("behavioral");
  }, [router]);

  function transcriptStringFromTurns(turns: Turn[]) {
    return turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");
  }

  async function startInterview() {
    if (!ready) return;

    setLoading(true);
    setError("");
    setCoach(null);
    setRaw("");
    setTranscript([]);
    setAnswer("");

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "start",
          company,
          blueprint,
          mode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Start interview failed");
        setLoading(false);
        return;
      }

      if (data?.interviewer) {
        setTranscript([{ role: "interviewer", content: data.interviewer }]);
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    }

    setLoading(false);
  }

  async function submitAnswer() {
    if (!ready) return;
    if (!answer.trim()) return;
    if (transcript.length === 0) {
      setError("Click Start Interview first.");
      return;
    }

    setLoading(true);
    setError("");
    setRaw("");

    const nextTurns: Turn[] = [
      ...transcript,
      { role: "candidate", content: answer.trim() },
    ];

    setTranscript(nextTurns);
    setAnswer("");

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "followup",
          company,
          blueprint,
          mode,
          transcript: transcriptStringFromTurns(nextTurns),
          candidateAnswer: nextTurns[nextTurns.length - 1].content,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Follow-up failed");
        setLoading(false);
        return;
      }

      if (data?.interviewer) {
        setTranscript((prev) => [
          ...prev,
          { role: "interviewer", content: data.interviewer },
        ]);
      }

      // coach feedback only after answer
      if (data?.coach) setCoach(data.coach);

      if (data?.raw) setRaw(data.raw);
    } catch (e: any) {
      setError(e?.message || "Network error");
    }

    setLoading(false);
  }

  const hasCandidateAnswered = useMemo(
    () => transcript.some((t) => t.role === "candidate"),
    [transcript]
  );

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Live Interview (Text)</h1>
          <p className="text-sm opacity-80">
            Day 3 — adaptive questions + follow-ups + mode routing + session state
          </p>
        </div>

        <button
          onClick={() => router.push("/")}
          className="px-3 py-2 border rounded text-sm"
        >
          Back to Blueprint
        </button>
      </header>

      {error && (
        <div className="border rounded p-3 text-sm">
          <div className="font-semibold">Error</div>
          <div className="opacity-80">{error}</div>
        </div>
      )}

      <section className="grid md:grid-cols-3 gap-4">
        {/* LEFT */}
        <div className="space-y-4">
          <Card title="Company">
            <p>{company || "—"}</p>
          </Card>

          <Card title="Interview mode">
            <select
              className="w-full border rounded p-2"
              value={mode}
              onChange={(e) =>
                setMode(e.target.value as "behavioral" | "technical" | "case")
              }
              disabled={!ready || loading}
            >
              <option value="behavioral">Behavioral</option>
              <option value="technical">Technical</option>
              <option value="case">Case</option>
            </select>
            <p className="text-xs opacity-70 mt-1">
              Default seeded from blueprint. You can override for testing.
            </p>
          </Card>

          <button
            onClick={startInterview}
            disabled={!ready || loading}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {loading ? "Starting..." : "Start Interview"}
          </button>

          <Card title="Coach feedback">
            {!hasCandidateAnswered ? (
              <p className="text-xs opacity-70">
                Submit an answer to see coach feedback.
              </p>
            ) : (
              <pre className="text-xs whitespace-pre-wrap opacity-80">
                {coach
                  ? `Mode: ${coach.mode}\nSTAR: ${coach.star}\nMissing: ${coach.missing}\nWhy: ${coach.why}\nFollow-up intent: ${coach.intent}`
                  : "—"}
              </pre>
            )}
          </Card>
        </div>

        {/* RIGHT */}
        <div className="md:col-span-2 space-y-4">
          <Card title="Transcript">
            {transcript.length === 0 ? (
              <p className="text-sm opacity-70">Click “Start Interview” to begin.</p>
            ) : (
              <div className="space-y-3">
                {transcript.map((t, i) => (
                  <div key={i} className="border rounded p-3">
                    <div className="text-xs uppercase opacity-70">{t.role}</div>
                    <div className="text-sm">{t.content}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Your answer">
            <textarea
              className="w-full border rounded p-2 min-h-[120px]"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={
                mode === "behavioral"
                  ? "Type your answer. Try STAR for behavioral."
                  : "Type your answer."
              }
              disabled={!ready || loading}
            />

            <button
              onClick={submitAnswer}
              disabled={!ready || loading || !answer.trim()}
              className="mt-3 px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Submit Answer"}
            </button>

            <p className="text-xs opacity-70 mt-1">
              Tip: Answer → submit → interviewer follows up based on your response.
            </p>
          </Card>

          {raw && (
            <Card title="Debug (raw model output)">
              <pre className="text-xs whitespace-pre-wrap">{raw}</pre>
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

