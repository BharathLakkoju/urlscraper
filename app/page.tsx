"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

// ─── Types ───────────────────────────────────────────────────────────────────

type Section = {
  heading: string;
  level: number;
  word_count: number;
  body: string;
};

type StructuredData = {
  schema_version: string;
  scraped_at: string;
  source: {
    url: string;
    domain: string;
    original_url?: string;
  };
  meta: {
    title: string;
    description: string;
    language: string;
    content_type: string;
    site_name?: string;
    author?: string;
    published?: string;
    modified?: string;
    keywords?: string[];
  };
  stats: {
    word_count: number;
    reading_time_minutes: number;
    section_count: number;
    token_estimate: number;
  };
  summary: string;
  headings: { level: number; text: string }[];
  sections: Section[];
  code_blocks?: { language: string; code: string }[];
  content: string;
};

type ScrapeResult = {
  markdown: string;
  title: string;
  wordCount: number;
  charCount: number;
  readingTimeMinutes: number;
  url: string;
  structured: StructuredData;
};

type Status = "idle" | "loading" | "success" | "error";
type ViewMode = "markdown" | "plaintext" | "json";
type ThemeId =
  | "terminal"
  | "midnight"
  | "obsidian"
  | "rose"
  | "slate"
  | "ocean"
  | "nord"
  | "forest"
  | "paper"
  | "warm"
  | "solarized"
  | "github"
  | "mint"
  | "ivory"
  | "petal"
  | "sky";

// ─── Themes ──────────────────────────────────────────────────────────────────

type ThemeVars = Record<string, string>;
type Theme = {
  id: ThemeId;
  name: string;
  dark: boolean;
  swatches: [string, string, string]; // [bg, accent, text]
  vars: ThemeVars;
};

