import "server-only";

export type Msg91BrandCode = "GP" | "BM";

export type Msg91BrandConfig = {
  authKey: string;
  brand: Msg91BrandCode;
  customerTemplate: string;
  followupTemplate: string;
  integratedNumber: string;
  language: string;
  payslipTemplate: string;
};

function value(...names: string[]) {
  for (const name of names) {
    const configured = process.env[name]?.trim();
    if (configured) return configured;
  }
  return "";
}

export function getMsg91Config(brand: string): Msg91BrandConfig | null {
  const code = brand.trim().toUpperCase();
  if (code !== "GP" && code !== "BM") return null;

  const longName = code === "GP" ? "GO_PLANET" : "BRAND_MARK";
  const authKey = value(`MSG91_${code}_AUTH_KEY`, `MSG91_${longName}_AUTH_KEY`, "MSG91_AUTH_KEY");
  const integratedNumber = value(
    `MSG91_${code}_INTEGRATED_NUMBER`,
    `MSG91_${longName}_WHATSAPP_NUMBER`,
  ).replace(/\D/g, "");
  const customerTemplate = value(
    `MSG91_${code}_CUSTOMER_TEMPLATE`,
    `MSG91_${longName}_CUSTOMER_TEMPLATE`,
  );
  const payslipTemplate = value(
    `MSG91_${code}_PAYSLIP_TEMPLATE`,
    `MSG91_${longName}_PAYSLIP_TEMPLATE`,
  );
  const followupTemplate = value(
    `MSG91_${code}_FOLLOWUP_TEMPLATE`,
    `MSG91_${longName}_FOLLOWUP_TEMPLATE`,
  );
  const language = value("MSG91_TEMPLATE_LANGUAGE") || "en";

  // Keep existing thank-you and payslip delivery available even when the
  // optional follow-up campaign has not been configured in an environment.
  if (!authKey || !/^\d{10,15}$/.test(integratedNumber) || !customerTemplate || !payslipTemplate) {
    return null;
  }

  return { authKey, brand: code, customerTemplate, followupTemplate, integratedNumber, language, payslipTemplate };
}
