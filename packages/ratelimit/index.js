// In-memory per-key limits: sliding windows for requests/minute and
// requests/hour, plus a concurrency counter. State lives in the gateway
// process; run a single gateway instance (or put a shared store behind this
// interface) until real traffic requires more.

export class RateLimiter {
  constructor({ requests_per_minute, requests_per_hour, concurrent_requests }, now = () => Date.now()) {
    this.rpm = requests_per_minute;
    this.rph = requests_per_hour;
    this.concurrency = concurrent_requests;
    this.now = now;
    this.hits = new Map();
    this.active = new Map();
  }

  /** Returns { ok: true, release } or { ok: false, reason, retryAfter } (seconds). */
  acquire(id) {
    const now = this.now();
    const hits = (this.hits.get(id) ?? []).filter((t) => t > now - 3_600_000);
    this.hits.set(id, hits);

    const lastMinute = hits.filter((t) => t > now - 60_000);
    if (lastMinute.length >= this.rpm) return { ok: false, reason: 'requests_per_minute', retryAfter: Math.ceil((lastMinute[0] + 60_000 - now) / 1000) };
    if (hits.length >= this.rph) return { ok: false, reason: 'requests_per_hour', retryAfter: Math.ceil((hits[0] + 3_600_000 - now) / 1000) };
    const active = this.active.get(id) ?? 0;
    if (active >= this.concurrency) return { ok: false, reason: 'concurrent_requests', retryAfter: 1 };

    hits.push(now);
    this.active.set(id, active + 1);
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        const n = (this.active.get(id) ?? 1) - 1;
        if (n <= 0) this.active.delete(id);
        else this.active.set(id, n);
      },
    };
  }

  /** Drop idle entries; call periodically. */
  sweep() {
    const cutoff = this.now() - 3_600_000;
    for (const [id, hits] of this.hits) if (!hits.length || hits[hits.length - 1] < cutoff) this.hits.delete(id);
  }
}