const THEMES: Record<ThemeId, Theme> = {
  // ── Dark ──
  terminal: {
    id: "terminal",
    name: "Terminal",
    dark: true,
    swatches: ["#0a0a0c", "#7fff6a", "#e8e8f0"],
    vars: {
      "--bg": "#0a0a0c",
      "--surface": "#111115",
      "--border": "#1e1e26",
      "--border-bright": "#2e2e3e",
      "--accent": "#7fff6a",
      "--accent-dim": "rgba(127,255,106,0.14)",
      "--accent-fg": "#0a0a0c",
      "--text": "#e8e8f0",
      "--text-muted": "#6a6a80",
      "--text-dim": "#3a3a50",
      "--error": "#ff5f5f",
      "--error-bg": "rgba(255,95,95,0.06)",
      "--code-bg": "#18181e",
      "--blockquote-border": "#7fff6a",
      "--noise-opacity": "0.4",
    },
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    dark: true,
    swatches: ["#070b18", "#60a5fa", "#dde8fc"],
    vars: {
      "--bg": "#070b18",
      "--surface": "#0c1228",
      "--border": "#172040",
      "--border-bright": "#263a66",
      "--accent": "#60a5fa",
      "--accent-dim": "rgba(96,165,250,0.14)",
      "--accent-fg": "#070b18",
      "--text": "#dde8fc",
      "--text-muted": "#5a70a8",
      "--text-dim": "#263460",
      "--error": "#f87171",
      "--error-bg": "rgba(248,113,113,0.06)",
      "--code-bg": "#0a1020",
      "--blockquote-border": "#60a5fa",
      "--noise-opacity": "0.35",
    },
  },
  obsidian: {
    id: "obsidian",
    name: "Obsidian",
    dark: true,
    swatches: ["#0c0b14", "#c084fc", "#eae8f8"],
    vars: {
      "--bg": "#0c0b14",
      "--surface": "#13121e",
      "--border": "#1e1c2e",
      "--border-bright": "#2e2c48",
      "--accent": "#c084fc",
      "--accent-dim": "rgba(192,132,252,0.14)",
      "--accent-fg": "#0c0b14",
      "--text": "#eae8f8",
      "--text-muted": "#7460b0",
      "--text-dim": "#302c58",
      "--error": "#f87171",
      "--error-bg": "rgba(248,113,113,0.06)",
      "--code-bg": "#100f1c",
      "--blockquote-border": "#c084fc",
      "--noise-opacity": "0.35",
    },
  },
  rose: {
    id: "rose",
    name: "Rose",
    dark: true,
    swatches: ["#130810", "#fb7185", "#fce8ee"],
    vars: {
      "--bg": "#130810",
      "--surface": "#1e0f18",
      "--border": "#2e1a28",
      "--border-bright": "#4a2a3c",
      "--accent": "#fb7185",
      "--accent-dim": "rgba(251,113,133,0.14)",
      "--accent-fg": "#130810",
      "--text": "#fce8ee",
      "--text-muted": "#9a6880",
      "--text-dim": "#4a2a3c",
      "--error": "#f87171",
      "--error-bg": "rgba(248,113,113,0.06)",
      "--code-bg": "#1a0e16",
      "--blockquote-border": "#fb7185",
      "--noise-opacity": "0.35",
    },
  },
  slate: {
    id: "slate",
    name: "Slate",
    dark: true,
    swatches: ["#0d1117", "#94a3b8", "#e2e8f0"],
    vars: {
      "--bg": "#0d1117",
      "--surface": "#161b22",
      "--border": "#21262d",
      "--border-bright": "#30363d",
      "--accent": "#94a3b8",
      "--accent-dim": "rgba(148,163,184,0.14)",
      "--accent-fg": "#0d1117",
      "--text": "#e2e8f0",
      "--text-muted": "#6e7681",
      "--text-dim": "#30363d",
      "--error": "#f87171",
      "--error-bg": "rgba(248,113,113,0.06)",
      "--code-bg": "#0d1117",
      "--blockquote-border": "#94a3b8",
      "--noise-opacity": "0.3",
    },
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    dark: true,
    swatches: ["#071218", "#22d3ee", "#e0f4f8"],
    vars: {
      "--bg": "#071218",
      "--surface": "#0c1e28",
      "--border": "#152e3e",
      "--border-bright": "#1e4a60",
      "--accent": "#22d3ee",
      "--accent-dim": "rgba(34,211,238,0.14)",
      "--accent-fg": "#071218",
      "--text": "#e0f4f8",
      "--text-muted": "#4a8898",
      "--text-dim": "#1e4a60",
      "--error": "#f87171",
      "--error-bg": "rgba(248,113,113,0.06)",
      "--code-bg": "#091620",
      "--blockquote-border": "#22d3ee",
      "--noise-opacity": "0.35",
    },
  },
  nord: {
    id: "nord",
    name: "Nord",
    dark: true,
    swatches: ["#2e3440", "#88c0d0", "#eceff4"],
    vars: {
      "--bg": "#2e3440",
      "--surface": "#3b4252",
      "--border": "#434c5e",
      "--border-bright": "#4c566a",
      "--accent": "#88c0d0",
      "--accent-dim": "rgba(136,192,208,0.2)",
      "--accent-fg": "#2e3440",
      "--text": "#eceff4",
      "--text-muted": "#9aa4b8",
      "--text-dim": "#4c566a",
      "--error": "#bf616a",
      "--error-bg": "rgba(191,97,106,0.1)",
      "--code-bg": "#2e3440",
      "--blockquote-border": "#88c0d0",
      "--noise-opacity": "0.2",
    },
  },
  forest: {
    id: "forest",
    name: "Forest",
    dark: true,
    swatches: ["#080f0a", "#4ade80", "#e2f8e8"],
    vars: {
      "--bg": "#080f0a",
      "--surface": "#0e1a10",
      "--border": "#162418",
      "--border-bright": "#1e3820",
      "--accent": "#4ade80",
      "--accent-dim": "rgba(74,222,128,0.14)",
      "--accent-fg": "#080f0a",
      "--text": "#e2f8e8",
      "--text-muted": "#5a8a60",
      "--text-dim": "#1e3820",
      "--error": "#f87171",
      "--error-bg": "rgba(248,113,113,0.06)",
      "--code-bg": "#0a1408",
      "--blockquote-border": "#4ade80",
      "--noise-opacity": "0.4",
    },
  },
  // ── Light ──
  paper: {
    id: "paper",
    name: "Paper",
    dark: false,
    swatches: ["#f9f9f6", "#16a34a", "#1a1a16"],
    vars: {
      "--bg": "#f9f9f6",
      "--surface": "#f0f0eb",
      "--border": "#deded6",
      "--border-bright": "#c0c0b8",
      "--accent": "#16a34a",
      "--accent-dim": "rgba(22,163,74,0.1)",
      "--accent-fg": "#ffffff",
      "--text": "#1a1a16",
      "--text-muted": "#585850",
      "--text-dim": "#aeaea6",
      "--error": "#dc2626",
      "--error-bg": "rgba(220,38,38,0.06)",
      "--code-bg": "#e8e8e2",
      "--blockquote-border": "#16a34a",
      "--noise-opacity": "0.18",
    },
  },
  warm: {
    id: "warm",
    name: "Warm",
    dark: false,
    swatches: ["#faf6ed", "#d97706", "#1e1608"],
    vars: {
      "--bg": "#faf6ed",
      "--surface": "#f2ead8",
      "--border": "#e4d8bc",
      "--border-bright": "#ccc0a0",
      "--accent": "#d97706",
      "--accent-dim": "rgba(217,119,6,0.1)",
      "--accent-fg": "#ffffff",
      "--text": "#1e1608",
      "--text-muted": "#6b5830",
      "--text-dim": "#c0aa80",
      "--error": "#dc2626",
      "--error-bg": "rgba(220,38,38,0.06)",
      "--code-bg": "#ede4cc",
      "--blockquote-border": "#d97706",
      "--noise-opacity": "0.18",
    },
  },
  solarized: {
    id: "solarized",
    name: "Solarized",
    dark: false,
    swatches: ["#fdf6e3", "#268bd2", "#657b83"],
    vars: {
      "--bg": "#fdf6e3",
      "--surface": "#eee8d5",
      "--border": "#ddd8c8",
      "--border-bright": "#b8b4a0",
      "--accent": "#268bd2",
      "--accent-dim": "rgba(38,139,210,0.1)",
      "--accent-fg": "#ffffff",
      "--text": "#657b83",
      "--text-muted": "#93a1a1",
      "--text-dim": "#c0bba0",
      "--error": "#dc322f",
      "--error-bg": "rgba(220,50,47,0.06)",
      "--code-bg": "#e8e2d0",
      "--blockquote-border": "#268bd2",
      "--noise-opacity": "0.18",
    },
  },
  github: {
    id: "github",
    name: "GitHub",
    dark: false,
    swatches: ["#ffffff", "#0969da", "#1f2328"],
    vars: {
      "--bg": "#ffffff",
      "--surface": "#f6f8fa",
      "--border": "#d0d7de",
      "--border-bright": "#b0bac4",
      "--accent": "#0969da",
      "--accent-dim": "rgba(9,105,218,0.08)",
      "--accent-fg": "#ffffff",
      "--text": "#1f2328",
      "--text-muted": "#57606a",
      "--text-dim": "#b0bac4",
      "--error": "#cf222e",
      "--error-bg": "rgba(207,34,46,0.06)",
      "--code-bg": "#f6f8fa",
      "--blockquote-border": "#0969da",
      "--noise-opacity": "0.06",
    },
  },
  mint: {
    id: "mint",
    name: "Mint",
    dark: false,
    swatches: ["#f0faf5", "#059669", "#0f2d1e"],
    vars: {
      "--bg": "#f0faf5",
      "--surface": "#e4f5ec",
      "--border": "#c6e8d4",
      "--border-bright": "#a0d4b8",
      "--accent": "#059669",
      "--accent-dim": "rgba(5,150,105,0.1)",
      "--accent-fg": "#ffffff",
      "--text": "#0f2d1e",
      "--text-muted": "#3a6e52",
      "--text-dim": "#a0d4b8",
      "--error": "#dc2626",
      "--error-bg": "rgba(220,38,38,0.06)",
      "--code-bg": "#d8f0e4",
      "--blockquote-border": "#059669",
      "--noise-opacity": "0.14",
    },
  },
  ivory: {
    id: "ivory",
    name: "Ivory",
    dark: false,
    swatches: ["#fffff0", "#92400e", "#1c1007"],
    vars: {
      "--bg": "#fffff0",
      "--surface": "#faf9e4",
      "--border": "#e8e4c8",
      "--border-bright": "#d0c89c",
      "--accent": "#92400e",
      "--accent-dim": "rgba(146,64,14,0.08)",
      "--accent-fg": "#ffffff",
      "--text": "#1c1007",
      "--text-muted": "#6b5230",
      "--text-dim": "#c8be98",
      "--error": "#b91c1c",
      "--error-bg": "rgba(185,28,28,0.06)",
      "--code-bg": "#f0edd4",
      "--blockquote-border": "#92400e",
      "--noise-opacity": "0.2",
    },
  },
  petal: {
    id: "petal",
    name: "Petal",
    dark: false,
    swatches: ["#fff0f4", "#be185d", "#2d0a18"],
    vars: {
      "--bg": "#fff0f4",
      "--surface": "#fce7ef",
      "--border": "#f4c2d4",
      "--border-bright": "#e89ab6",
      "--accent": "#be185d",
      "--accent-dim": "rgba(190,24,93,0.08)",
      "--accent-fg": "#ffffff",
      "--text": "#2d0a18",
      "--text-muted": "#7c3254",
      "--text-dim": "#e89ab6",
      "--error": "#9f1239",
      "--error-bg": "rgba(159,18,57,0.06)",
      "--code-bg": "#f8dde8",
      "--blockquote-border": "#be185d",
      "--noise-opacity": "0.14",
    },
  },
  sky: {
    id: "sky",
    name: "Sky",
    dark: false,
    swatches: ["#f0f9ff", "#0284c7", "#0c1f2e"],
    vars: {
      "--bg": "#f0f9ff",
      "--surface": "#e0f2fe",
      "--border": "#bae6fd",
      "--border-bright": "#7dd3fc",
      "--accent": "#0284c7",
      "--accent-dim": "rgba(2,132,199,0.1)",
      "--accent-fg": "#ffffff",
      "--text": "#0c1f2e",
      "--text-muted": "#2c6a8e",
      "--text-dim": "#93c5d8",
      "--error": "#dc2626",
      "--error-bg": "rgba(220,38,38,0.06)",
      "--code-bg": "#cceeff",
      "--blockquote-border": "#0284c7",
      "--noise-opacity": "0.12",
    },
  },
};

