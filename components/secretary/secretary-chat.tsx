"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Sparkles, Square, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { stopSpeaking, unlockAudio } from "@/components/secretary/tia-audio";
import { speakReply } from "@/components/secretary/tia-message-actions";
import type { SecretaryChatState } from "@/lib/secretary/actions";

const initialState: SecretaryChatState = {
  ok: false,
  message: "",
};

const quickPrompts = [
  "What's pending today?",
  "How are Go Planet and Brand Mark today?",
  "What is not selling?",
  "Which staff performed best this month?",
  "What should I review today?",
  "Give me Monday audit summary",
];

// Voice notes are uploaded through a 128 KB request limit; at 16 kbps that is
// about a minute, so recording stops itself at 45 seconds.
const maxRecordSeconds = 45;

function pickRecordingType() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/aac"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function SecretaryChat({
  action,
}: {
  action: (previous: SecretaryChatState, formData: FormData) => Promise<SecretaryChatState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [prompt, setPrompt] = useState("");
  const [asked, setAsked] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState("");
  const [voice, setVoice] = useState<"idle" | "loading" | "speaking">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const spokenRef = useRef<string | null>(null);

  // A spoken question gets a spoken answer.
  useEffect(() => {
    const chatId = state.speakChatId;
    if (!chatId || spokenRef.current === chatId) return;
    spokenRef.current = chatId;
    void speakReply(chatId, setVoice);
  }, [state]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function submitText(text: string) {
    const formData = new FormData();
    formData.set("prompt", text);
    setAsked(text);
    startTransition(() => formAction(formData));
  }

  function stopRecording() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function startRecording() {
    setMicError("");
    unlockAudio();
    stopSpeaking();
    setVoice("idle");
    const type = pickRecordingType();
    if (type === null || !navigator.mediaDevices?.getUserMedia) {
      setMicError("This browser can't record. Use the mic on your keyboard instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setMicError("Microphone access was blocked. Allow the microphone for this site in your browser settings.");
      return;
    }
    const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 16000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const mimeType = (recorder.mimeType || type || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size < 1000) {
        setMicError("That was too short. Tap the mic, speak, then tap again to send.");
        return;
      }
      const formData = new FormData();
      formData.set("audio", new File([blob], "voice-note", { type: mimeType }));
      setAsked("🎤 Voice message");
      startTransition(() => formAction(formData));
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setSeconds(0);
    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      // Auto-send at the time limit.
      if (elapsed >= maxRecordSeconds) stopRecording();
    }, 1000);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col items-center gap-2 py-1">
          <button
            aria-label={recording ? "Stop and send" : "Talk to Tia"}
            className={
              recording
                ? "flex size-20 items-center justify-center rounded-full bg-danger text-white shadow-lg ring-8 ring-danger/15 transition"
                : "flex size-20 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition hover:scale-105 disabled:opacity-50"
            }
            disabled={pending && !recording}
            onClick={() => (recording ? stopRecording() : void startRecording())}
            type="button"
          >
            {recording ? <Square className="size-7" /> : <Mic className="size-8" />}
          </button>
          <p aria-live="polite" className="text-center text-sm font-medium text-muted">
            {recording
              ? `Listening… ${seconds}s — tap to send`
              : pending
                ? "Tia is thinking…"
                : voice === "loading"
                  ? "Tia is getting ready to speak…"
                  : voice === "speaking"
                    ? "Tia is speaking"
                    : "Tap and talk to Tia — English or Hindi"}
          </p>
          {voice === "speaking" ? (
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold"
              onClick={() => {
                stopSpeaking();
                setVoice("idle");
              }}
              type="button"
            >
              <Volume2 className="size-3.5" /> Stop speaking
            </button>
          ) : null}
          {micError ? <p className="text-center text-xs font-medium text-danger">{micError}</p> : null}
        </div>

        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!prompt.trim() || pending) return;
            submitText(prompt.trim());
            setPrompt("");
          }}
        >
          <textarea
            aria-label="Type to Tia"
            className="max-h-40 min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-border bg-background px-3 py-2.5 text-base leading-6 outline-none focus:border-foreground sm:text-sm"
            name="prompt"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Or type to Tia…"
            rows={1}
            value={prompt}
          />
          <Button aria-label="Send" className="h-11 shrink-0 px-3.5" disabled={pending || !prompt.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>

      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {quickPrompts.map((item) => (
          <button
            className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border border-border bg-card px-3 text-sm font-semibold shadow-sm transition hover:border-foreground disabled:opacity-50"
            disabled={pending}
            key={item}
            onClick={() => submitText(item)}
            type="button"
          >
            <Sparkles className="size-3.5 shrink-0 text-muted" />
            {item}
          </button>
        ))}
      </div>

      {pending && asked ? (
        <section aria-live="polite" className="space-y-2">
          <p className="ml-auto w-fit max-w-[90%] rounded-[1.1rem] bg-foreground px-4 py-2.5 text-sm leading-6 text-background">
            {asked}
          </p>
          <p className="inline-flex items-center gap-2 rounded-[1.1rem] border border-border bg-card px-4 py-3 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Tia is checking your store data…
          </p>
        </section>
      ) : !state.ok && state.message ? (
        <p aria-live="polite" className="rounded-[1.1rem] border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
