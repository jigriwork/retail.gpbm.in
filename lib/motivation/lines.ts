// Motivation for the blue card: a personal line from the person's own numbers
// (always positive, never comparing someone weak with others) and a daily
// selling tip / quote (the same for everyone on a day).

const QUOTES = [
  "Greet every customer within 10 seconds. A warm hello sells more than any discount.",
  "Suggest one matching item with every sale: a belt, socks, a second shirt.",
  "Small daily wins make big months.",
  "Listen first, then show. Customers buy from people who understand them.",
  "Every customer who walks in is a chance. Make each one feel special.",
  "Show three options, not ten. Help them choose with confidence.",
  "A smile is the best thing you wear at work.",
  "Know your stock: the size they want might be just one shelf away.",
  "Don't sell a shirt, sell how good they will look in it.",
  "Thank every customer, even if they buy nothing. They will come back.",
  "Ask: \"Is it for an occasion?\" The answer tells you what to show.",
  "Neat racks sell faster. Fold, arrange, and let the clothes speak.",
  "Today's effort is next month's salary slip. Give it your best.",
  "One extra item per bill makes a big difference by month end.",
  "Be the person customers ask for by name next time.",
  "Try-room tip: bring the next size before they ask.",
  "Energy is contagious. Start the day strong and the team follows.",
  "Every \"no\" is one step closer to a \"yes\". Keep going.",
  "Help them complete the look: shoes, belt, watch.",
  "Good service is remembered long after the price is forgotten.",
  "Learn one new product detail today. Confidence sells.",
  "Count your wins, not your hours.",
  "Treat the shop like your own, and it will treat you well.",
  "A follow-up \"How did the shirt fit?\" brings customers back.",
  "Consistency beats luck. Show up, sell well, repeat.",
  "The best salespeople are great listeners.",
  "Be proud of the team. A team that cheers wins more.",
  "Your best day this month is still ahead.",
];

/** The quote of the day (India date), the same for everyone. */
export function dailyQuote(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const index = Math.floor(Date.UTC(year, month - 1, date) / 86_400_000) % QUOTES.length;
  return QUOTES[index];
}

const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

/**
 * A staff member's line for today, from their own sales. Today's sales are
 * uploaded at closing, so during the day "today" is usually 0.
 */
export function staffLine({ isMonday, rank, target, today, yesterday }: {
  isMonday: boolean;
  rank: number | null;
  target: { left: number; perDay: number; reached: boolean } | null;
  today: number;
  yesterday: number;
}) {
  if (target?.reached) return "🎉 Target achieved! Every sale now is a bonus. Amazing work!";
  if (today > 0 && yesterday > 0 && today > yesterday) return `🔥 You beat yesterday by ${money(today - yesterday)}! What a day!`;
  if (today > 0 && yesterday > 0) return `💪 Just ${money(yesterday - today + 1)} more and you beat yesterday. Tomorrow is yours!`;
  if (today === 0 && yesterday > 0) return `💪 Yesterday you sold ${money(yesterday)}. Let's beat it today!`;
  if (rank && rank <= 3) return `🏆 You're #${rank} in the store this week. Keep it up!`;
  if (target && target.left > 0) return `🎯 About ${money(target.perDay)} a day gets you to your target.`;
  if (isMonday) return "🌅 New week, fresh start. Your best week can start today!";
  return "🌟 Every customer is a new chance. Let's make today count!";
}
