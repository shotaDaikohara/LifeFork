/**
 * API乱用防止のためのユーザー単位 Rate Limit（Fixed Window）。
 *
 * 設計書14.2章はVercel WAF (IP単位) を第一候補としているが、本実装では
 * ログイン必須化(v0.4)に合わせてユーザー単位（email）で /api/interview と
 * /api/research をまとめて1つのウィンドウで保護する。
 *
 * 制約: モジュールスコープの Map はサーバーレス関数の同一ウォームインスタンス内でのみ
 * 共有される。Vercel上で複数インスタンスが並行動作する場合、実効レートはこれより
 * 緩くなり得るベストエフォートの防御である（MVPの割り切り）。
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = Number(process.env.RATE_LIMIT_PER_MINUTE) || 10;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
}

/**
 * @param key ユーザーを一意に識別するキー（通常はログイン済みメールアドレス）
 */
export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true };
}
