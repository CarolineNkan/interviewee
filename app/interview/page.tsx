"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  // ✅ Day 4 voice state (Step 1 + Step 2 STT + Step 3 TTS)
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [supportedSTT, setSupportedSTT] = useState(true);
  const [supportedTTS, setSupportedTTS] = useState(true);
  const [muted, setMuted] = useState(false);

  // ✅ Step 2 STT: live dictation buffer
  const recognitionRef = useRef<any>(null);
  const [draftAnswer, setDraftAnswer] = useState("");

  // ✅ Step 3 TTS: speaking state
  const speakingRef = useRef(false);

  const ready = useMemo(() => Boolean(company && blueprint), [company, blueprint]);

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
    // Grab up to 2 sentences
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

    // ✅ Step 4 interruption: user starts talking → stop TTS
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
      // keep answer in sync so Submit works even if listening stops
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

  // ✅ Detect voice support (Step 1)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const w = window as any;
    const hasSTT = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    const hasTTS = !!window.speechSynthesis;

    setSupportedSTT(hasSTT);
    setSupportedTTS(hasTTS);
  }, []);

  // Safety: stop speaking/listening on unmount
  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        // ✅ Step 6 pacing: wait a beat then speak
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

    // ✅ Step 4 interruption: stop mic before submitting
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
        const q = data.interviewer as string;

        setTranscript((prev) => [
          ...prev,
          { role: "interviewer", content: q },
        ]);

        // ✅ Step 6 pacing + keep spoken output short
        setTimeout(() => speak(q), 250);
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
          <h1 className="text-3xl font-bold">Live Interview (Voice + Text)</h1>
          <p className="text-sm opacity-80">
            Day 4 — voice mode (STT + TTS + interruptions)
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

          {/* ✅ Voice Controls (Step 2 + Step 3 + Step 4) */}
          <div className="border rounded p-3 space-y-2">
            <div className="text-sm font-semibold">Voice controls</div>

            {!supportedSTT || !supportedTTS ? (
              <div className="text-xs text-red-600">
                Voice mode works best in Chrome or Edge.
              </div>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      // ✅ interruption: stop TTS then start listening
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
                      // if muting while speaking, cancel speech
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
                  {isListening
                    ? "Listening…"
                    : isSpeaking
                    ? "Interviewer speaking…"
                    : "Idle"}
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
