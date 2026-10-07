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

// Store managers: leading the team on the floor.
const MANAGER_QUOTES = [
  "Start the day with a 2-minute team huddle: today's target and one tip.",
  "Praise in public, correct in private.",
  "Walk the floor every hour: neat racks and full sizes sell more.",
  "Help your weakest seller close one sale today. Confidence grows fast.",
  "Celebrate small wins. A cheering team sells more.",
  "Check the fast sellers' sizes before the evening rush.",
  "A great store is a team where everyone knows the goal.",
  "Lead by example: greet the first customer yourself.",
  "Ask the team what customers asked for but we didn't have.",
  "Close the day with one thing that went well. End on a high.",
  "Fair, clear and kind: the three things a team needs from its leader.",
  "Your team copies your energy. Bring your best today.",
];

// Owners: running and growing the business.
const OWNER_QUOTES = [
  "What gets measured gets managed.",
  "Cash flow is the oxygen of a business. Keep an eye on it daily.",
  "Dead stock is money sleeping on a shelf. Wake it up.",
  "Hire for attitude, train for skill.",
  "Your team treats customers the way you treat your team.",
  "Buy what sells, not what you like.",
  "Small improvements every day add up to big results.",
  "The best time to plan next season is while this one is selling.",
  "Recognise good work quickly. It costs nothing and returns a lot.",
  "A business grows when its people grow.",
  "Focus on the few things that make the most difference.",
  "Know your numbers, trust your team, serve your customers.",
];

const sets = { manager: MANAGER_QUOTES, owner: OWNER_QUOTES, staff: QUOTES };

/** The quote of the day (India date) for staff, managers or owners. */
export function dailyQuote(day: string, audience: keyof typeof sets = "staff") {
  const [year, month, date] = day.split("-").map(Number);
  const list = sets[audience];
  return list[Math.floor(Date.UTC(year, month - 1, date) / 86_400_000) % list.length];
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
