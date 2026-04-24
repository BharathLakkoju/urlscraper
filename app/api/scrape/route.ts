import { NextRequest, NextResponse } from "next/server";
import { parse } from "node-html-parser";
import TurndownService from "turndown";

// ─── Server-side rate limiting (in-memory, per IP) ───────────────────────────
const ipRequests = new Map<string, number[]>();
const SERVER_RATE_LIMIT = 20;        // requests per IP
const SERVER_RATE_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = (ipRequests.get(ip) ?? []).filter((t) => now - t < SERVER_RATE_WINDOW_MS);
  if (prev.length >= SERVER_RATE_LIMIT) return false;
  ipRequests.set(ip, [...prev, now]);
  return true;
}

// ─── SSRF – block private, loopback, and cloud-metadata hosts ────────────────
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^169\.254\./,   // link-local / AWS IMDS / GCP metadata
  /\.internal$/i,
  /\.local$/i,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOST_PATTERNS.some((r) => r.test(hostname));
}

// ─── Input validation ─────────────────────────────────────────────────────────
const MAX_URL_LENGTH = 2048;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

function validateUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  if (!raw || typeof raw !== "string") return { ok: false, error: "URL is required" };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, error: "URL exceeds maximum length (2048 chars)" };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are supported" };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, error: "Access to this host is not allowed" };
  }
  return { ok: true, url: parsed };
}

// ─── Markdown output sanitization ────────────────────────────────────────────
function sanitizeMarkdown(md: string): string {
  return md
    // Remove javascript: / data: / vbscript: link targets
    .replace(/\[([^\]]*)\]\(\s*(javascript|data|vbscript):[^)]*\)/gi, "$1")
    // Strip raw script / iframe blocks Turndown may have passed through
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    // Remove inline event handlers
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
}

export async function POST(req: NextRequest) {
  try {
    // ── Server-side rate limiting ─────────────────────────────────────────────
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded
      ? forwarded.split(",")[0].trim()
      : (req.headers.get("x-real-ip") ?? "unknown");
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    // ── Parse and validate request body ──────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || !("url" in body)) {
      return NextResponse.json({ error: "Missing url field" }, { status: 400 });
    }
    const rawUrl = (body as Record<string, unknown>).url;
    if (typeof rawUrl !== "string") {
      return NextResponse.json({ error: "url must be a string" }, { status: 400 });
    }

    // ── URL validation (SSRF + protocol check) ────────────────────────────────
    const validation = validateUrl(rawUrl);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const safeUrl = validation.url.toString();

    const response = await fetch(safeUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; URLScraper/1.0; +https://scraper.dev)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status} ${response.statusText}` },
        { status: 400 }
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { error: `Unsupported content type: ${contentType}. Only HTML pages are supported.` },
        { status: 400 }
      );
    }

    // ── Response size cap ─────────────────────────────────────────────────────
    const clHeader = response.headers.get("content-length");
    if (clHeader && Number(clHeader) > MAX_RESPONSE_BYTES) {
      return NextResponse.json(
        { error: "Page is too large to process (limit: 5 MB)." },
        { status: 400 }
      );
    }

    const html = await response.text();
    if (html.length > MAX_RESPONSE_BYTES) {
      return NextResponse.json(
        { error: "Page is too large to process (limit: 5 MB)." },
        { status: 400 }
      );
    }
    const root = parse(html);

    // Remove noise elements
    const noiseSelectors = [
      "script", "style", "noscript", "iframe", "svg", "canvas",
      "nav", "footer", "header", "aside",
      "[class*='cookie']", "[class*='popup']", "[class*='modal']",
      "[class*='banner']", "[class*='ad']", "[id*='ad']",
      "[class*='sidebar']", "[class*='share']", "[class*='social']",
      "[class*='comment']", "[class*='newsletter']",
    ];
    noiseSelectors.forEach((sel) => {
      root.querySelectorAll(sel).forEach((el) => el.remove());
    });

    // Extract title
    const titleEl = root.querySelector("title");
    const title = titleEl?.text?.trim() ?? "";

    // Extract meta description
    const metaDesc = root.querySelector("meta[name='description']")?.getAttribute("content")?.trim() ?? "";

    // Try to grab main content area
    const contentSelectors = ["article", "main", "[role='main']", ".content", "#content", ".post", ".entry", "body"];
    let contentHtml = "";
    for (const sel of contentSelectors) {
      const el = root.querySelector(sel);
      if (el) {
        contentHtml = el.innerHTML;
        break;
      }
    }

    if (!contentHtml) contentHtml = root.innerHTML;

    // Convert HTML → Markdown
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });

    // Remove remaining tags that aren't useful
    td.addRule("removeImages", {
      filter: ["img", "picture", "figure", "video", "audio", "source", "track"],
      replacement: () => "",
    });

    td.addRule("removeButtons", {
      filter: (node) => {
        const tag = node.nodeName.toLowerCase();
        const role = node.getAttribute?.("role") ?? "";
        return tag === "button" || role === "button";
      },
      replacement: () => "",
    });

    td.addRule("cleanLinks", {
      filter: "a",
      replacement: (content) => (content.trim() ? content.trim() : ""),
    });

    let markdown = td.turndown(contentHtml);

    // Clean up excessive blank lines and whitespace
    markdown = markdown
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+$/gm, "")
      .trim();

    // Build final output
    const parts: string[] = [];
    if (title) parts.push(`# ${title}`);
    if (metaDesc) parts.push(`> ${metaDesc}`);
    if (parts.length) parts.push("---");
    parts.push(markdown);

    const finalMarkdown = sanitizeMarkdown(parts.join("\n\n"));

    return NextResponse.json({
      markdown: finalMarkdown,
      title,
      wordCount: finalMarkdown.split(/\s+/).filter(Boolean).length,
      charCount: finalMarkdown.length,
      url: safeUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("timeout") || message.includes("abort")) {
      return NextResponse.json({ error: "Request timed out. The page took too long to respond." }, { status: 408 });
    }
    return NextResponse.json({ error: `Scraping failed: ${message}` }, { status: 500 });
  }
}
