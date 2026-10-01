// Classifies medicines into India's Drugs & Cosmetics Rules schedules (the
// full A-Z set) for the pharmacy's statutory schedule sales register.
//
// Primary method: ask Gemini (the same Google AI already used for bill
// scanning) — it can map Indian BRAND names to their generic ingredient and
// reason about the schedule lists far better than a fixed keyword list can.
// The keyword lists below are kept only as an OFFLINE FALLBACK for when the
// AI call fails or no API key is configured, so tagging never silently
// breaks.
const SCHEDULE_CATEGORIES = [
  'None', 'A', 'B', 'C', 'C1', 'D', 'E1', 'F', 'F1', 'G', 'H', 'H1', 'J',
  'N', 'O', 'P', 'P1', 'R', 'R1', 'S', 'T', 'U', 'X', 'Z'
];

// Human-readable description of every schedule, shown in the AI prompt and
// reusable for tooltips in the UI. Most of A/B/D/J/N/P/P1/T/U/Z are
// licensing/process/administrative schedules — they govern paperwork, GMP,
// shop premises, documentation, etc., not what KIND of product a medicine
// is, so in practice they will almost never be the right tag for an actual
// SKU. They're still offered (per pharmacy request) for full flexibility.
const SCHEDULE_INFO = {
  None: 'Not scheduled — genuinely OTC / non-drug item.',
  A: 'Forms & formats for license applications, test reports (administrative — not a product type).',
  B: 'Standard test procedures for drugs (administrative — not a product type).',
  C: 'Biological products — vaccines, sera, toxins, insulin.',
  C1: 'Special biological products — antibiotics/vitamins given by injection.',
  D: 'List of exempted drugs & classes for import (administrative — not a product type).',
  E1: 'Poisonous substances (e.g. Atropine, Ergot preparations).',
  F: 'Standards for blood banks & blood-related products.',
  F1: 'Standards for other biological products like vaccines, antisera.',
  G: 'Prescription-only drugs that must carry "Caution: to be taken on medical advice" (not H/H1/X).',
  H: 'Strict prescription drugs (e.g. antibiotics, antipsychotics) not in H1/X.',
  H1: 'High-surveillance prescription drugs (e.g. 3rd/4th-gen antibiotics, anti-TB drugs, benzodiazepines) — needs the special register.',
  J: 'Standards for certain proprietary medicines (rarely used — administrative).',
  N: 'Requirements for a retail pharmacy premises/equipment (administrative — not a product type).',
  O: 'Standards for disinfectant fluids.',
  P: 'Minimum shelf-life / printed expiry norms for drugs (administrative — not a product type).',
  P1: 'List of permitted colors in cosmetics (administrative — not a product type).',
  R: 'Requirements & standards for medical devices (older list).',
  R1: 'Regulation of medical devices under the Medical Device Rules, 2017 (current list).',
  S: 'Standards for cosmetics.',
  T: 'Good Manufacturing Practices for Ayurveda/Siddha/Unani drugs (administrative — not a product type).',
  U: 'Record-keeping & documentation requirements (administrative — not a product type).',
  X: 'Narcotic/psychotropic substances under Schedule X / the NDPS Act (e.g. Morphine, Fentanyl, Ketamine, Amphetamines) — separate XX register + retained prescription copy.',
  Z: 'Pharmacovigilance / drug-safety-monitoring guidelines (administrative — not a product type).'
};

const H1_KEYWORDS = [
  // Antibiotics
  'cefixime', 'cefpodoxime', 'cefotaxime', 'ceftriaxone', 'ceftazidime',
  'cefuroxime', 'cefoperazone', 'cefdinir', 'cefpirome', 'cefepime',
  'cefetamet', 'ceftibuten', 'ceftizoxime', 'levofloxacin', 'ofloxacin',
  'moxifloxacin', 'gatifloxacin', 'sparfloxacin', 'balofloxacin',
  'rifampicin', 'rifabutin', 'streptomycin', 'capreomycin', 'cycloserine',
  'ethionamide', 'pyrazinamide', 'ethambutol', 'clofazimine', 'meropenem',
  'colistin',
  // Sedatives / anxiolytics / hypnotics (benzodiazepines & Z-drugs)
  'alprazolam', 'bromazepam', 'chlordiazepoxide', 'diazepam', 'lorazepam',
  'nitrazepam', 'midazolam', 'zolpidem',
  // Opioid analgesics / cough suppressants
  'buprenorphine', 'codeine', 'tramadol', 'tapentadol'
];

// Narcotic/psychotropic substances under Schedule X (NDPS-linked, tighter
// control than H1 — separate XX register + retained prescription copy).
const X_KEYWORDS = [
  'morphine', 'fentanyl', 'pentazocine', 'methylphenidate', 'ketamine',
  'amphetamine', 'dextroamphetamine', 'oxycodone', 'hydrocodone', 'pethidine'
];

// Biological products (Schedule C / C1) — vaccines, insulin, immunoglobulins.
const C_KEYWORDS = [
  'vaccine', 'insulin', 'immunoglobulin', 'antitoxin', 'antisera', 'antiserum',
  'toxoid', 'interferon'
];

// Medical devices (Schedule R1) commonly stocked at a retail pharmacy.
const R1_KEYWORDS = [
  'glucometer', 'syringe', 'bp monitor', 'blood pressure monitor', 'thermometer',
  'nebulizer', 'oximeter', 'condom', 'iucd', 'catheter'
];

