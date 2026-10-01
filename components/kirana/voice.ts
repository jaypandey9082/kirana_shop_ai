"use client";
import { useEffect, useRef, useState } from "react";
import type { VoiceState } from "./components";

const MAX_SECONDS = 20;

/**
 * Record → Sarvam STT → transcript. Handles mic permission errors and a 20 s cap.
 * `onTranscript` receives the text; the caller decides what to do with it.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callback = useRef(onTranscript);
  useEffect(() => { callback.current = onTranscript; }, [onTranscript]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const transcribe = async (blob: Blob, type: string) => {
    setState("processing");
    try {
      const form = new FormData();
      form.append("audio", blob, type.includes("mp4") ? "speech.mp4" : "speech.webm");
      const res = await fetch("/api/voice/stt", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Awaaz samajh nahi aayi.");
      setState("idle");
      callback.current(String(data.transcript ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Awaaz samajh nahi aayi.");
      setState("error");
    }
  };

  const toggle = async () => {
    setError(null);
    if (state === "listening") { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        stream.getTracks().forEach((t) => t.stop());
        void transcribe(new Blob(chunks, { type: rec.mimeType }), rec.mimeType);
      };
      recorder.current = rec;
      rec.start();
      setState("listening");
      timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000);
    } catch {
      setError("Mic nahi chala. Type karke likhiye.");
      setState("error");
    }
  };

  return { state, setState, error, toggle };
}

/**
 * Speak Hindi text: Sarvam TTS when the server has it, otherwise this device's voice.
 * Software voice only (not Soundbox hardware). Never throws.
 */
export async function speakHindi(text: string): Promise<void> {
  try {
    const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (res.ok) {
      const { base64, mime } = await res.json();
      await new Audio(`data:${mime};base64,${base64}`).play();
      return;
    }
  } catch { /* fall back to device voice */ }
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "hi-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* voice is optional */ }
}
