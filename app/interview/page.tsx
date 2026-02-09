"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type InterviewType = "behavioral_technical" | "behavioral_case";
type Mode = "behavioral" | "technical" | "case";

type Blueprint = {
  role_focus: string[];
  likely_interview_type: InterviewType;
  risk_gaps: string[];
  company_notes: string[];
  sample_questions: { type: "behavioral" | "technical" | "case"; question: string }[];
};

type Turn = {
  role: "interviewer" | "candidate";
  content: string;
};

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

function badgeForScore(overall: number) {
  if (overall >= 85) return { label: "🟢 Strong", className: "border-emerald-500 bg-emerald-50 text-emerald-700" };
  if (overall >= 70) return { label: "🟡 Good but sharpen", className: "border-yellow-500 bg-yellow-50 text-yellow-800" };
  return { label: "🔴 Needs work", className: "border-red-500 bg-red-50 text-red-700" };
}

export default function InterviewPage() {
  const router = useRouter();

  const [company, setCompany] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);

  const [mode, setMode] = useState<Mode>("behavioral");

  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");

  const [coach, setCoach] = useState<any>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);

  const [raw, setRaw] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [loading, setLoading] = useState(false);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [supportedSTT, setSupportedSTT] = useState(true);
  const [supportedTTS, setSupportedTTS] = useState(true);
  const [muted, setMuted] = useState(false);

  const recognitionRef = useRef<any>(null);
  const [draftAnswer, setDraftAnswer] = useState("");
  const speakingRef = useRef(false);

  const ready = useMemo(
    () => Boolean(company && resumeText && jobDescription && blueprint),
    [company, resumeText, jobDescription, blueprint]
  );

  const allowedModes = useMemo<Mode[]>(() => {
    if (!blueprint) return ["behavioral", "technical", "case"];
    return blueprint.likely_interview_type === "behavioral_technical"
      ? ["behavioral", "technical"]
      : ["behavioral", "case"];
  }, [blueprint]);

  useEffect(() => {
    const bp = sessionStorage.getItem("interviewee_blueprint");
    const comp = sessionStorage.getItem("interviewee_company");
    const res = sessionStorage.getItem("interviewee_resumeText");
    const jd = sessionStorage.getItem("interviewee_jobDescription");

    if (!bp || !comp || !res || !jd) {
      router.push("/");
      return;
    }

    const parsed = JSON.parse(bp) as Blueprint;
    setBlueprint(parsed);
    setCompany(comp);
    setResumeText(res);
    setJobDescription(jd);

    // default mode
    if (parsed?.likely_interview_type === "behavioral_technical") setMode("behavioral");
    else setMode("behavioral");
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const w = window as any;
    const hasSTT = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    const hasTTS = !!window.speechSynthesis;

    setSupportedSTT(hasSTT);
    setSupportedTTS(hasTTS);
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Voice helpers --------
  function getSpeechRecognition(): any | null {
    if (typeof window === "undefined") return null;
    const w = window as any;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }

  function stopSpeaking() {
    if (typeof window === "undefined") return;
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setIsSpeaking(false);
  }

  function firstOneTwoSentences(text: string) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    const parts = cleaned.split(/(?<=[.!?])\s+/);
    return parts.slice(0, 2).join(" ");
  }

  function speak(text: string) {
    if (typeof window === "undefined") return;
    if (!window.speechSynthesis) return;
    if (muted) return;

    const toSay = firstOneTwoSentences(text);
    if (!toSay) return;

    stopSpeaking();

    const u = new SpeechSynthesisUtterance(toSay);
    u.rate = 1.0;
    u.pitch = 1.0;

    u.onstart = () => {
      speakingRef.current = true;
      setIsSpeaking(true);
    };
    u.onend = () => {
      speakingRef.current = false;
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(u);
  }

  function startListening() {
    const SR = getSpeechRecognition();
    if (!SR) {
      alert("Speech recognition not supported. Use Chrome or Edge.");
      return;
    }

    stopSpeaking();

    const rec = new SR();
    recognitionRef.current = rec;

    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    let finalText = "";

    rec.onresult = (event: any) => {
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }

      const merged = (finalText + interim).trim();
      setDraftAnswer(merged);
      setAnswer(merged);
    };

    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);

    setIsListening(true);
    rec.start();
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setIsListening(false);
  }

  function readLastInterviewer() {
    const last = [...transcript].reverse().find((t) => t.role === "interviewer");
    if (!last) return;
    speak(last.content);
  }

  // -------- App logic --------
  function transcriptStringFromTurns(turns: Turn[]) {
    return turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");
  }

  async function startInterview() {
    if (!ready) return;

    setLoading(true);
    setError("");
    setCoach(null);
    setScorecard(null);
    setRaw("");
    setTranscript([]);
    setAnswer("");
    setDraftAnswer("");

    stopListening();
    stopSpeaking();

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "start",
          company,
          resumeText,
          jobDescription,
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
        const q = data.interviewer as string;
        setTranscript([{ role: "interviewer", content: q }]);
        setTimeout(() => speak(q), 250);
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    }

    setLoading(false);
  }

  async function submitAnswer() {
    if (!ready) return;

    const finalAnswer = (draftAnswer || answer).trim();
    if (!finalAnswer) return;

    if (transcript.length === 0) {
      setError("Click Start Interview first.");
      return;
    }

    setLoading(true);
    setError("");
    setRaw("");

    stopListening();

    const nextTurns: Turn[] = [...transcript, { role: "candidate", content: finalAnswer }];

    setTranscript(nextTurns);
    setAnswer("");
    setDraftAnswer("");

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "followup",
          company,
          resumeText,
          jobDescription,
          blueprint,
          mode,
          transcript: transcriptStringFromTurns(nextTurns),
          candidateAnswer: finalAnswer,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Follow-up failed");
        setLoading(false);
        return;
      }

      if (data?.interviewer) {
        const q = data.interviewer as string;
        setTranscript((prev) => [...prev, { role: "interviewer", content: q }]);
        setTimeout(() => speak(q), 250);
      }

      if (data?.coach) setCoach(data.coach);
      if (data?.scorecard) setScorecard(data.scorecard);
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

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied!");
    } catch {
      alert("Copy failed (browser permission).");
    }
  }

  const overall = scorecard?.scores?.overall ?? 0;
  const badge = badgeForScore(overall);

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Top bar (match homepage) */}
      <div className="border-b bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Live Interview (Voice + Text)</h1>
        
    
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden md:inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Gemini-powered
            </span>

            <button
              onClick={() => router.push("/")}
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Back to Blueprint
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
            <div className="font-semibold text-red-700">Error</div>
            <div className="text-red-700/90 whitespace-pre-wrap break-words">{error}</div>
          </div>
        )}

        <section className="grid lg:grid-cols-[440px_1fr] gap-6">
          {/* LEFT */}
          <aside className="lg:sticky lg:top-6 h-fit space-y-4">
            <Panel>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Session</h2>
                  <p className="text-xs text-black/60">
                    Start → answer → follow-up → feedback.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border bg-white px-3 py-1 text-xs text-black/60">
                  {loading ? "Running…" : "Ready"}
                </span>
              </div>

              <Divider />

              <div className="grid gap-3">
                <MiniStat label="Company" value={company || "—"} />
                <MiniStat
                  label="Mode"
                  value={mode.charAt(0).toUpperCase() + mode.slice(1)}
                  hint={blueprint?.likely_interview_type ? `Blueprint: ${blueprint.likely_interview_type}` : ""}
                />
              </div>

              <Divider />

              <Field label="Interview mode">
                <select
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-emerald-200 focus:border-emerald-500"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  disabled={!ready || loading}
                >
                  {allowedModes.includes("behavioral") && <option value="behavioral">Behavioral</option>}
                  {allowedModes.includes("technical") && <option value="technical">Technical</option>}
                  {allowedModes.includes("case") && <option value="case">Case</option>}
                </select>
                <p className="text-xs text-black/50 mt-1">
                  Limited by blueprint: {blueprint?.likely_interview_type ?? "—"}.
                </p>
              </Field>

              {/* Voice Controls */}
              <div className="rounded-2xl border bg-white p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Voice controls</div>
                  <span className="text-xs text-black/50">
                    {isListening ? "Listening…" : isSpeaking ? "Speaking…" : "Idle"}
                  </span>
                </div>

                {!supportedSTT || !supportedTTS ? (
                  <div className="text-xs text-red-600">
                    Voice works best in Chrome or Edge.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Btn
                      onClick={() => {
                        stopSpeaking();
                        startListening();
                      }}
                      disabled={isListening || loading}
                    >
                      🎙 Start Voice
                    </Btn>

                    <Btn
                      onClick={() => {
                        stopListening();
                        stopSpeaking();
                      }}
                      disabled={!isListening && !isSpeaking}
                    >
                      ⏹ Stop
                    </Btn>

                    <Btn onClick={readLastInterviewer} disabled={loading || transcript.length === 0 || muted}>
                      🔊 Read
                    </Btn>

                    <Btn
                      onClick={() => {
                        setMuted((m) => {
                          const next = !m;
                          if (next) stopSpeaking();
                          return next;
                        });
                      }}
                    >
                      {muted ? "🔈 Unmute" : "🔇 Mute"}
                    </Btn>
                  </div>
                )}
              </div>

              <button
                onClick={startInterview}
                disabled={!ready || loading}
                className="w-full rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? "Starting…" : "Start Interview"}
              </button>

              <div className="rounded-xl border bg-neutral-50 p-3">
                <p className="text-xs text-black/60">
                  Tip: Speak → text appears → submit → interviewer responds aloud.
                </p>
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-semibold">Coach feedback</h2>
              {!hasCandidateAnswered ? (
                <p className="text-xs text-black/60">Submit an answer to see feedback.</p>
              ) : (
                <pre className="text-xs whitespace-pre-wrap text-black/70">
                  {coach
                    ? `Mode: ${coach.mode}\nSTAR: ${coach.star}\nMissing: ${coach.missing}\nWhy: ${coach.why}\nFollow-up intent: ${coach.intent}`
                    : "—"}
                </pre>
              )}
            </Panel>

            <Panel>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Scorecard</h2>
                {scorecard ? (
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                ) : null}
              </div>

              {!scorecard ? (
                <p className="text-xs text-black/60">Submit an answer to score.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-black/50">Overall</div>
                      <div className="text-4xl font-bold">{overall}</div>
                    </div>

                    <div className="text-right text-xs text-black/50">
                      Out of 100
                    </div>
                  </div>

                  <Divider />

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-black/70">STAR checklist</div>
                    <StarRow label="Situation" item={scorecard.star.situation} />
                    <StarRow label="Task" item={scorecard.star.task} />
                    <StarRow label="Action" item={scorecard.star.action} />
                    <StarRow label="Result" item={scorecard.star.result} />
                  </div>

                  <Divider />

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-black/70">Category scores</div>
                    <ScoreRow label="Clarity" value={scorecard.scores.clarity} />
                    <ScoreRow label="Structure" value={scorecard.scores.structure} />
                    <ScoreRow label="Impact" value={scorecard.scores.impact} />
                    <ScoreRow label="Role fit" value={scorecard.scores.roleFit} />
                  </div>
                </div>
              )}
            </Panel>
          </aside>

          {/* RIGHT */}
          <section className="space-y-6">
            <Panel>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Transcript</h2>
                  <p className="text-xs text-black/60">
                    Interviewer ↔ candidate turns.
                  </p>
                </div>
                <span className="text-xs text-black/50">
                  {transcript.length ? `${transcript.length} turns` : "No turns yet"}
                </span>
              </div>

              <Divider />

              {transcript.length === 0 ? (
                <p className="text-sm text-black/60">Click “Start Interview” to begin.</p>
              ) : (
                <div className="space-y-3">
                  {transcript.map((t, i) => (
                    <div
                      key={i}
                      className={`rounded-2xl border p-4 ${
                        t.role === "interviewer"
                          ? "bg-white"
                          : "bg-emerald-50 border-emerald-200"
                      }`}
                    >
                      <div className="text-[11px] font-semibold tracking-wider text-black/50 uppercase">
                        {t.role}
                      </div>
                      <div className="text-sm mt-1">{t.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel>
              <h2 className="text-sm font-semibold">Your answer</h2>
              <p className="text-xs text-black/60">
                Type or use voice. For behavioral, try STAR.
              </p>

              <Divider />

              <textarea
                className="w-full rounded-2xl border bg-white p-3 text-sm min-h-[140px] outline-none focus:ring-4 focus:ring-emerald-200 focus:border-emerald-500"
                value={isListening ? draftAnswer : answer}
                onChange={(e) => {
                  setDraftAnswer(e.target.value);
                  setAnswer(e.target.value);
                }}
                placeholder={
                  mode === "behavioral"
                    ? "Situation… Task… Action… Result…"
                    : "Type your answer…"
                }
                disabled={!ready || loading}
              />

              <div className="mt-3 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={submitAnswer}
                  disabled={!ready || loading || !(draftAnswer || answer).trim()}
                  className="rounded-xl bg-black text-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-black/90 disabled:opacity-50"
                >
                  {loading ? "Thinking…" : "Submit Answer"}
                </button>

                <button
                  onClick={() => {
                    setAnswer("");
                    setDraftAnswer("");
                  }}
                  disabled={loading || (!(draftAnswer || answer).trim() && !isListening)}
                  className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </Panel>

            {scorecard && (
              <div className="grid md:grid-cols-2 gap-6">
                <Panel>
                  <h2 className="text-sm font-semibold">Strengths</h2>
                  <Divider />
                  <ul className="list-disc pl-5 space-y-2 text-sm">
                    {(scorecard.strengths || []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </Panel>

                <Panel>
                  <h2 className="text-sm font-semibold">Gaps to fix</h2>
                  <Divider />
                  <ul className="list-disc pl-5 space-y-2 text-sm">
                    {(scorecard.gaps || []).map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </Panel>

                <Panel>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">Rewritten answer (STAR)</h2>
                    <button
                      onClick={() => copy(scorecard.rewrite.improvedAnswer)}
                      className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-neutral-50"
                    >
                      Copy
                    </button>
                  </div>
                  <Divider />
                  <pre className="text-sm whitespace-pre-wrap text-black/80">
                    {scorecard.rewrite.improvedAnswer}
                  </pre>
                </Panel>

                <Panel>
                  <h2 className="text-sm font-semibold">Bullets to add next time</h2>
                  <Divider />
                  <ul className="space-y-2 text-sm">
                    {(scorecard.rewrite.bulletsToAdd || []).map((b, i) => (
                      <li key={i} className="flex gap-2">
                        <span>☐</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            )}

            {raw && (
              <Panel>
                <h2 className="text-sm font-semibold">Debug (raw model output)</h2>
                <Divider />
                <pre className="text-xs whitespace-pre-wrap text-black/70">{raw}</pre>
              </Panel>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

/* ---------- UI helpers (design-only) ---------- */

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border bg-white p-4 md:p-5 space-y-4 shadow-sm">{children}</div>;
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

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const isLong = value.length > 80;

  return (
    <div className="rounded-2xl border bg-neutral-50 p-3">
      <div className="text-xs font-semibold text-black/60">{label}</div>

      {/* Scroll inside card when text is long */}
      <div
        className={[
          "mt-1 text-sm font-semibold",
          isLong ? "max-h-[140px] overflow-auto pr-1 whitespace-pre-wrap leading-relaxed" : "",
        ].join(" ")}
      >
        {value}
      </div>

      {hint ? <div className="text-xs text-black/50 mt-1">{hint}</div> : null}
    </div>
  );
}


function StarRow({
  label,
  item,
}: {
  label: string;
  item: { present: boolean; evidence: string };
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-xs">{item.present ? "✅" : "❌"}</div>
      </div>
      <div className="text-xs text-black/60 mt-1">{item.evidence}</div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(25, Number(value || 0)));
  return (
    <div className="flex items-center justify-between rounded-xl border bg-white p-3">
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-xs text-black/60">{v}/25</div>
    </div>
  );
}
