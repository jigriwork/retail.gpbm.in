// WhatsApp message templates for customers. Sent by tapping a link that opens
// WhatsApp with the text ready (free; nothing is sent automatically).
// A thank-you is for a purchase in the last 3 days; offers need consent.

export type MessageKind = "thank_you" | "lapsed_offer" | "birthday";

export const messageKinds: Array<{ kind: MessageKind; label: string; needsConsent: boolean }> = [
  { kind: "thank_you", label: "Thank you + review", needsConsent: false },
  { kind: "lapsed_offer", label: "We miss you", needsConsent: true },
  { kind: "birthday", label: "Birthday wish", needsConsent: true },
];

export function customerMessage(kind: MessageKind, { name, reviewUrl, store }: { name: string | null; reviewUrl: string | null; store: string }) {
  const hello = name ? `Hi ${name.split(" ")[0]}` : "Hi";
  if (kind === "thank_you") {
    return [
      `${hello}, thank you for shopping at ${store}! We hope you love your purchase.`,
      reviewUrl ? `If you're happy with us, a quick Google review helps a lot: ${reviewUrl}` : null,
    ].filter(Boolean).join("\n\n");
  }
  const optOut = "Reply STOP if you don't want messages from us.";
  if (kind === "birthday") return `${hello}, happy birthday from all of us at ${store}! Visit us this week for a birthday treat.\n\n${optOut}`;
  return `${hello}, we miss you at ${store}! New arrivals are in. Do drop by.\n\n${optOut}`;
}

/** wa.me link for an Indian 10-digit mobile. */
export function whatsAppUrl(mobile: string, text: string) {
  return `https://wa.me/91${mobile}?text=${encodeURIComponent(text)}`;
}

export function maskMobile(mobile: string) {
  return `${mobile.slice(0, 2)}xxxxx${mobile.slice(7)}`;
}
