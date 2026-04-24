import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "[extract] — URL Scraper",
  description:
    "Fetch any URL and get clean Markdown or plain text with no HTML noise.",
};

// Applied synchronously before first paint to avoid theme flash.
const themeInitScript = `(function(){
  var T={
    terminal:{"--bg":"#0a0a0c","--surface":"#111115","--border":"#1e1e26","--border-bright":"#2e2e3e","--accent":"#7fff6a","--accent-dim":"rgba(127,255,106,0.14)","--accent-fg":"#0a0a0c","--text":"#e8e8f0","--text-muted":"#6a6a80","--text-dim":"#3a3a50","--error":"#ff5f5f","--error-bg":"rgba(255,95,95,0.06)","--code-bg":"#18181e","--blockquote-border":"#7fff6a","--noise-opacity":"0.4"},
    midnight:{"--bg":"#070b18","--surface":"#0c1228","--border":"#172040","--border-bright":"#263a66","--accent":"#60a5fa","--accent-dim":"rgba(96,165,250,0.14)","--accent-fg":"#070b18","--text":"#dde8fc","--text-muted":"#5a70a8","--text-dim":"#263460","--error":"#f87171","--error-bg":"rgba(248,113,113,0.06)","--code-bg":"#0a1020","--blockquote-border":"#60a5fa","--noise-opacity":"0.35"},
    obsidian:{"--bg":"#0c0b14","--surface":"#13121e","--border":"#1e1c2e","--border-bright":"#2e2c48","--accent":"#c084fc","--accent-dim":"rgba(192,132,252,0.14)","--accent-fg":"#0c0b14","--text":"#eae8f8","--text-muted":"#7460b0","--text-dim":"#302c58","--error":"#f87171","--error-bg":"rgba(248,113,113,0.06)","--code-bg":"#100f1c","--blockquote-border":"#c084fc","--noise-opacity":"0.35"},
    rose:{"--bg":"#130810","--surface":"#1e0f18","--border":"#2e1a28","--border-bright":"#4a2a3c","--accent":"#fb7185","--accent-dim":"rgba(251,113,133,0.14)","--accent-fg":"#130810","--text":"#fce8ee","--text-muted":"#9a6880","--text-dim":"#4a2a3c","--error":"#f87171","--error-bg":"rgba(248,113,113,0.06)","--code-bg":"#1a0e16","--blockquote-border":"#fb7185","--noise-opacity":"0.35"},
    slate:{"--bg":"#0d1117","--surface":"#161b22","--border":"#21262d","--border-bright":"#30363d","--accent":"#94a3b8","--accent-dim":"rgba(148,163,184,0.14)","--accent-fg":"#0d1117","--text":"#e2e8f0","--text-muted":"#6e7681","--text-dim":"#30363d","--error":"#f87171","--error-bg":"rgba(248,113,113,0.06)","--code-bg":"#0d1117","--blockquote-border":"#94a3b8","--noise-opacity":"0.3"},
    ocean:{"--bg":"#071218","--surface":"#0c1e28","--border":"#152e3e","--border-bright":"#1e4a60","--accent":"#22d3ee","--accent-dim":"rgba(34,211,238,0.14)","--accent-fg":"#071218","--text":"#e0f4f8","--text-muted":"#4a8898","--text-dim":"#1e4a60","--error":"#f87171","--error-bg":"rgba(248,113,113,0.06)","--code-bg":"#091620","--blockquote-border":"#22d3ee","--noise-opacity":"0.35"},
    nord:{"--bg":"#2e3440","--surface":"#3b4252","--border":"#434c5e","--border-bright":"#4c566a","--accent":"#88c0d0","--accent-dim":"rgba(136,192,208,0.2)","--accent-fg":"#2e3440","--text":"#eceff4","--text-muted":"#9aa4b8","--text-dim":"#4c566a","--error":"#bf616a","--error-bg":"rgba(191,97,106,0.1)","--code-bg":"#2e3440","--blockquote-border":"#88c0d0","--noise-opacity":"0.2"},
    forest:{"--bg":"#080f0a","--surface":"#0e1a10","--border":"#162418","--border-bright":"#1e3820","--accent":"#4ade80","--accent-dim":"rgba(74,222,128,0.14)","--accent-fg":"#080f0a","--text":"#e2f8e8","--text-muted":"#5a8a60","--text-dim":"#1e3820","--error":"#f87171","--error-bg":"rgba(248,113,113,0.06)","--code-bg":"#0a1408","--blockquote-border":"#4ade80","--noise-opacity":"0.4"},
    paper:{"--bg":"#f9f9f6","--surface":"#f0f0eb","--border":"#deded6","--border-bright":"#c0c0b8","--accent":"#16a34a","--accent-dim":"rgba(22,163,74,0.1)","--accent-fg":"#ffffff","--text":"#1a1a16","--text-muted":"#585850","--text-dim":"#aeaea6","--error":"#dc2626","--error-bg":"rgba(220,38,38,0.06)","--code-bg":"#e8e8e2","--blockquote-border":"#16a34a","--noise-opacity":"0.18"},
    warm:{"--bg":"#faf6ed","--surface":"#f2ead8","--border":"#e4d8bc","--border-bright":"#ccc0a0","--accent":"#d97706","--accent-dim":"rgba(217,119,6,0.1)","--accent-fg":"#ffffff","--text":"#1e1608","--text-muted":"#6b5830","--text-dim":"#c0aa80","--error":"#dc2626","--error-bg":"rgba(220,38,38,0.06)","--code-bg":"#ede4cc","--blockquote-border":"#d97706","--noise-opacity":"0.18"},
    solarized:{"--bg":"#fdf6e3","--surface":"#eee8d5","--border":"#ddd8c8","--border-bright":"#b8b4a0","--accent":"#268bd2","--accent-dim":"rgba(38,139,210,0.1)","--accent-fg":"#ffffff","--text":"#657b83","--text-muted":"#93a1a1","--text-dim":"#c0bba0","--error":"#dc322f","--error-bg":"rgba(220,50,47,0.06)","--code-bg":"#e8e2d0","--blockquote-border":"#268bd2","--noise-opacity":"0.18"}
  };
  var dark=["terminal","midnight","obsidian","rose","slate","ocean","nord","forest"];
  var id="terminal";
  try{var s=localStorage.getItem("scraper_theme");if(s&&T[s])id=s;}catch(e){}
  var vars=T[id];
  var root=document.documentElement;
  for(var k in vars)root.style.setProperty(k,vars[k]);
  root.style.colorScheme=dark.indexOf(id)!==-1?"dark":"light";
  root.setAttribute("data-theme",id);
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script: applies saved theme vars before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body style={{ margin: 0 }}>
        {/* Loading splash — fixed neutral theme, present from SSR, removed after hydration */}
        <div
          id="__splash"
          style={{
            position: "fixed",
            inset: 0,
            background: "#0e0e12",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            transition: "opacity 0.25s ease",
            fontFamily: '"IBM Plex Mono", "Courier New", monospace',
          }}
        >
          <div
            style={{
              fontSize: "1.4rem",
              letterSpacing: "0.08em",
              color: "#55556a",
            }}
          >
            <span>[</span>
            <span style={{ color: "#a0a0c0" }}>extract</span>
            <span>]</span>
          </div>
          <div
            style={{
              marginTop: "1.25rem",
              display: "flex",
              gap: "0.3rem",
              alignItems: "center",
            }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#a0a0c0",
                  opacity: 0.9,
                  display: "inline-block",
                  animation: `splash-pulse 1s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
          <style>{`
            @keyframes splash-pulse {
              0%, 100% { opacity: 0.2; transform: scale(0.8); }
              50%       { opacity: 1;   transform: scale(1.2); }
            }
          `}</style>
        </div>
        {children}
      </body>
    </html>
  );
}
