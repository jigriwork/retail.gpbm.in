export const requestCategories = ["stock", "supplies", "leave", "issue", "idea", "other"] as const;

export const categoryLabel: Record<string, string> = {
  idea: "💡 Idea", issue: "⚠️ Problem", leave: "🗓️ Leave", other: "📝 Other", stock: "👕 Stock / item needed", supplies: "🧴 Shop supplies",
};
