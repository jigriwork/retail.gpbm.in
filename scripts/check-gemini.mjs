/**
 * GPBM Retail — Gemini API Health Check
 *
 * Usage: npm run check:gemini
 *
 * Tests the Gemini API connection, lists available models,
 * and verifies that the configured model can generate content.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Load .env.local ────────────────────────────────────────────────────────

function loadEnvFile() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex < 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local may not exist in CI
  }
}

loadEnvFile();

// ─── Config ─────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.0-flash",
];

const API_KEY = process.env.GEMINI_API_KEY;
const CONFIGURED_MODEL = process.env.GEMINI_MODEL || DEFAULT_MODEL;
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(icon, message) {
  console.log(`${icon}  ${message}`);
}

function separator() {
  console.log("─".repeat(60));
}

// ─── Step 1: Check API key ──────────────────────────────────────────────────

if (!API_KEY) {
  log("❌", "GEMINI_API_KEY is not set.");
  log("💡", "Add GEMINI_API_KEY to .env.local or environment variables.");
  process.exit(1);
}

log("✅", "GEMINI_API_KEY is set (value hidden).");
log("📋", `Configured model: ${CONFIGURED_MODEL}`);
if (process.env.GEMINI_MODEL) {
  log("🔧", "GEMINI_MODEL override is active from environment.");
} else {
  log("📌", `Using default model: ${DEFAULT_MODEL}`);
}
separator();

// ─── Step 2: List available models ──────────────────────────────────────────

log("🔍", "Fetching available Gemini models...");

try {
  const listResponse = await fetch(`${BASE_URL}/models?key=${API_KEY}`);

  if (!listResponse.ok) {
    log("❌", `Failed to list models (HTTP ${listResponse.status}).`);
    if (listResponse.status === 401 || listResponse.status === 403) {
      log("💡", "API key may be invalid or lacks permissions.");
    }
    process.exit(1);
  }

  const listData = await listResponse.json();
  const models = listData.models ?? [];
  const generateModels = models.filter((m) =>
    m.supportedGenerationMethods?.includes("generateContent"),
  );

  log("✅", `Found ${models.length} models, ${generateModels.length} support generateContent.`);
  console.log();

  // Show relevant models
  const relevantNames = generateModels
    .map((m) => m.name?.replace("models/", "") ?? "unknown")
    .filter((name) => name.includes("flash") || name.includes("gemini"))
    .sort();

  if (relevantNames.length > 0) {
    log("📋", "Gemini models supporting generateContent:");
    for (const name of relevantNames.slice(0, 20)) {
      const isConfigured = name === CONFIGURED_MODEL;
      console.log(`     ${isConfigured ? "→" : " "} ${name}${isConfigured ? " (configured)" : ""}`);
    }
    if (relevantNames.length > 20) {
      console.log(`     ... and ${relevantNames.length - 20} more`);
    }
  }
  separator();
} catch (error) {
  log("⚠️", `Could not list models: ${error.message}`);
  log("💡", "Continuing with generateContent test anyway...");
  separator();
}

// ─── Step 3: Test generateContent ───────────────────────────────────────────

const testBody = {
  contents: [
    {
      role: "user",
      parts: [{ text: "Reply with exactly: GPBM Retail OK" }],
    },
  ],
  generationConfig: {
    maxOutputTokens: 20,
    temperature: 0,
  },
};

async function testModel(modelName) {
  try {
    const response = await fetch(
      `${BASE_URL}/models/${modelName}:generateContent?key=${API_KEY}`,
      {
        body: JSON.stringify(testBody),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";

    return { ok: true, text };
  } catch (error) {
    return { ok: false, status: -1, error: error.message };
  }
}

// Try configured model
log("🧪", `Testing generateContent with: ${CONFIGURED_MODEL}`);
const primaryResult = await testModel(CONFIGURED_MODEL);

if (primaryResult.ok) {
  log("✅", `${CONFIGURED_MODEL} responded: "${primaryResult.text}"`);
  separator();
  log("🎉", "Gemini integration is healthy. AI Secretary should work.");
  process.exit(0);
}

log("❌", `${CONFIGURED_MODEL} failed (HTTP ${primaryResult.status}).`);

if (primaryResult.status !== 404) {
  log("💡", "This is not a model-not-found error. Check API key and account.");
  process.exit(1);
}

// Try fallback models
separator();
log("🔄", "Primary model returned 404. Trying fallback models...");
console.log();

for (const fallback of FALLBACK_MODELS) {
  if (fallback === CONFIGURED_MODEL) continue;

  log("🧪", `Trying: ${fallback}`);
  const result = await testModel(fallback);

  if (result.ok) {
    log("✅", `${fallback} responded: "${result.text}"`);
    separator();
    log("🎉", `Fallback model works! AI Secretary will auto-fallback to ${fallback}.`);
    log("💡", `To silence this, set GEMINI_MODEL=${fallback} in .env.local`);
    process.exit(0);
  }

  log("❌", `${fallback} failed (HTTP ${result.status}).`);
}

separator();
log("❌", "No Gemini model is available.");
log("💡", "Check your GEMINI_API_KEY and Google Cloud project configuration.");
log("💡", "Visit: https://ai.google.dev/gemini-api/docs/models");
process.exit(1);
