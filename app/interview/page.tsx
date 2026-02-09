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
  if (overall >= 85) return { label: "🟢 Strong", className: "border-green-600" };
  if (overall >= 70) return { label: "🟡 Good but sharpen", className: "border-yellow-600" };
  return { label: "🔴 Needs work", className: "border-red-600" };
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

    const nextTurns: Turn[] = [
      ...transcript,
      { role: "candidate", content: finalAnswer },
    ];

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
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Live Interview (Voice + Text)</h1>
          <p className="text-sm opacity-80">Day 5 — STAR detection + scorecard + rewritten answers</p>
        </div>

        <button onClick={() => router.push("/")} className="px-3 py-2 border rounded text-sm">
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
              onChange={(e) => setMode(e.target.value as Mode)}
              disabled={!ready || loading}
            >
              {allowedModes.includes("behavioral") && <option value="behavioral">Behavioral</option>}
              {allowedModes.includes("technical") && <option value="technical">Technical</option>}
              {allowedModes.includes("case") && <option value="case">Case</option>}
            </select>
            <p className="text-xs opacity-70 mt-1">
              This is limited by your blueprint: {blueprint?.likely_interview_type ?? "—"}.
            </p>
          </Card>

          {/* Voice Controls */}
          <div className="border rounded p-3 space-y-2">
            <div className="text-sm font-semibold">Voice controls</div>

            {!supportedSTT || !supportedTTS ? (
              <div className="text-xs text-red-600">Voice mode works best in Chrome or Edge.</div>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      stopSpeaking();
                      startListening();
                    }}
                    disabled={isListening || loading}
                    className="px-3 py-1 rounded border text-sm disabled:opacity-50"
                  >
                    🎙 Start Voice Answer
                  </button>

                  <button
                    onClick={() => {
                      stopListening();
                      stopSpeaking();
                    }}
                    disabled={!isListening && !isSpeaking}
                    className="px-3 py-1 rounded border text-sm disabled:opacity-50"
                  >
                    ⏹ Stop Voice
                  </button>

                  <button
                    onClick={readLastInterviewer}
                    disabled={loading || transcript.length === 0 || muted}
                    className="px-3 py-1 rounded border text-sm disabled:opacity-50"
                  >
                    🔊 Read Interviewer
                  </button>

                  <button
                    onClick={() => {
                      setMuted((m) => {
                        const next = !m;
                        if (next) stopSpeaking();
                        return next;
                      });
                    }}
                    className="px-3 py-1 rounded border text-sm"
                  >
                    {muted ? "🔈 Unmute" : "🔇 Mute"}
                  </button>
                </div>

                <div className="text-xs opacity-70">
                  {isListening ? "Listening…" : isSpeaking ? "Interviewer speaking…" : "Idle"}
                </div>
              </>
            )}
          </div>

          <button
            onClick={startInterview}
            disabled={!ready || loading}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {loading ? "Starting..." : "Start Interview"}
          </button>

          <Card title="Coach feedback">
            {!hasCandidateAnswered ? (
              <p className="text-xs opacity-70">Submit an answer to see coach feedback.</p>
            ) : (
              <pre className="text-xs whitespace-pre-wrap opacity-80">
                {coach
                  ? `Mode: ${coach.mode}\nSTAR: ${coach.star}\nMissing: ${coach.missing}\nWhy: ${coach.why}\nFollow-up intent: ${coach.intent}`
                  : "—"}
              </pre>
            )}
          </Card>

          <Card title="Scorecard">
            {!scorecard ? (
              <p className="text-xs opacity-70">Submit an answer to score.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-3xl font-bold">{overall}</div>
                  <div className={`px-2 py-1 border rounded text-xs ${badge.className}`}>
                    {badge.label}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold">STAR checklist</div>
                  <StarRow label="Situation" item={scorecard.star.situation} />
                  <StarRow label="Task" item={scorecard.star.task} />
                  <StarRow label="Action" item={scorecard.star.action} />
                  <StarRow label="Result" item={scorecard.star.result} />
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-semibold">Category scores</div>
                  <ScoreRow label="Clarity" value={scorecard.scores.clarity} />
                  <ScoreRow label="Structure" value={scorecard.scores.structure} />
                  <ScoreRow label="Impact" value={scorecard.scores.impact} />
                  <ScoreRow label="Role fit" value={scorecard.scores.roleFit} />
                </div>
              </div>
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
              value={isListening ? draftAnswer : answer}
              onChange={(e) => {
                setDraftAnswer(e.target.value);
                setAnswer(e.target.value);
              }}
              placeholder={
                mode === "behavioral"
                  ? "Type your answer or use 🎙 voice. Try STAR for behavioral."
                  : "Type your answer or use 🎙 voice."
              }
              disabled={!ready || loading}
            />

            <button
              onClick={submitAnswer}
              disabled={!ready || loading || !(draftAnswer || answer).trim()}
              className="mt-3 px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Submit Answer"}
            </button>

            <p className="text-xs opacity-70 mt-1">
              Tip: Speak → text appears → submit → Interviewer responds out loud.
            </p>
          </Card>

          {scorecard && (
            <>
              <Card title="Strengths">
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {(scorecard.strengths || []).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </Card>

              <Card title="Gaps to fix">
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {(scorecard.gaps || []).map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </Card>

              <Card title="Rewritten answer (STAR)">
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => copy(scorecard.rewrite.improvedAnswer)}
                    className="px-3 py-1 rounded border text-sm"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-sm whitespace-pre-wrap">{scorecard.rewrite.improvedAnswer}</pre>
              </Card>

              <Card title="Bullets to add next time">
                <ul className="space-y-2 text-sm">
                  {(scorecard.rewrite.bulletsToAdd || []).map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span>☐</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}

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

function StarRow({
  label,
  item,
}: {
  label: string;
  item: { present: boolean; evidence: string };
}) {
  return (
    <div className="border rounded p-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-xs">{item.present ? "✅" : "❌"}</div>
      </div>
      <div className="text-xs opacity-70 mt-1">{item.evidence}</div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(25, Number(value || 0)));
  return (
    <div className="flex items-center justify-between border rounded p-2">
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-xs">{v}/25</div>
    </div>
  );
}
