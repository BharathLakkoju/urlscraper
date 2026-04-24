import { NextRequest, NextResponse } from "next/server";
import { parse } from "node-html-parser";
import TurndownService from "turndown";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || !url.startsWith("http")) {
      return NextResponse.json({ error: "Invalid URL. Must start with http:// or https://" }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; URLScraper/1.0; +https://scraper.dev)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status} ${response.statusText}` },
        { status: 400 }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { error: `Unsupported content type: ${contentType}. Only HTML pages are supported.` },
        { status: 400 }
      );
    }

    const html = await response.text();
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

    const finalMarkdown = parts.join("\n\n");

    return NextResponse.json({
      markdown: finalMarkdown,
      title,
      wordCount: finalMarkdown.split(/\s+/).filter(Boolean).length,
      charCount: finalMarkdown.length,
      url,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("timeout") || message.includes("abort")) {
      return NextResponse.json({ error: "Request timed out. The page took too long to respond." }, { status: 408 });
    }
    return NextResponse.json({ error: `Scraping failed: ${message}` }, { status: 500 });
  }
}
