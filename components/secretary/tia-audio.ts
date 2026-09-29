"use client";

// One shared <audio> element for Tia's voice. iPhones only let audio play if
// the element was started from a tap, so unlockAudio() runs on the mic/speaker
// tap and later replies reuse the same element.

let player: HTMLAudioElement | null = null;
let silentUrl: string | null = null;
let currentUrl: string | null = null;

function silentWav() {
  if (silentUrl) return silentUrl;
  const bytes = new Uint8Array(44 + 800);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + 800, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, 800, true);
  silentUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  return silentUrl;
}

function getPlayer() {
  player ??= new Audio();
  return player;
}

export function unlockAudio() {
  const audio = getPlayer();
  if (!audio.paused) return;
  audio.src = silentWav();
  audio.play().catch(() => undefined);
}

export function stopSpeaking() {
  player?.pause();
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

export function playWav(base64: string, onEnd: () => void) {
  stopSpeaking();
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  const audio = getPlayer();
  audio.onended = onEnd;
  audio.onpause = onEnd;
  audio.src = currentUrl;
  return audio.play().then(
    () => true,
    () => {
      onEnd();
      return false;
    },
  );
}

/** Fallback: the phone's own voice, preferring an Indian English or Hindi female voice. */
export function speakWithPhoneVoice(text: string, onEnd: () => void) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return onEnd();
  stopSpeaking();
  const hindi = /[ऀ-ॿ]/.test(text);
  const voices = synth.getVoices();
  const wanted = hindi ? "hi-IN" : "en-IN";
  const voice =
    voices.find((item) => item.lang.replace("_", "-") === wanted && /female|veena|lekha|tara|heera|swara|neerja/i.test(item.name)) ??
    voices.find((item) => item.lang.replace("_", "-") === wanted) ??
    voices.find((item) => item.lang.replace("_", "-").startsWith("en-IN"));
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? wanted;
  utterance.rate = 1;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  synth.speak(utterance);
}