const DARK_THEMES: ThemeId[] = [
  "terminal",
  "midnight",
  "obsidian",
  "rose",
  "slate",
  "ocean",
  "nord",
  "forest",
];
const LIGHT_THEMES: ThemeId[] = [
  "paper",
  "warm",
  "solarized",
  "github",
  "mint",
  "ivory",
  "petal",
  "sky",
];

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000;
const RATE_KEY = "scraper_requests";

function getRateLimitInfo(): { remaining: number; resetIn: number } {
  if (typeof window === "undefined")
    return { remaining: RATE_LIMIT, resetIn: 0 };
  const now = Date.now();
  let timestamps: number[] = [];
  try {
    const stored = localStorage.getItem(RATE_KEY);
    timestamps = stored ? JSON.parse(stored) : [];
  } catch {
    timestamps = [];
  }
  timestamps = timestamps.filter((t) => now - t < RATE_WINDOW);
  const remaining = Math.max(0, RATE_LIMIT - timestamps.length);
  const oldest = timestamps.length >= RATE_LIMIT ? timestamps[0] : null;
  const resetIn = oldest ? Math.ceil((RATE_WINDOW - (now - oldest)) / 1000) : 0;
  return { remaining, resetIn };
}

function recordRequest() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  let timestamps: number[] = [];
  try {
    const stored = localStorage.getItem(RATE_KEY);
    timestamps = stored ? JSON.parse(stored) : [];
  } catch {
    timestamps = [];
  }
  timestamps = timestamps.filter((t) => now - t < RATE_WINDOW);
  timestamps.push(now);
  localStorage.setItem(RATE_KEY, JSON.stringify(timestamps));
}

