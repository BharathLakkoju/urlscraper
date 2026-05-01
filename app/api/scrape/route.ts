import { NextRequest, NextResponse } from "next/server";
import { parse } from "node-html-parser";
import TurndownService from "turndown";

// ─── Server-side rate limiting (in-memory, per IP) ───────────────────────────
const ipRequests = new Map<string, number[]>();
const SERVER_RATE_LIMIT = 20;
const SERVER_RATE_WINDOW_MS = 60_000;
let lastCleanup = Date.now();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  // Periodic cleanup — prevents unbounded map growth in long-running processes
  if (now - lastCleanup > SERVER_RATE_WINDOW_MS * 5) {
    for (const [key, times] of ipRequests) {
      const fresh = times.filter((t) => now - t < SERVER_RATE_WINDOW_MS);
      if (fresh.length === 0) ipRequests.delete(key);
      else ipRequests.set(key, fresh);
    }
    lastCleanup = now;
  }
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

// ─── Structured data helpers ──────────────────────────────────────────────────

/** Strip all markdown syntax and collapse whitespace into a single clean string. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1")
    .replace(/`{3}[\s\S]*?`{3}/g, "")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/^---+$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Section = {
  heading: string;
  level: number;
  word_count: number;
  body: string;
};

function buildSections(md: string): Section[] {
  const sections: Section[] = [];
  const headingRe = /^(#{1,6})\s+(.+)$/;
  let heading = "";
  let level = 0;
  const buf: string[] = [];

  const flush = () => {
    const body = stripMarkdown(buf.join(" "));
    if (body) {
      sections.push({
        heading,
        level,
        word_count: body.split(/\s+/).filter(Boolean).length,
        body,
      });
    }
    buf.length = 0;
  };

  for (const line of md.split("\n")) {
    const m = line.match(headingRe);
    if (m) {
      flush();
      level = m[1].length;
      heading = m[2].trim();
    } else if (line.trim()) {
      buf.push(line.trim());
    }
  }
  flush();
  return sections;
}

/** Extract fenced code blocks — useful for AI context on technical pages. */
function extractCodeBlocks(md: string): Array<{ language: string; code: string }> {
  const blocks: Array<{ language: string; code: string }> = [];
  const re = /^```(\w*)\n([\s\S]*?)^```/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const code = m[2].trim();
    if (code.length > 0 && code.length < 4_000) {
      blocks.push({ language: m[1] || "text", code });
    }
  }
  return blocks.slice(0, 10);
}

/** Heuristically classify the page content type — helps AI tailor responses. */
function detectContentType(sampleHtml: string, title: string): string {
  const lower = (title + " " + sampleHtml).toLowerCase();
  if (/documentation|api reference|reference guide|developer guide/.test(lower))
    return "documentation";
  if (/\btutorial\b|how[-\s]to|step[- ]by[- ]step|\bguide\b/.test(lower))
    return "tutorial";
  if (/\bnews\b|breaking|journalist|reporter/.test(lower)) return "news";
  if (/research|abstract|methodology|conclusion|doi\.org/.test(lower)) return "research";
  if (/wikipedia|encyclop/.test(lower)) return "encyclopedia";
  if (/product|pricing|buy now|add to cart|shop/.test(lower)) return "product";
  if (/\bblog\b|personal site|opinion|essay/.test(lower)) return "blog";
  return "article";
}

function isCopyrightBoilerplateLine(line: string): boolean {
  const normalized = line.replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const lower = normalized.toLowerCase();
  return normalized.length <= 160 && (
    /(?:^|\s)(?:©|\(c\)|copyright)(?:\s+\d{4}(?:\s*[-–]\s*\d{4})?)?/i.test(normalized) ||
    lower.includes("all rights reserved")
  );
}

function stripBoilerplateLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !isCopyrightBoilerplateLine(line))
    .join("\n");
}

