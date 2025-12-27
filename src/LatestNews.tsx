import React, { useEffect, useMemo, useState } from "react";

type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAtISO: string;
  snippet: string;
};

const CACHE_KEY = "latestNews_cache_v3";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_FROM = "2021-01-01";

const POWER_TERMS = [
  "power",
  "electricity",
  "grid",
  "demand",
  "supply",
  "peak",
  "renewable",
  "solar",
  "wind",
  "coal",
  "plf",
  "transmission",
  "discom",
  "energy",
];

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDDMMYYYY(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

function clamp(text = "", n = 180) {
  return text.length <= n ? text : text.slice(0, n) + "…";
}

function isRelevant(item: NewsItem) {
  const hay = `${item.title} ${item.snippet} ${item.source}`.toLowerCase();
  return (
    (hay.includes("india") || hay.includes("indian")) &&
    POWER_TERMS.some((t) => hay.includes(t))
  );
}

function loadCache(): NewsItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
    return obj.items;
  } catch {
    return null;
  }
}

function saveCache(items: NewsItem[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
}

async function fetchGoogleNewsRSS(): Promise<NewsItem[]> {
  const rss =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(
      "(India power sector OR India electricity OR India power demand OR India grid OR India renewable energy)"
    ) +
    "&hl=en-IN&gl=IN&ceid=IN:en";

  // ✅ AllOrigins proxy (browser-safe)
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(rss)}`;

  const res = await fetch(proxy);
  if (!res.ok) throw new Error("RSS fetch failed");

  const xmlText = await res.text();
  const xml = new DOMParser().parseFromString(xmlText, "text/xml");
  const items = Array.from(xml.querySelectorAll("item"));

  return items
    .map((item, i) => {
      const title = item.querySelector("title")?.textContent || "";
      const link = item.querySelector("link")?.textContent || "";
      const pubDate = item.querySelector("pubDate")?.textContent || "";
      const source = item.querySelector("source")?.textContent || "Google News";
      const desc = item
        .querySelector("description")
        ?.textContent?.replace(/<[^>]+>/g, "") || "";

      const publishedAtISO = pubDate
        ? new Date(pubDate).toISOString()
        : "";

      if (!title || !link || !publishedAtISO) return null;

      return {
        id: `${publishedAtISO}_${i}`,
        title,
        url: link,
        source,
        publishedAtISO,
        snippet: clamp(desc),
      } as NewsItem;
    })
    .filter(Boolean) as NewsItem[];
}

export default function LatestNews() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(todayISODate());

  const filtered = useMemo(() => {
    const fromT = new Date(from + "T00:00:00Z").getTime();
    const toT = new Date(to + "T23:59:59Z").getTime();

    return items
      .filter((n) => {
        const t = new Date(n.publishedAtISO).getTime();
        return t >= fromT && t <= toT;
      })
      .sort((a, b) => (a.publishedAtISO < b.publishedAtISO ? 1 : -1));
  }, [items, from, to]);

  async function load(force = false) {
    setLoading(true);
    setError(null);

    try {
      if (!force) {
        const cached = loadCache();
        if (cached) {
          setItems(cached);
          setLoading(false);
          return;
        }
      }

      const raw = await fetchGoogleNewsRSS();
      const relevant = raw.filter(isRelevant).slice(0, 100);
      setItems(relevant);
      saveCache(relevant);
    } catch {
      setError("Unable to load news – please try again later");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Latest News</h1>
          <p className="text-sm text-slate-600">
            Real-time news focused on the Indian power sector.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-4 shadow ring-1 ring-slate-200">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium">Start date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium">End date</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            />
          </div>
          <div className="flex items-end text-sm text-slate-600">
            Showing {filtered.length} articles
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-rose-50 p-4 text-rose-800">
          {error}
          <button
            onClick={() => load(true)}
            className="ml-4 rounded bg-slate-900 px-3 py-1 text-white"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtered.map((n) => (
          <div
            key={n.id}
            className="rounded-2xl bg-white p-4 shadow ring-1 ring-slate-200"
          >
            <a
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold hover:underline"
            >
              {n.title}
            </a>
            <div className="mt-1 text-xs text-slate-600">
              {n.source} • {formatDDMMYYYY(n.publishedAtISO)}
            </div>
            <p className="mt-2 text-sm text-slate-700">{n.snippet}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 text-xs text-slate-500">
        Cached for up to 1 hour. Refresh to fetch latest.
      </div>
    </div>
  );
}
