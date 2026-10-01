"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, Mic, RotateCcw, Sparkles, Square, Volume2 } from "lucide-react";

import { FormattedAnswer } from "@/components/secretary/formatted-answer";
import { stopSpeaking, unlockAudio } from "@/components/secretary/tia-audio";
import { SpeakButton, speakReply, TiaActionList } from "@/components/secretary/tia-message-actions";
import type { TiaAction } from "@/lib/secretary/tools";
import { cn } from "@/lib/utils/cn";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  spoken?: boolean;
  error?: boolean;
  actions?: TiaAction[];
  /** Set while Tia is still writing this answer. */
  streaming?: boolean;
  /** What Tia is doing right now, e.g. "Looking up sales…". */
  status?: string;
  /** The typed question to send again from an error. */
  retry?: string;
};

const quickPrompts = [
  "What's pending today?",
  "How are Go Planet and Brand Mark today?",
  "What is not selling?",
  "Which staff performed best this month?",
  "What should I review today?",
  "Give me Monday audit summary",
];

const toolStatus: Record<string, string> = {
  add_todo: "Adding it to your list…",
  complete_task: "Marking it done…",
  get_sales: "Looking up sales…",
  get_staff_sales: "Checking staff sales…",
  list_tasks: "Checking your tasks…",
  remember_fact: "Noting that down…",
  reschedule_task: "Moving the date…",
  search_past_conversations: "Searching our past chats…",
};

// Voice notes go through a 128 KB request limit; at 16 kbps that is about a
// minute, so recording stops at 45 s. Some phones (iPhone Safari) ignore the
// bitrate, so recording also stops once it nears the limit.
const maxRecordSeconds = 45;
const maxRecordBytes = 110 * 1024;

function pickRecordingType() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/aac"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function scrollToEnd(behavior: ScrollBehavior = "smooth") {
  window.scrollTo({ behavior, top: document.documentElement.scrollHeight });
}

function nearBottom() {
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
}

