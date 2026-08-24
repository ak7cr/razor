import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

export interface AppConfig {
  port: number;
  llm: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  razorpay: {
    keyId: string;
    keySecret: string;
  };
  guards: {
    maxOrderAmountPaise: number;
    maxQtyPerLine: number;
    maxLineItems: number;
  };
  auditDir: string;
}

export const config: AppConfig = {
  port: num('PORT', 4173),
  llm: {
    apiKey: str('LLM_API_KEY'),
    baseUrl: str('LLM_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: str('LLM_MODEL', 'gpt-4o-mini'),
  },
  razorpay: {
    keyId: str('RAZORPAY_KEY_ID'),
    keySecret: str('RAZORPAY_KEY_SECRET'),
  },
  guards: {
    maxOrderAmountPaise: Math.round(num('MAX_ORDER_AMOUNT_INR', 25000) * 100),
    maxQtyPerLine: num('MAX_QTY_PER_LINE', 5),
    maxLineItems: num('MAX_LINE_ITEMS', 10),
  },
  auditDir: path.resolve(__dirname, '../data/audit'),
};

export const hasLlm = (): boolean => config.llm.apiKey.length > 0;
export const hasRazorpay = (): boolean =>
  config.razorpay.keyId.length > 0 && config.razorpay.keySecret.length > 0;

/** Ensure the audit output directory exists. */
export function ensureAuditDir(): string {
  fs.mkdirSync(config.auditDir, { recursive: true });
  return config.auditDir;
}
