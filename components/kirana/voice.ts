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
    stopSpeaking(); // don't record the app's own voice
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

// ------------------------------------------------------------------ speech output
// One voice at a time for the whole app: a new request stops whatever is playing,
// a tap on the same text while it plays stops it, and fetched audio is reused.

type Listener = (speakingText: string | null) => void;
let current: HTMLAudioElement | null = null;
let currentText: string | null = null;
let request = 0;
/** Streaming speech URL. The same text gives the same URL, so repeats come from cache. */
export const ttsUrl = (text: string) => `/api/tts?text=${encodeURIComponent(text)}`;
const warmed = new Set<string>();

/** Start generating a phrase's audio in the background so a later tap plays at once. */
export function warmSpeech(text: string) {
  if (!text || warmed.has(text)) return;
  warmed.add(text);
  fetch(ttsUrl(text)).then((r) => r.arrayBuffer()).catch(() => warmed.delete(text));
}
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(currentText));

/** Stop any app speech (server audio or device voice). */
export function stopSpeaking() {
  request++; // cancels a fetch still in flight
  if (current) { current.pause(); current.removeAttribute("src"); current.load(); } // also cancels the download
  current = null;
  try { window.speechSynthesis.cancel(); } catch { /* not supported */ }
  if (currentText !== null) { currentText = null; emit(); }
}

/** The text being spoken right now (null when silent), for speaker-button state. */
export function useSpeaking(): string | null {
  const [text, setText] = useState<string | null>(currentText);
  useEffect(() => { listeners.add(setText); return () => { listeners.delete(setText); }; }, []);
  return text;
}

/** Speaker button behaviour: play, or stop if this same text is already playing. */
export function toggleSpeak(text: string): Promise<void> {
  if (currentText === text) { stopSpeaking(); return Promise.resolve(); }
  return speakHindi(text);
}

/**
 * Speak Hindi text: the server voice (OpenAI or Sarvam) when available, otherwise this device's voice.
 * Software voice only (not Soundbox hardware). Never throws.
 */
export async function speakHindi(text: string): Promise<void> {
  stopSpeaking();
  const mine = ++request;
  currentText = text;
  emit();
  const done = () => { if (request === mine) { current = null; currentText = null; emit(); } };
  // Stream from our server (OpenAI or Sarvam): playback starts on the first bytes.
  const played = await new Promise<boolean>((resolve) => {
    const audio = new Audio(ttsUrl(text));
    current = audio;
    let started = false;
    audio.onplaying = () => { started = true; resolve(true); };
    audio.onended = done;
    audio.onerror = () => { if (started) done(); else resolve(false); };
    audio.play().catch(() => { if (!started) resolve(false); });
  });
  if (played || request !== mine) return;
  current = null;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "hi-IN";
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    done(); // voice is optional
  }
}