function TypingDots() {
  return (
    <span aria-label="Tia is typing" className="inline-flex items-center gap-1 py-2">
      {[0, 150, 300].map((delay) => (
        <span className="size-2 animate-bounce rounded-full bg-primary/60" key={delay} style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label="Copy answer"
      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-2.5 text-xs font-semibold text-muted transition hover:text-foreground"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      type="button"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function TiaAvatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary-deep shadow-sm">
      <Sparkles className="size-4" />
    </span>
  );
}

export function TiaChat({ initialMessages, ownerName }: { initialMessages: ChatMessage[]; ownerName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState("");
  const [voice, setVoice] = useState<"idle" | "loading" | "speaking">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const followRef = useRef(true);

  // Open at the latest message, and get Tia's store snapshot ready in the background.
  useEffect(() => {
    scrollToEnd("auto");
    void fetch("/api/tia", { method: "GET" }).catch(() => undefined);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      abortRef.current?.abort();
    };
  }, []);

  // Keep the newest words in view while Tia writes, unless the owner scrolled up to read.
  useEffect(() => {
    if (followRef.current) scrollToEnd(busy ? "auto" : "smooth");
  }, [messages, busy]);

  useEffect(() => {
    const onScroll = () => {
      followRef.current = nearBottom();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function update(id: string, change: (message: ChatMessage) => ChatMessage) {
    setMessages((current) => current.map((message) => (message.id === id ? change(message) : message)));
  }

  async function ask(formData: FormData, label: string, spokenNote: boolean) {
    const questionId = `q-${Date.now()}`;
    const answerId = `a-${Date.now()}`;
    const typed = spokenNote ? undefined : label;
    followRef.current = true;
    setMessages((current) => [
      ...current,
      { id: questionId, role: "user", content: label, spoken: spokenNote },
      { id: answerId, role: "assistant", content: "", streaming: true },
    ]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const fail = (message: string) =>
      update(answerId, (answer) =>
        answer.content
          ? { ...answer, streaming: false, status: undefined }
          : { ...answer, content: message, error: true, retry: typed, streaming: false, status: undefined },
      );

    try {
      const response = await fetch("/api/tia", { body: formData, method: "POST", signal: controller.signal });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("ndjson") || !response.body) {
        const data = type.includes("json") ? ((await response.json().catch(() => null)) as { message?: string } | null) : null;
        fail(data?.message ?? "Your session may have expired. Refresh the page and log in again.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      const handle = (line: string) => {
        if (!line) return;
        const event = JSON.parse(line) as {
          type: string;
          text?: string;
          name?: string;
          prompt?: string;
          spoken?: boolean;
          chatId?: string | null;
          actions?: TiaAction[];
          message?: string;
        };
        if (event.type === "question" && event.spoken) update(questionId, (question) => ({ ...question, content: event.prompt ?? question.content }));
        if (event.type === "tool") update(answerId, (answer) => ({ ...answer, status: toolStatus[event.name ?? ""] ?? "Working on it…" }));
        if (event.type === "text") update(answerId, (answer) => ({ ...answer, content: answer.content + (event.text ?? ""), status: undefined }));
        if (event.type === "error") {
          finished = true;
          fail(event.message ?? "Tia could not answer just now.");
        }
        if (event.type === "done") {
          finished = true;
          const chatId = event.chatId ?? answerId;
          update(answerId, (answer) => ({ ...answer, actions: event.actions ?? [], id: chatId, status: undefined, streaming: false }));
          // A spoken question gets a spoken answer.
          if (event.spoken && event.chatId) void speakReply(event.chatId, setVoice);
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          handle(buffer.slice(0, newline).trim());
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      }
      handle(buffer.trim());
      if (!finished) fail("Tia's answer was cut off. Check your internet and try again.");
    } catch {
      fail(controller.signal.aborted ? "Stopped." : "Tia couldn't be reached just now. Check your internet and try again.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function sendText(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    const formData = new FormData();
    formData.set("prompt", clean);
    setPrompt("");
    void ask(formData, clean, false);
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
    let recordedBytes = 0;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      chunks.push(event.data);
      recordedBytes += event.data.size;
      if (recordedBytes >= maxRecordBytes && recorder.state === "recording") stopRecording();
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const mimeType = (recorder.mimeType || type || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size < 1000) {
        setMicError("That was too short. Tap the mic, speak, then tap again to send.");
        return;
      }
      if (blob.size > 120 * 1024) {
        setMicError("That voice note was too long to send. Try a shorter one, or type instead.");
        return;
      }
      const formData = new FormData();
      formData.set("audio", new File([blob], "voice-note", { type: mimeType }));
      void ask(formData, "Voice message", true);
    };
    recorderRef.current = recorder;
    // Deliver audio every second so the size limit can be watched while recording.
    recorder.start(1000);
    setRecording(true);
    setSeconds(0);
    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= maxRecordSeconds) stopRecording();
    }, 1000);
  }

  const hint = recording
    ? `Listening… ${seconds}s — tap the square to send`
    : voice === "loading"
      ? "Tia is getting ready to speak…"
      : voice === "speaking"
        ? "Tia is speaking"
        : "";

  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col">
      <div className="flex-1 space-y-6 pb-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center px-2 pt-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-accent text-primary-deep shadow-sm ring-8 ring-accent-soft">
              <Sparkles className="size-7" />
            </span>
            <h2 className="mt-5 text-2xl font-bold">Hi {ownerName}, I&apos;m Tia</h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-muted">
              Ask about sales, stock, staff or your to-dos — type or tap the mic, in English or Hindi.
            </p>
            <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {quickPrompts.map((item) => (
                <button
                  className="rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm font-semibold shadow-sm transition hover:border-primary"
                  key={item}
                  onClick={() => sendText(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) =>
          message.role === "user" ? (
            <div className="flex justify-end" key={message.id}>
              <p className="max-w-[85%] whitespace-pre-wrap rounded-[1.35rem] rounded-br-md bg-primary px-4 py-2.5 text-[0.95rem] leading-6 text-white shadow-sm sm:max-w-xl">
                {message.spoken ? <Mic aria-label="Spoken" className="mr-1.5 inline size-3.5 align-[-2px] opacity-80" /> : null}
                {message.content}
              </p>
            </div>
          ) : (
            <article className="flex gap-3" key={message.id}>
              <TiaAvatar />
              <div className="min-w-0 flex-1 pt-0.5">
                {message.error ? (
                  <div className="rounded-2xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
                    <p className="font-medium">{message.content}</p>
                    {message.retry ? (
                      <button
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold underline"
                        disabled={busy}
                        onClick={() => sendText(message.retry ?? "")}
                        type="button"
                      >
                        <RotateCcw className="size-3.5" /> Try again
                      </button>
                    ) : null}
                  </div>
                ) : message.streaming && !message.content ? (
                  <div>
                    <TypingDots />
                    {message.status ? <p className="text-xs font-medium text-muted">{message.status}</p> : null}
                  </div>
                ) : (
                  <>
                    <FormattedAnswer text={message.content} />
                    {message.streaming ? (
                      <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary align-[-2px]" />
                    ) : null}
                    {message.status ? <p className="mt-1 text-xs font-medium text-muted">{message.status}</p> : null}
                    {!message.streaming && message.actions?.length ? <TiaActionList actions={message.actions} chatId={message.id} /> : null}
                    {!message.streaming && !message.id.startsWith("a-") ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <SpeakButton chatId={message.id} />
                        <CopyButton text={message.content} />
                        <Link className="px-1 text-xs font-semibold text-muted underline" href={`/app/owner/follow-ups/new?chat=${message.id}`}>
                          Follow up
                        </Link>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </article>
          ),
        )}
      </div>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 -mx-3 bg-gradient-to-t from-background via-background to-background/0 px-3 pb-2 pt-4 sm:mx-0 sm:px-0">
        {messages.length > 0 && !busy && !recording ? (
          <div className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {quickPrompts.map((item) => (
              <button
                className="h-9 shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-3 text-xs font-semibold shadow-sm transition hover:border-primary"
                key={item}
                onClick={() => sendText(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className={cn(
            "flex items-end gap-1.5 rounded-[1.75rem] border bg-card p-1.5 shadow-lg shadow-primary-deep/5 transition",
            recording ? "border-danger/50" : "border-border focus-within:border-primary",
          )}
          onSubmit={(event) => {
            event.preventDefault();
            sendText(prompt);
          }}
        >
          <button
            aria-label={recording ? "Stop and send" : "Talk to Tia"}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40",
              recording ? "animate-pulse bg-danger text-white" : "bg-primary-soft text-primary hover:bg-primary hover:text-white",
            )}
            disabled={busy && !recording}
            onClick={() => (recording ? stopRecording() : void startRecording())}
            type="button"
          >
            {recording ? <Square className="size-4" /> : <Mic className="size-5" />}
          </button>
          <textarea
            aria-label="Message Tia"
            className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 outline-none placeholder:text-muted sm:text-[0.95rem]"
            onChange={(event) => {
              setPrompt(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(event) => {
              // Enter sends on a keyboard; on phones Enter adds a new line.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) {
                event.preventDefault();
                sendText(prompt);
              }
            }}
            placeholder={recording ? "Listening…" : "Message Tia…"}
            ref={inputRef}
            rows={1}
            value={prompt}
          />
          {busy ? (
            <button
              aria-label="Stop"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-deep text-white"
              onClick={() => abortRef.current?.abort()}
              type="button"
            >
              <Square className="size-4 fill-current" />
            </button>
          ) : (
            <button
              aria-label="Send"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-deep disabled:bg-border disabled:text-muted"
              disabled={!prompt.trim() || recording}
              type="submit"
            >
              <ArrowUp className="size-5" />
            </button>
          )}
        </form>
        {hint || micError ? (
          <p aria-live="polite" className={cn("mt-1.5 flex items-center justify-center gap-2 text-xs font-medium", micError ? "text-danger" : "text-muted")}>
            {micError || hint}
            {voice === "speaking" ? (
              <button
                className="inline-flex items-center gap-1 font-semibold underline"
                onClick={() => {
                  stopSpeaking();
                  setVoice("idle");
                }}
                type="button"
              >
                <Volume2 className="size-3.5" /> Stop
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