/** Synchronous, best-effort keyword match. Only used as a fallback. */
const suggestScheduleCategory = (productName = '') => {
  const name = String(productName || '').toLowerCase();
  if (!name) return null;
  if (X_KEYWORDS.find((keyword) => name.includes(keyword))) return 'X';
  if (H1_KEYWORDS.find((keyword) => name.includes(keyword))) return 'H1';
  if (C_KEYWORDS.find((keyword) => name.includes(keyword))) return 'C';
  if (R1_KEYWORDS.find((keyword) => name.includes(keyword))) return 'R1';
  return null;
};

const buildPrompt = (names) => `You are an expert on India's Drugs and Cosmetics Act & Rules, 1945 and the NDPS Act —
specifically the full A-Z Schedule classification system enforced by CDSCO.

You will be given a list of product names AS SOLD IN AN INDIAN PHARMACY. They may be
Indian BRAND names (e.g. "Augmentin 625", "Alprax 0.5", "Ultracet"), generic names, or
combination products, or non-medicine items (cosmetics, devices, disinfectants).
Use your knowledge of Indian pharma brands to identify the active ingredient(s) /
product type first, then classify.

Each schedule below describes what kind of PRODUCT it applies to:
${Object.entries(SCHEDULE_INFO).map(([code, desc]) => `- "${code}": ${desc}`).join('\n')}

IMPORTANT: Schedules A, B, D, J, N, P, P1, T, U, Z are administrative/licensing/process
schedules — they describe paperwork, manufacturing practice, shop requirements, etc., NOT a
type of product. Do NOT use them for an ordinary medicine, device or cosmetic — only use one
of them if the item itself is clearly about that exact administrative subject (which will be
rare to never for real pharmacy stock). For virtually every medicine, pick from:
None / C / C1 / E1 / G / H / H1 / O / R1 / S / X.

If unsure between "H" and "None" for a real medicine, prefer "H" (safer default — most
medicines sold in an Indian pharmacy require a prescription). Only use "H1", "X", "C", "C1",
"E1", "R1" etc. when reasonably confident it matches that specific official list.

Medicines/products (respond for every single one, in the exact same order):
${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Return ONLY a raw JSON array (no markdown, no commentary), one object per item in the
SAME order, in this exact shape:
[{"name": "<echo the exact input name>", "category": "${SCHEDULE_CATEGORIES.join('"|"')}", "confidence": "high"|"medium"|"low"}]`;

const keywordFallbackMap = (names) => {
  const map = new Map();
  names.forEach((n) => map.set(n, { category: suggestScheduleCategory(n) || 'None', confidence: 'low', source: 'keyword-fallback' }));
  return map;
};

/**
 * Classifies a batch of medicine names via Gemini in a single call.
 * Always resolves (never throws) — falls back to keyword matching per-name
 * if the API key is missing, the call fails, or the response can't be parsed.
 * Returns Map<originalName, { category, confidence, source }>.
 */
const classifyMedicinesWithAI = async (names = []) => {
  const uniqueNames = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return new Map();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[scheduleDetector] GEMINI_API_KEY not configured — using keyword fallback only');
    return keywordFallbackMap(uniqueNames);
  }

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    const candidateModels = [configuredModel, 'gemini-flash-lite-latest', 'gemini-flash-latest'].filter((m, i, arr) => arr.indexOf(m) === i);

    const contents = [{ role: 'user', parts: [{ text: buildPrompt(uniqueNames) }] }];

    let response = null;
    let lastError = null;
    for (const model of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          response = await ai.models.generateContent({ model, contents });
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          const code = err?.error?.code || err?.status || err?.code;
          const statusText = String(err?.error?.status || err?.status || err?.message || '');
          const isRetryable = code === 429 || code === 503 || code === 500 || statusText.includes('UNAVAILABLE');
          if (!isRetryable) break;
          await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
        }
      }
      if (response) break;
    }

    if (!response) {
      console.error('[scheduleDetector] Gemini classify call failed, using keyword fallback:', lastError?.message);
      return keywordFallbackMap(uniqueNames);
    }

    let rawText = response.text || '';
    rawText = rawText.replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/, '$1').trim();
    const parsed = JSON.parse(rawText);

    const byLowerName = new Map();
    (Array.isArray(parsed) ? parsed : []).forEach((entry) => {
      if (entry?.name) byLowerName.set(String(entry.name).trim().toLowerCase(), entry);
    });

    const map = new Map();
    uniqueNames.forEach((n) => {
      const entry = byLowerName.get(n.toLowerCase());
      const category = SCHEDULE_CATEGORIES.includes(entry?.category) ? entry.category : (suggestScheduleCategory(n) || 'None');
      map.set(n, { category, confidence: entry?.confidence || 'low', source: entry ? 'ai' : 'keyword-fallback' });
    });
    return map;
  } catch (err) {
    console.error('[scheduleDetector] classifyMedicinesWithAI error, using keyword fallback:', err.message);
    return keywordFallbackMap(uniqueNames);
  }
};

module.exports = { SCHEDULE_CATEGORIES, SCHEDULE_INFO, H1_KEYWORDS, X_KEYWORDS, suggestScheduleCategory, classifyMedicinesWithAI };
