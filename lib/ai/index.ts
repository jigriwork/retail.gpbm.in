export type AiSuggestion = {
  id: string;
  title: string;
  reason: string;
  priority: "low" | "medium" | "high";
};