// ─── Scraping via API Route ───────────────────────────────────────────────────

async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const res = await fetch("/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to scrape");
  return data;
}

// ─── Plain text converter ─────────────────────────────────────────────────────

function toPlainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1")
    .replace(/`{3}[\s\S]*?`{3}/g, (m) =>
      m.replace(/`/g, "").replace(/^[a-z]+\n/, ""),
    )
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^---+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── JSON syntax highlighter ──────────────────────────────────────────────────

function syntaxHighlightJson(obj: object, minified = false): string {
  const json = minified ? JSON.stringify(obj) : JSON.stringify(obj, null, 2);
  // HTML-escape unsafe chars before injecting spans
  const safe = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return safe.replace(
    /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls: string;
      if (match.startsWith('"')) {
        cls = match.trimEnd().endsWith(":") ? "json-key" : "json-string";
      } else if (match === "true" || match === "false") {
        cls = "json-bool";
      } else if (match === "null") {
        cls = "json-null";
      } else {
        cls = "json-number";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

// ─── Theme Dropdown ───────────────────────────────────────────────────────────

function ThemeDropdown({
  themeId,
  onChange,
}: {
  themeId: ThemeId;
  onChange: (id: ThemeId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const theme = THEMES[themeId];

  return (
    <div ref={ref} className="theme-select">
      <button className="theme-select-btn" onClick={() => setOpen((o) => !o)}>
        <span className="swatch-row">
          {theme.swatches.map((c, i) => (
            <span key={i} className="swatch" style={{ background: c }} />
          ))}
        </span>
        <span className="theme-select-name">{theme.name}</span>
        <span className="theme-select-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="theme-dropdown">
          <div className="theme-group-label">dark</div>
          {DARK_THEMES.map((id) => (
            <button
              key={id}
              className={`theme-option ${themeId === id ? "selected" : ""}`}
              onClick={() => {
                onChange(id);
                setOpen(false);
              }}
            >
              <span className="swatch-row">
                {THEMES[id].swatches.map((c, i) => (
                  <span key={i} className="swatch" style={{ background: c }} />
                ))}
              </span>
              <span className="theme-option-name">{THEMES[id].name}</span>
              {themeId === id && <span className="theme-check">✓</span>}
            </button>
          ))}
          <div className="theme-group-label">light</div>
          {LIGHT_THEMES.map((id) => (
            <button
              key={id}
              className={`theme-option ${themeId === id ? "selected" : ""}`}
              onClick={() => {
                onChange(id);
                setOpen(false);
              }}
            >
              <span className="swatch-row">
                {THEMES[id].swatches.map((c, i) => (
                  <span key={i} className="swatch" style={{ background: c }} />
                ))}
              </span>
              <span className="theme-option-name">{THEMES[id].name}</span>
              {themeId === id && <span className="theme-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("markdown");
  const [jsonMinified, setJsonMinified] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>("terminal");
  const [rateInfo, setRateInfo] = useState({
    remaining: RATE_LIMIT,
    resetIn: 0,
  });

  // Load saved theme and initial rate info
  useEffect(() => {
    const saved = localStorage.getItem("scraper_theme") as ThemeId | null;
    if (saved && THEMES[saved]) setThemeId(saved);
    setRateInfo(getRateLimitInfo());
    // Fade out and remove the loading splash
    const splash = document.getElementById("__splash");
    if (splash) {
      splash.style.opacity = "0";
      setTimeout(() => splash.remove(), 280);
    }
  }, []);

  const theme = THEMES[themeId];

  // Sync theme vars, body background, and color-scheme with active theme
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
    document.body.style.background = theme.vars["--bg"];
    document.body.style.color = theme.vars["--text"];
    root.style.colorScheme = theme.dark ? "dark" : "light";
    root.setAttribute("data-theme", themeId);
  }, [theme, themeId]);

  const changeTheme = (id: ThemeId) => {
    setThemeId(id);
    localStorage.setItem("scraper_theme", id);
  };

  // Live rate-limit ticker — refreshes every second while any requests are in use
  useEffect(() => {
    if (rateInfo.remaining >= RATE_LIMIT) return;
    const id = setInterval(() => setRateInfo(getRateLimitInfo()), 1000);
    return () => clearInterval(id);
  }, [rateInfo.remaining]);

  const scrape = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const info = getRateLimitInfo();
    if (info.remaining === 0) {
      setError(`Rate limit reached. Try again in ${info.resetIn}s.`);
      setStatus("error");
      return;
    }

    let finalUrl = trimmed;
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = "https://" + finalUrl;
    }

    // Client-side validation
    if (finalUrl.length > 2048) {
      setError("URL is too long (max 2048 characters).");
      setStatus("error");
      return;
    }
    try {
      const parsed = new URL(finalUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error();
      }
    } catch {
      setError("Invalid URL. Please enter a valid http or https address.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setResult(null);
    setError("");
    recordRequest();
    setRateInfo(getRateLimitInfo());

    try {
      const data = await scrapeUrl(finalUrl);
      setResult(data);
      setStatus("success");
      setRateInfo(getRateLimitInfo());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  }, [url]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") scrape();
  };

  const copyToClipboard = () => {
    if (!result) return;
    let text: string;
    if (viewMode === "json") {
      text = jsonMinified
        ? JSON.stringify(result.structured)
        : JSON.stringify(result.structured, null, 2);
    } else if (viewMode === "plaintext") {
      text = toPlainText(result.markdown);
    } else {
      text = result.markdown;
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadFile = () => {
    if (!result) return;
    let text: string;
    let ext: string;
    if (viewMode === "json") {
      text = jsonMinified
        ? JSON.stringify(result.structured)
        : JSON.stringify(result.structured, null, 2);
      ext = "json";
    } else if (viewMode === "plaintext") {
      text = toPlainText(result.markdown);
      ext = "txt";
    } else {
      text = result.markdown;
      ext = "md";
    }
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `scraped-${Date.now()}.${ext}`;
    a.click();
  };

  const displayText = result
    ? viewMode === "plaintext"
      ? toPlainText(result.markdown)
      : result.markdown
    : "";

  const showRateBar = rateInfo.remaining < RATE_LIMIT;

  return (
    <div className="page" data-theme={themeId}>
      <div className="noise" />

      <header className="header">
        <div className="header-top">
          <div className="logo">
            <span className="logo-bracket">[</span>
            <span className="logo-text">extract</span>
            <span className="logo-bracket">]</span>
          </div>
          <ThemeDropdown themeId={themeId} onChange={changeTheme} />
        </div>
        <p className="tagline">
          Fetch any URL. Get clean readable text. No noise.
        </p>
      </header>

      <main>
        <div className="input-section">
          <div
            className={`input-wrapper ${status === "loading" ? "loading" : ""}`}
          >
            <input
              className="url-input"
              type="text"
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={status === "loading"}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <button
              className="scrape-btn"
              onClick={scrape}
              disabled={!url.trim() || status === "loading"}
            >
              {status === "loading" ? (
                <span className="spinner" />
              ) : (
                "extract →"
              )}
            </button>
          </div>
          {status === "loading" && (
            <div className="loading-bar">
              <div className="loading-fill" />
            </div>
          )}
          {showRateBar && (
            <div className="rate-info">
              <span
                className={`rate-dot${
                  rateInfo.remaining === 0 ? " rate-dot-warn" : ""
                }`}
              />
              <span className="rate-fraction">
                {RATE_LIMIT - rateInfo.remaining}&nbsp;/&nbsp;{RATE_LIMIT} used
              </span>
              <span className="rate-pips" aria-hidden="true">
                {Array.from({ length: RATE_LIMIT }).map((_, i) => (
                  <span
                    key={i}
                    className={`rate-pip${
                      i < RATE_LIMIT - rateInfo.remaining
                        ? rateInfo.remaining === 0
                          ? " rate-pip-used rate-pip-warn"
                          : " rate-pip-used"
                        : ""
                    }`}
                  />
                ))}
              </span>
              {rateInfo.resetIn > 0 && (
                <span
                  className={`rate-timer${
                    rateInfo.remaining === 0 ? " rate-timer-warn" : ""
                  }`}
                >
                  · resets in {rateInfo.resetIn}s
                </span>
              )}
            </div>
          )}
        </div>

        {status === "error" && (
          <div className="error-card">
            <span className="error-icon">✕</span>
            <span>{error}</span>
          </div>
        )}

        {status === "success" && result && (
          <div className="result-section">
            <div className="result-header">
              <div className="result-meta">
                <span className="meta-title">{result.title || "Untitled"}</span>
                <span className="meta-divider">·</span>
                <span className="meta-stat">
                  {result.wordCount.toLocaleString()} words
                </span>
                <span className="meta-divider">·</span>
                <span className="meta-stat">
                  {result.readingTimeMinutes} min read
                </span>
                <span className="meta-divider">·</span>
                <span className="meta-stat">
                  {(result.charCount / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="result-controls">
                <div
                  className="view-toggle"
                  role="group"
                  aria-label="View mode"
                >
                  <button
                    className={`toggle-btn ${viewMode === "markdown" ? "active" : ""}`}
                    onClick={() => setViewMode("markdown")}
                    aria-pressed={viewMode === "markdown"}
                  >
                    markdown
                  </button>
                  <button
                    className={`toggle-btn ${viewMode === "plaintext" ? "active" : ""}`}
                    onClick={() => setViewMode("plaintext")}
                    aria-pressed={viewMode === "plaintext"}
                  >
                    plain text
                  </button>
                  <button
                    className={`toggle-btn ${viewMode === "json" ? "active" : ""}`}
                    onClick={() => setViewMode("json")}
                    aria-pressed={viewMode === "json"}
                  >
                    JSON
                  </button>
                </div>
                {viewMode === "json" && (
                  <button
                    className={`action-btn ${jsonMinified ? "active-dim" : ""}`}
                    onClick={() => setJsonMinified((v) => !v)}
                    aria-label={
                      jsonMinified
                        ? "Switch to pretty JSON"
                        : "Switch to minified JSON"
                    }
                    title={jsonMinified ? "Pretty print" : "Minify"}
                  >
                    {jsonMinified ? "pretty" : "minify"}
                  </button>
                )}
                <button
                  className="action-btn"
                  onClick={copyToClipboard}
                  aria-label={`Copy as ${viewMode === "json" ? "JSON" : viewMode === "plaintext" ? "plain text" : "Markdown"}`}
                >
                  {copied
                    ? "✓ copied"
                    : viewMode === "json"
                      ? "copy .json"
                      : viewMode === "plaintext"
                        ? "copy .txt"
                        : "copy .md"}
                </button>
                <button
                  className="action-btn"
                  onClick={downloadFile}
                  aria-label={`Download as ${viewMode === "json" ? "JSON" : viewMode === "plaintext" ? "plain text" : "Markdown"}`}
                >
                  {viewMode === "json"
                    ? "download .json"
                    : viewMode === "plaintext"
                      ? "download .txt"
                      : "download .md"}
                </button>
              </div>
            </div>

            <div className="output-area">
              {viewMode === "markdown" ? (
                <div className="md-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                  >
                    {displayText}
                  </ReactMarkdown>
                </div>
              ) : viewMode === "json" ? (
                <>
                  <div className="json-banner">
                    <span className="json-banner-label">AI context</span>
                    <span className="json-banner-chips">
                      <span className="json-chip">
                        ~
                        {result.structured.stats.token_estimate.toLocaleString()}{" "}
                        tokens
                      </span>
                      <span className="json-chip">
                        {result.structured.stats.section_count} sections
                      </span>
                      <span className="json-chip">
                        {result.structured.meta.content_type}
                      </span>
                      {result.structured.meta.language !== "en" && (
                        <span className="json-chip">
                          {result.structured.meta.language}
                        </span>
                      )}
                    </span>
                    <span className="json-banner-hint">
                      Paste this JSON directly into any AI chat to add
                      structured page context
                    </span>
                  </div>
                  <pre
                    className="json-body"
                    dangerouslySetInnerHTML={{
                      __html: jsonMinified
                        ? syntaxHighlightJson(result.structured, true)
                        : syntaxHighlightJson(result.structured, false),
                    }}
                  />
                </>
              ) : (
                <pre className="plain-body">{displayText}</pre>
              )}
            </div>
          </div>
        )}

        {status === "idle" && (
          <div className="idle-hints">
            <div className="hint">
              <span className="hint-icon">01</span>
              <span>Paste any public URL — articles, docs, wikis, blogs</span>
            </div>
            <div className="hint">
              <span className="hint-icon">02</span>
              <span>We strip HTML, CSS, scripts, ads, and nav clutter</span>
            </div>
            <div className="hint">
              <span className="hint-icon">03</span>
              <span>
                Copy or download as Markdown, plain text, or structured JSON
              </span>
            </div>
            <div className="hint">
              <span className="hint-icon">04</span>
              <span>
                JSON view generates an AI-ready schema with metadata, sections,
                token estimate, and compressed content — paste it straight into
                any chat
              </span>
            </div>
          </div>
        )}
      </main>

      <style>{styles}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=DM+Sans:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg, #0a0a0c);
    color: var(--text, #e8e8f0);
    font-family: 'DM Sans', sans-serif;
    min-height: 100vh;
  }

  .noise {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
    opacity: var(--noise-opacity, 0.4);
  }

  .page {
    position: relative; z-index: 1;
    max-width: 860px; margin: 0 auto;
    padding: 60px 24px 100px; min-height: 100vh;
  }

  /* ── Header ── */
  .header { margin-bottom: 48px; }
  .header-top {
    display: flex; align-items: center;
    justify-content: space-between; margin-bottom: 10px;
  }
  .logo {
    font-family: 'IBM Plex Mono', monospace;
    font-size: clamp(28px, 5vw, 42px);
    font-weight: 600; letter-spacing: -0.02em;
  }
  .logo-bracket { color: var(--accent); }
  .logo-text { color: var(--text); }
  .tagline {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px; color: var(--text-muted); letter-spacing: 0.03em;
  }

  /* ── Theme Dropdown ── */
  .theme-select { position: relative; }
  .theme-select-btn {
    display: flex; align-items: center; gap: 7px;
    background: var(--surface); border: 1px solid var(--border-bright);
    border-radius: 4px; padding: 6px 10px 6px 8px; cursor: pointer;
    font-family: 'IBM Plex Mono', monospace; font-size: 12px;
    color: var(--text-muted); transition: border-color 0.15s, color 0.15s;
  }
  .theme-select-btn:hover { border-color: var(--accent); color: var(--text); }
  .theme-select-name { white-space: nowrap; }
  .theme-select-arrow { font-size: 8px; opacity: 0.5; margin-left: 2px; }
  .swatch-row { display: flex; gap: 3px; align-items: center; }
  .swatch {
    width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
    border: 1px solid rgba(128,128,128,0.25);
  }
  .theme-dropdown {
    position: absolute; right: 0; top: calc(100% + 5px); z-index: 200;
    background: var(--surface); border: 1px solid var(--border-bright);
    border-radius: 6px; min-width: 178px; overflow: hidden;
    box-shadow: 0 10px 28px rgba(0,0,0,0.35);
    animation: fade-up 0.12s ease;
  }
  .theme-group-label {
    font-family: 'IBM Plex Mono', monospace; font-size: 10px;
    font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase;
    color: var(--text-dim); padding: 8px 12px 3px; pointer-events: none;
  }
  .theme-option {
    display: flex; align-items: center; gap: 8px; width: 100%;
    background: transparent; border: none; padding: 7px 12px;
    cursor: pointer; font-family: 'IBM Plex Mono', monospace;
    font-size: 12px; color: var(--text-muted);
    transition: background 0.12s, color 0.12s; text-align: left;
  }
  .theme-option:hover { background: var(--border); color: var(--text); }
  .theme-option.selected { background: var(--accent-dim); }
  .theme-option.selected .theme-option-name { color: var(--accent); }
  .theme-option-name { flex: 1; }
  .theme-check { color: var(--accent); font-size: 11px; }

  /* ── Input ── */
  .input-section { margin-bottom: 32px; }
  .input-wrapper {
    display: flex; align-items: center;
    background: var(--surface); border: 1px solid var(--border-bright);
    border-radius: 4px; overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .input-wrapper:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-dim), 0 0 20px var(--accent-dim);
  }
  .input-wrapper.loading {
    border-color: var(--accent);
    animation: pulse-border 1.5s ease-in-out infinite;
  }
  @keyframes pulse-border {
    0%, 100% { box-shadow: 0 0 0 1px var(--accent-dim); }
    50% { box-shadow: 0 0 0 1px var(--accent-dim), 0 0 24px var(--accent-dim); }
  }
  .url-input {
    flex: 1; background: transparent; border: none; outline: none;
    color: var(--text); font-family: 'IBM Plex Mono', monospace;
    font-size: 14px; padding: 16px 16px; min-width: 0;
    caret-color: var(--accent);
  }
  .url-input::placeholder { color: var(--text-dim); }
  .url-input:disabled { opacity: 0.5; }
  .scrape-btn {
    font-family: 'IBM Plex Mono', monospace; font-size: 13px; font-weight: 500;
    background: var(--accent); color: var(--accent-fg);
    border: none; padding: 16px 24px; cursor: pointer; white-space: nowrap;
    transition: opacity 0.15s; display: flex; align-items: center; gap: 6px;
    min-width: 110px; justify-content: center;
  }
  .scrape-btn:hover:not(:disabled) { opacity: 0.88; }
  .scrape-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(0,0,0,0.15);
    border-top-color: var(--accent-fg);
    border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-bar { height: 2px; background: var(--border); margin-top: 4px; border-radius: 2px; overflow: hidden; }
  .loading-fill { height: 100%; background: var(--accent); width: 40%; animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }

  /* ── Rate Info ── */
  .rate-info {
    display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
    margin-top: 8px; font-family: 'IBM Plex Mono', monospace;
    font-size: 11px; color: var(--text-muted);
  }
  .rate-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent); flex-shrink: 0;
    transition: background 0.3s;
  }
  .rate-dot.rate-dot-warn { background: var(--error); }
  .rate-fraction { letter-spacing: 0.02em; }
  .rate-pips {
    display: flex; align-items: center; gap: 3px;
  }
  .rate-pip {
    width: 8px; height: 8px; border-radius: 2px;
    background: var(--border-bright); flex-shrink: 0;
    transition: background 0.2s;
  }
  .rate-pip.rate-pip-used { background: var(--accent); }
  .rate-pip.rate-pip-warn { background: var(--error); }
  .rate-timer { color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .rate-timer.rate-timer-warn { color: var(--error); font-weight: 500; }

  /* ── Error ── */
  .error-card {
    display: flex; align-items: flex-start; gap: 12px;
    background: var(--error-bg); border: 1px solid rgba(220,38,38,0.2);
    border-radius: 4px; padding: 16px 20px;
    font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--error);
  }
  .error-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }

  /* ── Result ── */
  .result-section { animation: fade-up 0.3s ease; }
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .result-header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 12px; padding: 12px 0; margin-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .result-meta { display: flex; align-items: center; gap: 8px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; min-width: 0; }
  .meta-title { color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
  .meta-divider { color: var(--text-dim); }
  .meta-stat { color: var(--text-muted); white-space: nowrap; }
  .result-controls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .view-toggle { display: flex; border: 1px solid var(--border-bright); border-radius: 3px; overflow: hidden; }
  .toggle-btn {
    font-family: 'IBM Plex Mono', monospace; font-size: 11px;
    background: transparent; border: none; color: var(--text-muted);
    padding: 6px 12px; cursor: pointer; transition: background 0.15s, color 0.15s;
  }
  .toggle-btn.active { background: var(--border-bright); color: var(--text); }
  .toggle-btn:hover:not(.active) { color: var(--text); }
  .action-btn {
    font-family: 'IBM Plex Mono', monospace; font-size: 11px;
    background: transparent; border: 1px solid var(--border-bright);
    color: var(--text-muted); border-radius: 3px; padding: 6px 14px;
    cursor: pointer; transition: border-color 0.15s, color 0.15s;
  }
  .action-btn:hover { border-color: var(--accent); color: var(--accent); }
  .action-btn.active-dim {
    background: var(--accent-dim); border-color: var(--accent);
    color: var(--accent);
  }

  /* ── Output Area ── */
  .output-area {
    width: 100%; min-height: 480px; max-height: 72vh;
    overflow-y: auto; background: var(--surface);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 28px 32px;
  }
  .output-area::-webkit-scrollbar { width: 6px; }
  .output-area::-webkit-scrollbar-track { background: transparent; }
  .output-area::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 3px; }

  /* ── Plain Text Body ── */
  .plain-body {
    font-family: 'IBM Plex Mono', monospace; font-size: 13px;
    line-height: 1.8; color: var(--text); white-space: pre-wrap;
    word-break: break-word; background: transparent; border: none;
    outline: none; width: 100%; margin: 0; padding: 0;
  }

  /* ── Markdown Body ── */
  .md-body {
    font-family: 'DM Sans', sans-serif; font-size: 15px;
    line-height: 1.75; color: var(--text);
  }
  .md-body > * + * { margin-top: 1em; }

  .md-body h1 { font-size: 1.75em; font-weight: 700; line-height: 1.25; color: var(--text); border-bottom: 1px solid var(--border); padding-bottom: 0.3em; margin-top: 0; }
  .md-body h2 { font-size: 1.4em; font-weight: 600; line-height: 1.3; color: var(--text); border-bottom: 1px solid var(--border); padding-bottom: 0.25em; }
  .md-body h3 { font-size: 1.18em; font-weight: 600; color: var(--text); }
  .md-body h4 { font-size: 1.05em; font-weight: 600; color: var(--text-muted); }
  .md-body h5, .md-body h6 { font-size: 0.95em; font-weight: 600; color: var(--text-muted); }

  .md-body p { margin: 0; }
  .md-body strong { font-weight: 700; color: var(--text); }
  .md-body em { font-style: italic; }

  .md-body code {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.84em;
    background: var(--code-bg); border: 1px solid var(--border);
    border-radius: 3px; padding: 0.15em 0.4em; color: var(--accent);
    word-break: break-all;
  }
  .md-body pre {
    background: var(--code-bg); border: 1px solid var(--border);
    border-radius: 4px; padding: 16px 20px; overflow-x: auto; margin: 0;
  }
  .md-body pre code {
    background: transparent; border: none; padding: 0;
    font-size: 0.85em; color: var(--text); word-break: normal;
  }

  .md-body blockquote {
    border-left: 3px solid var(--blockquote-border);
    padding: 4px 0 4px 16px; margin: 0;
    color: var(--text-muted); font-style: italic;
  }
  .md-body blockquote > * + * { margin-top: 0.5em; }

  .md-body ul, .md-body ol { padding-left: 1.6em; }
  .md-body ul { list-style: disc; }
  .md-body ol { list-style: decimal; }
  .md-body li { margin-top: 0.3em; }
  .md-body li > ul, .md-body li > ol { margin-top: 0.25em; }

  .md-body hr { border: none; border-top: 1px solid var(--border); }

  .md-body table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
  .md-body th { background: var(--border); font-weight: 600; text-align: left; }
  .md-body th, .md-body td { border: 1px solid var(--border-bright); padding: 8px 12px; }
  .md-body tr:nth-child(even) td { background: var(--accent-dim); }

  .md-body a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
  .md-body a:hover { opacity: 0.8; }

  /* ── Idle Hints ── */
  .idle-hints { display: flex; flex-direction: column; gap: 0; margin-top: 16px; }
  .hint { display: flex; align-items: flex-start; gap: 20px; padding: 18px 0; border-bottom: 1px solid var(--border); font-size: 14px; color: var(--text-muted); }
  .hint:first-child { border-top: 1px solid var(--border); }
  .hint-icon { font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600; color: var(--accent); flex-shrink: 0; margin-top: 1px; letter-spacing: 0.05em; }

  /* ── JSON Banner ── */
  .json-banner {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    padding: 10px 14px; margin-bottom: 16px;
    background: var(--accent-dim); border: 1px solid var(--border-bright);
    border-radius: 4px; font-family: 'IBM Plex Mono', monospace;
  }
  .json-banner-label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--accent); flex-shrink: 0;
  }
  .json-banner-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .json-chip {
    font-size: 10px; color: var(--text-muted);
    background: var(--surface); border: 1px solid var(--border-bright);
    border-radius: 10px; padding: 2px 8px; white-space: nowrap;
  }
  .json-banner-hint {
    flex-basis: 100%; font-size: 11px; color: var(--text-muted);
    font-family: 'DM Sans', sans-serif; margin-top: 2px;
  }

  /* ── JSON Body ── */
  .json-body {
    font-family: 'IBM Plex Mono', monospace; font-size: 13px;
    line-height: 1.7; white-space: pre-wrap; word-break: break-word;
    background: transparent; border: none; outline: none;
    width: 100%; margin: 0; padding: 0; color: var(--text);
  }
  .json-key    { color: var(--accent); font-weight: 500; }
  .json-string { color: var(--text); }
  .json-number { color: var(--text-muted); }
  .json-bool   { color: var(--accent); opacity: 0.8; font-style: italic; }
  .json-null   { color: var(--text-dim); font-style: italic; }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    .page { padding: 40px 16px 80px; }
    .result-header { flex-direction: column; align-items: flex-start; }
    .scrape-btn { padding: 16px 16px; min-width: 90px; }
    .meta-title { max-width: 200px; }
    .output-area { padding: 20px 16px; }
  }
`;