function sanitizeTextValue(value: string): string {
  return stripBoilerplateLines(value)
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Markdown output sanitization ────────────────────────────────────────────
function sanitizeMarkdown(md: string): string {
  return stripBoilerplateLines(md)
    // Remove javascript: / data: / vbscript: link targets
    .replace(/\[([^\]]*)\]\(\s*(javascript|data|vbscript):[^)]*\)/gi, "$1")
    // Strip raw script / iframe blocks Turndown may have passed through
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    // Remove inline event handlers
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    // Collapse any runs of blank lines left behind
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: NextRequest) {
  // Security headers applied to every response from this route
  const securityHeaders = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };

  try {
    // ── Rate limiting ─────────────────────────────────────────────────────────
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded
      ? forwarded.split(",")[0].trim()
      : (req.headers.get("x-real-ip") ?? "unknown");
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429, headers: securityHeaders }
      );
    }

    // ── Parse & validate body ─────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400, headers: securityHeaders }
      );
    }
    if (!body || typeof body !== "object" || !("url" in body)) {
      return NextResponse.json(
        { error: "Missing url field" },
        { status: 400, headers: securityHeaders }
      );
    }
    const rawUrl = (body as Record<string, unknown>).url;
    if (typeof rawUrl !== "string") {
      return NextResponse.json(
        { error: "url must be a string" },
        { status: 400, headers: securityHeaders }
      );
    }

    // ── URL validation (SSRF + protocol check) ────────────────────────────────
    const validation = validateUrl(rawUrl);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400, headers: securityHeaders }
      );
    }
    const safeUrl = validation.url.toString();
    const hostname = validation.url.hostname;

    // ── Fetch page ────────────────────────────────────────────────────────────
    const response = await fetch(safeUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; URLScraper/1.0; +https://scraper.dev)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status} ${response.statusText}` },
        { status: 400, headers: securityHeaders }
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { error: `Unsupported content type: ${contentType}. Only HTML pages are supported.` },
        { status: 400, headers: securityHeaders }
      );
    }

    // ── Response size cap ─────────────────────────────────────────────────────
    const clHeader = response.headers.get("content-length");
    if (clHeader && Number(clHeader) > MAX_RESPONSE_BYTES) {
      return NextResponse.json(
        { error: "Page is too large to process (limit: 5 MB)." },
        { status: 400, headers: securityHeaders }
      );
    }

    const html = await response.text();
    if (html.length > MAX_RESPONSE_BYTES) {
      return NextResponse.json(
        { error: "Page is too large to process (limit: 5 MB)." },
        { status: 400, headers: securityHeaders }
      );
    }

    const root = parse(html);

    // ── Strip noise elements ──────────────────────────────────────────────────
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

    // ── Extract metadata ──────────────────────────────────────────────────────
    // Prefer OpenGraph titles for accuracy, fall back to <title>
    const title = sanitizeTextValue(
      root.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim() ||
      root.querySelector("title")?.text?.trim() ||
      ""
    );

    const description = sanitizeTextValue(
      root.querySelector("meta[property='og:description']")?.getAttribute("content")?.trim() ||
      root.querySelector("meta[name='description']")?.getAttribute("content")?.trim() ||
      ""
    );

    const siteName = sanitizeTextValue(
      root.querySelector("meta[property='og:site_name']")?.getAttribute("content")?.trim() ||
      ""
    );

    const canonicalUrl =
      root.querySelector("link[rel='canonical']")?.getAttribute("href")?.trim() ||
      safeUrl;

    const author = sanitizeTextValue(
      root.querySelector("meta[name='author']")?.getAttribute("content")?.trim() ||
      root.querySelector("meta[property='article:author']")?.getAttribute("content")?.trim() ||
      root.querySelector("[itemprop='author'] [itemprop='name']")?.text?.trim() ||
      ""
    );

    const published =
      root.querySelector("meta[property='article:published_time']")?.getAttribute("content")?.trim() ||
      root.querySelector("meta[name='date']")?.getAttribute("content")?.trim() ||
      root.querySelector("time[datetime]")?.getAttribute("datetime")?.trim() ||
      "";

    const modified =
      root.querySelector("meta[property='article:modified_time']")?.getAttribute("content")?.trim() ||
      root.querySelector("meta[name='last-modified']")?.getAttribute("content")?.trim() ||
      "";

    const lang =
      root.querySelector("html")?.getAttribute("lang")?.split("-")[0].toLowerCase() ||
      "en";

    const keywordsRaw = sanitizeTextValue(
      root.querySelector("meta[name='keywords']")?.getAttribute("content")?.trim() ||
      ""
    );
    const keywords = keywordsRaw
      ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20)
      : [];

    // ── Locate main content area ──────────────────────────────────────────────
    const contentSelectors = [
      "article", "main", "[role='main']",
      ".content", "#content", ".post", ".entry", "body",
    ];
    let contentHtml = "";
    for (const sel of contentSelectors) {
      const el = root.querySelector(sel);
      if (el) { contentHtml = el.innerHTML; break; }
    }
    if (!contentHtml) contentHtml = root.innerHTML;

    // ── Convert HTML → Markdown ───────────────────────────────────────────────
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });

    td.addRule("removeMedia", {
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

      const markdown = td.turndown(contentHtml)
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+$/gm, "")
      .trim();

    // Build final markdown with title / description header
    const parts: string[] = [];
    if (title) parts.push(`# ${title}`);
    if (description) parts.push(`> ${description}`);
    if (parts.length) parts.push("---");
    parts.push(markdown);

    const finalMarkdown = sanitizeMarkdown(parts.join("\n\n"));

    // ── Build AI-optimised structured document ────────────────────────────────
    const sections = buildSections(finalMarkdown);
    const codeBlocks = extractCodeBlocks(finalMarkdown);
    const wordCount = finalMarkdown.split(/\s+/).filter(Boolean).length;
    const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));
    const content = stripMarkdown(finalMarkdown);
    // Summary: first ~600 characters of cleaned content — quick AI context
    const summary = content.length > 600
      ? content.slice(0, 600).replace(/\s+\S+$/, "").trim() + "…"
      : content;
    const headings = sections
      .filter((s) => s.heading)
      .map((s) => ({ level: s.level, text: s.heading }));

    // Build meta object — only include fields that have values (cleaner JSON)
    const meta: Record<string, unknown> = {
      title,
      description,
      language: lang,
      content_type: detectContentType(html.slice(0, 3_000), title),
    };
    if (siteName) meta.site_name = siteName;
    if (author) meta.author = author;
    if (published) meta.published = published;
    if (modified) meta.modified = modified;
    if (keywords.length) meta.keywords = keywords;

    // Build source block
    const source: Record<string, unknown> = { url: canonicalUrl, domain: hostname };
    if (safeUrl !== canonicalUrl) source.original_url = safeUrl;

    const structured = {
      schema_version: "1.1",
      scraped_at: new Date().toISOString(),
      source,
      meta,
      stats: {
        word_count: wordCount,
        reading_time_minutes: readingTimeMinutes,
        section_count: sections.length,
        // Rough token estimate (GPT-4 avg ≈ 4 chars/token) for context planning
        token_estimate: Math.ceil(content.length / 4),
      },
      summary,
      headings,
      sections,
      ...(codeBlocks.length ? { code_blocks: codeBlocks } : {}),
      content,
    };

    return NextResponse.json(
      {
        markdown: finalMarkdown,
        title,
        wordCount,
        charCount: finalMarkdown.length,
        readingTimeMinutes,
        url: safeUrl,
        structured,
      },
      { headers: securityHeaders }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("timeout") || message.includes("abort")) {
      return NextResponse.json(
        { error: "Request timed out. The page took too long to respond." },
        { status: 408, headers: { "X-Content-Type-Options": "nosniff" } }
      );
    }
    return NextResponse.json(
      { error: `Scraping failed: ${message}` },
      { status: 500, headers: { "X-Content-Type-Options": "nosniff" } }
    );
  }
}
