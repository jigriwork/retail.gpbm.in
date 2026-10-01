"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
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
  /** When it was sent (ISO); new messages use the current time. */
  at?: string;
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
  "How were sales yesterday?",
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

type Event = {
  type: string;
  text?: string;
  name?: string;
  prompt?: string;
  spoken?: boolean;
  chatId?: string | null;
  actions?: TiaAction[];
  message?: string;
};

// The answer being typed out: received text arrives in bursts from the
// server, and is revealed a little each frame so it reads like live typing.
type Typing = {
  id: string;
  target: string;
  shown: number;
  done: boolean;
  finish?: () => void;
};

function pickRecordingType() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/aac"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function dayLabel(iso?: string) {
  const date = iso ? new Date(iso) : new Date();
  const key = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(value);
  const today = key(new Date());
  const yesterday = key(new Date(Date.now() - 86_400_000));
  const day = key(date);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata", weekday: "short" }).format(date);
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
      className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-muted transition hover:bg-card hover:text-foreground"
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

function TiaAvatar({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-accent text-primary-deep shadow-sm",
        size === "lg" ? "size-16 ring-8 ring-accent-soft" : "size-8",
      )}
    >
      <Sparkles className={size === "lg" ? "size-7" : "size-4"} />
    </span>
  );
}

