export const updateCategories = [
  "New stock arrived",
  "Customer issue",
  "Alteration / exchange",
  "Repair / maintenance",
  "Display / rack issue",
  "Cleaning issue",
  "Staff availability note",
  "Cash / account note",
  "Owner attention needed",
  "Pending work",
  "Opening status",
  "No issues today",
  "Other",
];

export const updateStatuses = ["open", "in_progress", "resolved", "cancelled"] as const;
export const updateUrgencies = ["normal", "important", "urgent"] as const;

export type UpdateStatus = (typeof updateStatuses)[number];
export type UpdateUrgency = (typeof updateUrgencies)[number];

export function priorityFromUrgency(urgency: string | null) {
  if (urgency === "urgent") {
    return "urgent";
  }

  if (urgency === "important") {
    return "high";
  }

  return "normal";
}
