import type { Browser } from "playwright";

class CaptureQueue {
  private browser: Browser | null = null;
  private activeCaptures = 0;
  private queue: Array<() => void> = [];

  private get maxConcurrent(): number {
    const limit = process.env.MAX_CONCURRENT_CAPTURES;
    return limit ? parseInt(limit, 10) : 2;
  }

  async getBrowser(): Promise<Browser> {
    if (this.browser && !this.browser.isConnected()) {
      // Crashed or was killed since the last capture — drop the stale handle
      // so we relaunch instead of failing every request until a restart.
      this.browser = null;
    }
    if (!this.browser) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({
        headless: true,
        args: ["--disable-dev-shm-usage", "--no-sandbox"],
      });
      this.browser.on("disconnected", () => {
        this.browser = null;
      });
    }
    return this.browser;
  }

  private async acquireSemaphore(): Promise<void> {
    if (this.activeCaptures >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCaptures++;
  }

  private releaseSemaphore(): void {
    this.activeCaptures--;
    const next = this.queue.shift();
    if (next) {
      // Execute the next queued task in a microtask/macrotask so it yields control
      setTimeout(next, 0);
    }
  }

  async capture<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
    await this.acquireSemaphore();
    try {
      const browser = await this.getBrowser();
      return await fn(browser);
    } finally {
      this.releaseSemaphore();
    }
  }

  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  get stats() {
    return {
      active: this.activeCaptures,
      queued: this.queue.length,
    };
  }
}

export const captureQueue = new CaptureQueue();
