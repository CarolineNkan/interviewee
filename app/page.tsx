"use client";

import { useState } from "react";

export default function Home() {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  async function runTest() {
    setLoading(true);
    setOutput("");

    const res = await fetch("/api/blueprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: "Google",
        resumeText:
          "Led cross-functional projects, built dashboards, presented insights to stakeholders.",
        jdText:
          "Looking for a Product Manager with strong communication, analytics, and execution skills.",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setOutput(`ERROR:\n${JSON.stringify(data, null, 2)}`);
    } else {
      try {
        const parsed = JSON.parse(data.output);
        setOutput(JSON.stringify(parsed, null, 2));
      } catch {
        setOutput(data.output || JSON.stringify(data, null, 2));
      }
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Interviewee — Day 1</h1>

      <button
        onClick={runTest}
        className="px-6 py-2 rounded bg-black text-white"
      >
        {loading ? "Thinking..." : "Generate Interview Blueprint"}
      </button>

      <pre className="w-full max-w-3xl whitespace-pre-wrap text-sm border p-4 rounded">
        {output}
      </pre>
    </main>
  );
}
