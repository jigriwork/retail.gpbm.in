export type ReportStatus = "draft" | "submitted" | "reviewed";

export type RetailReport = {
  id: string;
  storeId: string;
  reportDate: string;
  status: ReportStatus;
};
