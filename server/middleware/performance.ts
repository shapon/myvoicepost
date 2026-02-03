import type { Request, Response, NextFunction } from "express";

/**
 * Performance-focused middleware for high-concurrency Express applications
 */

// Request timeout middleware - prevents long-running requests from blocking resources
export function requestTimeout(timeoutMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set request timeout
    req.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        res.status(408).json({
          error: "Request timeout",
          message: `Request exceeded ${timeoutMs / 1000} second timeout`,
        });
      }
    });

    // Set response timeout
    res.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        res.status(504).json({
          error: "Gateway timeout",
          message: `Response generation exceeded ${timeoutMs / 1000} second timeout`,
        });
      }
    });

    next();
  };
}

// AI-specific longer timeout for transcription/translation endpoints
export function aiRequestTimeout(timeoutMs: number = 120000) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if this is an AI endpoint
    const aiEndpoints = [
      '/api/transcribe',
      '/api/polish-speech',
      '/api/translate-speech',
      '/api/polish-speech-base64',
      '/api/translate-speech-base64',
      '/api/v1/p/transcribe',
      '/api/v1/p/polish',
      '/api/v1/p/translate',
    ];

    const isAiEndpoint = aiEndpoints.some(endpoint =>
      req.path.startsWith(endpoint)
    );

    const timeout = isAiEndpoint ? timeoutMs : 60000;

    req.setTimeout(timeout, () => {
      if (!res.headersSent) {
        res.status(408).json({
          error: "Request timeout",
          message: `AI processing exceeded ${timeout / 1000} second timeout. Please try with a shorter audio clip.`,
        });
      }
    });

    next();
  };
}

// Connection management - helps with keep-alive and connection reuse
export function connectionManagement(req: Request, res: Response, next: NextFunction) {
  // Enable keep-alive for connection reuse
  res.set('Connection', 'keep-alive');
  res.set('Keep-Alive', 'timeout=30, max=100');
  next();
}

// Non-blocking response logger for production
export function asyncLogger(logFn: (message: string) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      // Use setImmediate to defer logging to avoid blocking the event loop
      setImmediate(() => {
        const duration = Date.now() - start;
        if (req.path.startsWith("/api")) {
          logFn(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
        }
      });
    });

    next();
  };
}

// Rate limiting helper using sliding window algorithm
export class SlidingWindowRateLimiter {
  private windows: Map<string, { count: number; windowStart: number }> = new Map();
  private readonly windowSizeMs: number;
  private readonly maxRequests: number;

  constructor(windowSizeMs: number = 60000, maxRequests: number = 100) {
    this.windowSizeMs = windowSizeMs;
    this.maxRequests = maxRequests;

    // Cleanup old windows every minute using non-blocking iteration
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const window = this.windows.get(key);

    if (!window || now - window.windowStart >= this.windowSizeMs) {
      // New window
      this.windows.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (window.count >= this.maxRequests) {
      return false;
    }

    window.count++;
    return true;
  }

  private cleanup() {
    const now = Date.now();
    // Use async-friendly iteration with setImmediate to prevent blocking
    const entries = Array.from(this.windows.entries());
    let index = 0;

    const processChunk = () => {
      const chunkSize = 100;
      const end = Math.min(index + chunkSize, entries.length);

      for (let i = index; i < end; i++) {
        const [key, window] = entries[i];
        if (now - window.windowStart >= this.windowSizeMs * 2) {
          this.windows.delete(key);
        }
      }

      index = end;
      if (index < entries.length) {
        setImmediate(processChunk);
      }
    };

    processChunk();
  }
}

// Create a rate limiter middleware
export function createRateLimiter(windowMs: number = 60000, maxRequests: number = 100) {
  const limiter = new SlidingWindowRateLimiter(windowMs, maxRequests);

  return (req: Request, res: Response, next: NextFunction) => {
    // Use IP as key, fallback to 'anonymous' for load balancers
    const key = req.ip || req.headers['x-forwarded-for']?.toString() || 'anonymous';

    if (!limiter.isAllowed(key)) {
      return res.status(429).json({
        error: "Too many requests",
        message: `Rate limit exceeded. Please wait before making more requests.`,
        retryAfter: Math.ceil(windowMs / 1000),
      });
    }

    next();
  };
}

// Background task queue for heavy processing
type TaskFunction = () => Promise<void>;

class BackgroundTaskQueue {
  private queue: TaskFunction[] = [];
  private processing = false;
  private maxConcurrent = 3;
  private currentlyProcessing = 0;

  enqueue(task: TaskFunction): void {
    this.queue.push(task);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.currentlyProcessing >= this.maxConcurrent) {
      return;
    }

    const task = this.queue.shift();
    if (!task) {
      return;
    }

    this.currentlyProcessing++;

    try {
      await task();
    } catch (error) {
      console.error('[BackgroundTask] Task failed:', error);
    } finally {
      this.currentlyProcessing--;
      // Process next task on next tick to prevent blocking
      setImmediate(() => this.processQueue());
    }
  }
}

export const backgroundTaskQueue = new BackgroundTaskQueue();

// Helper to offload heavy processing to background
export function offloadToBackground(task: TaskFunction): void {
  backgroundTaskQueue.enqueue(task);
}