export function TiaChat({
  initialMessages,
  memory,
  ownerName,
}: {
  initialMessages: ChatMessage[];
  /** The Memory menu, rendered on the server. */
  memory?: ReactNode;
  ownerName: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "thinking" | "typing">("idle");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState("");
  const [voice, setVoice] = useState<"idle" | "loading" | "speaking">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const typingRef = useRef<Typing | null>(null);
  const frameRef = useRef<number | null>(null);

  function scrollToEnd(behavior: ScrollBehavior = "smooth") {
    const box = scrollRef.current;
    if (box) box.scrollTo({ behavior, top: box.scrollHeight });
  }

  // Open at the latest message, and get Tia's store snapshot ready in the background.
  useEffect(() => {
    scrollToEnd("auto");
    void fetch("/api/tia", { method: "GET" }).catch(() => undefined);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      abortRef.current?.abort();
    };
  }, []);

  // Keep the newest words in view while Tia writes, unless the owner scrolled up to read.
  useEffect(() => {
    if (followRef.current) scrollToEnd(busy ? "auto" : "smooth");
  }, [messages, busy]);

  function update(id: string, change: (message: ChatMessage) => ChatMessage) {
    setMessages((current) => current.map((message) => (message.id === id ? change(message) : message)));
  }

  function pump() {
    const typing = typingRef.current;
    if (!typing) return;
    const backlog = typing.target.length - typing.shown;
    if (backlog > 0) {
      // Faster when far behind, never slower than a couple of letters a frame.
      typing.shown += Math.max(2, Math.ceil(backlog / 14));
      const shown = typing.target.slice(0, typing.shown);
      update(typing.id, (message) => ({ ...message, content: shown, status: undefined }));
    }
    if (typing.shown < typing.target.length || !typing.done) {
      frameRef.current = requestAnimationFrame(pump);
    } else {
      frameRef.current = null;
      typing.finish?.();
    }
  }

  async function ask(formData: FormData, label: string, spokenNote: boolean) {
    const stamp = Date.now();
    const questionId = `q-${stamp}`;
    const answerId = `a-${stamp}`;
    const at = new Date().toISOString();
    const typed = spokenNote ? undefined : label;
    followRef.current = true;
    setMessages((current) => [
      ...current,
      { at, content: label, id: questionId, role: "user", spoken: spokenNote },
      { at, content: "", id: answerId, role: "assistant", streaming: true },
    ]);
    setBusy(true);
    setPhase("thinking");
    const controller = new AbortController();
    abortRef.current = controller;
    const typing: Typing = { done: false, id: answerId, shown: 0, target: "" };
    typingRef.current = typing;
    const typed$ = new Promise<void>((resolve) => {
      typing.finish = resolve;
    });
    let final: { chatId: string; actions: TiaAction[]; spoken: boolean } | null = null;
    let failure: string | null = null;

    try {
      const response = await fetch("/api/tia", { body: formData, method: "POST", signal: controller.signal });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("ndjson") || !response.body) {
        const data = type.includes("json") ? ((await response.json().catch(() => null)) as { message?: string } | null) : null;
        failure = data?.message ?? "Your session may have expired. Refresh the page and log in again.";
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const handle = (line: string) => {
          if (!line) return;
          const event = JSON.parse(line) as Event;
          if (event.type === "question" && event.spoken) update(questionId, (question) => ({ ...question, content: event.prompt ?? question.content }));
          if (event.type === "tool") update(answerId, (answer) => ({ ...answer, status: toolStatus[event.name ?? ""] ?? "Working on it…" }));
          if (event.type === "text") {
            if (!typing.target) {
              setPhase("typing");
              frameRef.current = requestAnimationFrame(pump);
            }
            typing.target += event.text ?? "";
          }
          if (event.type === "error") failure = event.message ?? "Tia could not answer just now.";
          if (event.type === "done") final = { actions: event.actions ?? [], chatId: event.chatId ?? answerId, spoken: Boolean(event.spoken) };
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
        if (!final && !failure) failure = "Tia's answer was cut off. Check your internet and try again.";
      }
    } catch {
      failure = controller.signal.aborted ? "Stopped." : "Tia couldn't be reached just now. Check your internet and try again.";
    }

    // Let the typing catch up with everything received, then settle the message.
    typing.done = true;
    if (typing.target) {
      if (!frameRef.current) frameRef.current = requestAnimationFrame(pump);
      await typed$;
    }
    const result = final as { chatId: string; actions: TiaAction[]; spoken: boolean } | null;
    if (typing.target) {
      update(answerId, (answer) => ({
        ...answer,
        actions: result?.actions ?? [],
        content: typing.target,
        id: result?.chatId ?? answerId,
        status: undefined,
        streaming: false,
      }));
    } else {
      update(answerId, (answer) => ({
        ...answer,
        content: failure ?? "Tia could not answer just now.",
        error: true,
        retry: typed,
        status: undefined,
        streaming: false,
      }));
    }
    typingRef.current = null;
    abortRef.current = null;
    setBusy(false);
    setPhase("idle");
    // A spoken question gets a spoken answer.
    if (result?.spoken && result.chatId !== answerId) void speakReply(result.chatId, setVoice);
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

  const presence = recording
    ? "Listening…"
    : phase === "thinking"
      ? "Thinking…"
      : phase === "typing"
        ? "Typing…"
        : voice === "speaking"
          ? "Speaking…"
          : "Online";
  const hint = recording ? `Listening… ${seconds}s — tap the square to send` : voice === "loading" ? "Tia is getting ready to speak…" : "";

  return (
    <div
      className="fixed inset-x-0 z-10 flex flex-col bg-background"
      style={{ bottom: "var(--app-nav-h)", top: "var(--app-header-h)" }}
    >
      <header className="shrink-0 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5 sm:px-4">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-deep font-display text-lg font-bold text-accent">
            T
            <span
              className={cn(
                "absolute bottom-0 right-0 size-3 rounded-full border-2 border-card",
                presence === "Online" ? "bg-success" : "animate-pulse bg-accent",
              )}
            />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight">Tia</h1>
            <p aria-live="polite" className={cn("text-xs font-medium", presence === "Online" ? "text-success" : "text-accent-ink")}>
              {presence}
            </p>
          </div>
          {voice === "speaking" ? (
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold"
              onClick={() => {
                stopSpeaking();
                setVoice("idle");
              }}
              type="button"
            >
              <Volume2 className="size-3.5" /> Stop voice
            </button>
          ) : null}
          {memory}
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        onScroll={(event) => {
          const box = event.currentTarget;
          followRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
        }}
        ref={scrollRef}
      >
        <div className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:px-4">
          {messages.length === 0 ? (
            <div className="rise-in flex flex-col items-center px-2 pt-8 text-center">
              <TiaAvatar size="lg" />
              <h2 className="mt-5 text-2xl font-bold">Hi {ownerName}, I&apos;m Tia</h2>
              <p className="mt-1 max-w-sm text-sm leading-6 text-muted">
                Ask about sales, stock, staff or your to-dos. Type, or tap the mic and talk in English or Hindi.
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

          {messages.map((message, index) => {
            const day = dayLabel(message.at);
            const showDay = index === 0 || dayLabel(messages[index - 1].at) !== day;
            const separator = showDay ? (
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">{day}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null;

            if (message.role === "user") {
              return (
                <Fragment key={message.id}>
                {separator}
                <div className="rise-in flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-[1.35rem] rounded-br-md bg-primary px-4 py-2.5 text-[0.95rem] leading-6 text-white shadow-sm sm:max-w-xl">
                    {message.spoken ? <Mic aria-label="Spoken" className="mr-1.5 inline size-3.5 align-[-2px] opacity-80" /> : null}
                    {message.content}
                  </p>
                </div>
                </Fragment>
              );
            }

            const settled = !message.streaming && !message.error && !message.id.startsWith("a-");
            return (
              <Fragment key={message.id}>
              {separator}
              <article className="rise-in flex gap-3">
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
                      {!message.streaming && message.actions?.length ? <TiaActionList actions={message.actions} chatId={message.id} /> : null}
                      {settled ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <SpeakButton chatId={message.id} />
                          <CopyButton text={message.content} />
                          <Link
                            className="inline-flex h-8 items-center rounded-xl px-2 text-xs font-semibold text-muted transition hover:bg-card hover:text-foreground"
                            href={`/app/owner/follow-ups/new?chat=${message.id}`}
                          >
                            Follow up
                          </Link>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </article>
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background">
        <div className="mx-auto max-w-3xl px-3 pb-2 pt-2 sm:px-4">
          {messages.length > 0 && !busy && !recording && !prompt ? (
            <div className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
              {quickPrompts.map((item) => (
                <button
                  className="h-8 shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted transition hover:border-primary hover:text-foreground"
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
              "flex items-end gap-1.5 rounded-[1.75rem] border bg-card p-1.5 shadow-sm transition",
              recording ? "border-danger/50" : "border-border focus-within:border-primary focus-within:shadow-md",
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
            <p aria-live="polite" className={cn("mt-1.5 text-center text-xs font-medium", micError ? "text-danger" : "text-muted")}>
              {micError || hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
