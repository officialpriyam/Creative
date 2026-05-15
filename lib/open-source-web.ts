import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import type { Page } from "playwright";

type ScrapeOptions = {
  formats?: string[];
  waitFor?: number;
  timeout?: number;
  onlyMainContent?: boolean;
  screenshot?: boolean;
  fullPageScreenshot?: boolean;
  extractBrand?: boolean;
};

type BrandSnapshot = {
  colors: {
    samples: string[];
    background: string;
    textPrimary: string;
    link: string;
  };
  typography: {
    bodyFont: string;
    headingFont: string;
    bodySize: string;
    h1Size: string;
    h2Size: string;
  };
  spacing: {
    baseUnit: number;
    borderRadius: string;
  };
  components: {
    buttonPrimary?: {
      background: string;
      textColor: string;
      borderRadius: string;
      shadow: string;
    };
    buttonSecondary?: {
      background: string;
      textColor: string;
      borderRadius: string;
      shadow: string;
    };
    input?: {
      borderColor: string;
      borderRadius: string;
    };
  };
  images: {
    logo?: string;
    favicon?: string;
  };
};

export type ScrapedPage = {
  success: true;
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  content: string;
  markdown: string;
  html: string;
  screenshot: string | null;
  links: string[];
  metadata: Record<string, unknown>;
  brand?: BrandSnapshot;
};

export type SearchResult = {
  url: string;
  title: string;
  description: string;
  screenshot: string | null;
  markdown: string;
};

const USER_AGENT =
  "CreativeWebScraper/1.0 (+https://github.com/priyx/creative)";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error("URL is required");
  }

  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function sanitizeText(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u00AB\u00BB]/g, '"')
    .replace(/[\u2039\u203A]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/[\u00A0]/g, " ");
}

export async function scrapePage(
  inputUrl: string,
  options: ScrapeOptions = {},
): Promise<ScrapedPage> {
  const url = normalizeUrl(inputUrl);
  const timeout = options.timeout ?? 30000;
  const waitFor = options.waitFor ?? 1500;
  const shouldScreenshot =
    options.screenshot ?? options.formats?.includes("screenshot") ?? false;

  return withPage(url, timeout, async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });

    try {
      await page.waitForLoadState("networkidle", { timeout: Math.min(waitFor, 5000) });
    } catch {
      // Some pages keep long-running connections open. DOM content is enough.
    }

    if (waitFor > 0) {
      await page.waitForTimeout(waitFor);
    }

    const finalUrl = page.url();
    const title = sanitizeText(await page.title());
    const html = await page.content();
    const { markdown, textContent, description, links } = htmlToContent(
      html,
      finalUrl,
      options.onlyMainContent !== false,
    );

    let screenshot: string | null = null;
    if (shouldScreenshot) {
      screenshot = await screenshotPage(page, options.fullPageScreenshot ?? false);
    }

    const brand = options.extractBrand ? await readBrandSnapshot(page) : undefined;

    return {
      success: true,
      url,
      finalUrl,
      title,
      description,
      content: markdown || textContent,
      markdown,
      html,
      screenshot,
      links,
      metadata: {
        title,
        description,
        sourceURL: finalUrl,
        scraper: "playwright-readability",
        timestamp: new Date().toISOString(),
      },
      brand,
    };
  });
}

export async function captureScreenshot(inputUrl: string): Promise<string> {
  const result = await scrapePage(inputUrl, {
    formats: ["screenshot"],
    onlyMainContent: false,
    screenshot: true,
    waitFor: 2500,
  });

  if (!result.screenshot) {
    throw new Error("Screenshot capture failed");
  }

  return result.screenshot;
}

export async function searchWeb(query: string, limit = 10): Promise<SearchResult[]> {
  const searxngUrl = process.env.SEARXNG_URL || process.env.SEARXNG_INSTANCE_URL;

  if (!searxngUrl) {
    return [];
  }

  const endpoint = makeSearxngEndpoint(searxngUrl);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("categories", "general");
  endpoint.searchParams.set("language", "en-US");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`SearXNG search failed with ${response.status}`);
  }

  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results : [];

  return results.slice(0, limit).map((result: any) => ({
    url: String(result.url || ""),
    title: sanitizeText(String(result.title || result.url || "Untitled")),
    description: sanitizeText(String(result.content || result.description || "")),
    screenshot: null,
    markdown: "",
  })).filter((result: SearchResult) => Boolean(result.url));
}

export async function extractBrandGuidelines(inputUrl: string) {
  const scraped = await scrapePage(inputUrl, {
    extractBrand: true,
    onlyMainContent: false,
    waitFor: 2000,
  });

  const brand = scraped.brand;
  if (!brand) {
    throw new Error("Unable to extract brand styles");
  }

  const primary = firstNonNeutral(brand.colors.samples) || brand.colors.link || "#111827";
  const accent =
    firstNonNeutral(brand.colors.samples.filter((color) => color !== primary)) ||
    brand.colors.link ||
    primary;

  return {
    name: scraped.title || new URL(scraped.finalUrl).hostname,
    colorScheme: isDarkColor(brand.colors.background) ? "dark" : "light",
    colors: {
      primary,
      accent,
      background: brand.colors.background || "#ffffff",
      textPrimary: brand.colors.textPrimary || "#111827",
      link: brand.colors.link || primary,
      palette: brand.colors.samples,
    },
    typography: {
      fontFamilies: {
        primary: cleanFontFamily(brand.typography.bodyFont),
        heading: cleanFontFamily(brand.typography.headingFont),
      },
      fontStacks: {
        body: splitFontStack(brand.typography.bodyFont),
        heading: splitFontStack(brand.typography.headingFont),
      },
      fontSizes: {
        h1: brand.typography.h1Size || "36px",
        h2: brand.typography.h2Size || "30px",
        body: brand.typography.bodySize || "16px",
      },
    },
    spacing: brand.spacing,
    components: brand.components,
    personality: {
      tone: "professional",
      energy: "medium",
      targetAudience: "general",
    },
    designSystem: {
      framework: "tailwind",
      componentLibrary: "custom",
    },
    images: brand.images,
    source: "playwright-readability",
  };
}

async function withPage<T>(
  url: string,
  timeout: number,
  callback: (page: Page) => Promise<T>,
): Promise<T> {
  const { chromium } = await import("playwright");
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Playwright could not start Chromium. Run "npx playwright install chromium" and try again. Original error: ${message}`,
    );
  }

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      userAgent: USER_AGENT,
    });
    page.setDefaultTimeout(timeout);
    return await callback(page);
  } finally {
    await browser.close();
  }
}

async function screenshotPage(page: Page, fullPage: boolean): Promise<string> {
  const buffer = await page.screenshot({
    type: "jpeg",
    quality: 82,
    fullPage,
  });

  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

function htmlToContent(html: string, url: string, onlyMainContent: boolean) {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;
  const description = getMeta(document, [
    "description",
    "og:description",
    "twitter:description",
  ]);

  const readable = onlyMainContent
    ? new Readability(document.cloneNode(true) as Document).parse()
    : null;
  const contentHtml = readable?.content || document.body?.innerHTML || html;
  const textContent = sanitizeText(readable?.textContent || document.body?.textContent || "");
  const markdown = sanitizeText(turndown.turndown(contentHtml)).trim();

  const links = Array.from(document.querySelectorAll("a[href]"))
    .map((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href) return null;
      try {
        return new URL(href, url).toString();
      } catch {
        return null;
      }
    })
    .filter((link): link is string => Boolean(link));

  return {
    markdown,
    textContent,
    description: sanitizeText(description || readable?.excerpt || ""),
    links: [...new Set(links)].slice(0, 100),
  };
}

function getMeta(document: Document, names: string[]): string {
  for (const name of names) {
    const value =
      document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ||
      document.querySelector(`meta[property="${name}"]`)?.getAttribute("content");
    if (value) return value;
  }
  return "";
}

async function readBrandSnapshot(page: Page): Promise<BrandSnapshot> {
  return page.evaluate(() => {
    const isUsefulColor = (value: string) =>
      Boolean(value) &&
      value !== "transparent" &&
      value !== "rgba(0, 0, 0, 0)" &&
      /^(rgb|rgba|hsl|hsla|#)/i.test(value);

    const countColor = (map: Record<string, number>, value: string) => {
      if (!isUsefulColor(value)) return;
      map[value] = (map[value] || 0) + 1;
    };

    const colorCounts: Record<string, number> = {};
    const elements = Array.from(
      document.querySelectorAll(
        "body, header, nav, main, section, article, footer, h1, h2, h3, p, a, button, input, [class*='btn'], [class*='button']",
      ),
    ).slice(0, 250);

    for (const element of elements) {
      const styles = getComputedStyle(element as Element);
      countColor(colorCounts, styles.color);
      countColor(colorCounts, styles.backgroundColor);
      countColor(colorCounts, styles.borderColor);
    }

    const colorSamples = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color)
      .slice(0, 10);

    const bodyStyle = getComputedStyle(document.body);
    const h1Style = getComputedStyle(document.querySelector("h1") || document.body);
    const h2Style = getComputedStyle(document.querySelector("h2") || document.body);
    const linkStyle = getComputedStyle(document.querySelector("a") || document.body);
    const button = document.querySelector("button, a[role='button'], [class*='button'], [class*='btn']");
    const buttonStyle = button ? getComputedStyle(button as Element) : null;
    const input = document.querySelector("input, textarea, select");
    const inputStyle = input ? getComputedStyle(input as Element) : null;
    const logo = document.querySelector<HTMLImageElement>("img[alt*='logo' i], img[src*='logo' i]");
    const favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");

    return {
      colors: {
        samples: colorSamples,
        background: bodyStyle.backgroundColor || "#ffffff",
        textPrimary: bodyStyle.color || "#111827",
        link: linkStyle.color || bodyStyle.color || "#111827",
      },
      typography: {
        bodyFont: bodyStyle.fontFamily || "system-ui, sans-serif",
        headingFont: h1Style.fontFamily || bodyStyle.fontFamily || "system-ui, sans-serif",
        bodySize: bodyStyle.fontSize || "16px",
        h1Size: h1Style.fontSize || "36px",
        h2Size: h2Style.fontSize || "30px",
      },
      spacing: {
        baseUnit: 4,
        borderRadius: buttonStyle?.borderRadius || "6px",
      },
      components: {
        buttonPrimary: buttonStyle
          ? {
              background: buttonStyle.backgroundColor,
              textColor: buttonStyle.color,
              borderRadius: buttonStyle.borderRadius,
              shadow: buttonStyle.boxShadow,
            }
          : undefined,
        buttonSecondary: undefined,
        input: inputStyle
          ? {
              borderColor: inputStyle.borderColor,
              borderRadius: inputStyle.borderRadius,
            }
          : undefined,
      },
      images: {
        logo: logo?.src,
        favicon: favicon?.href,
      },
    };
  });
}

function makeSearxngEndpoint(value: string): URL {
  const endpoint = new URL(value);

  if (!endpoint.pathname.endsWith("/search")) {
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/search`;
  }

  return endpoint;
}

function splitFontStack(value: string): string[] {
  return value
    .split(",")
    .map((font) => font.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function cleanFontFamily(value: string): string {
  return splitFontStack(value)[0] || "system-ui";
}

function firstNonNeutral(colors: string[]): string | undefined {
  return colors.find((color) => !isNeutralColor(color));
}

function isNeutralColor(color: string): boolean {
  const rgb = parseRgb(color);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  return Math.max(r, g, b) - Math.min(r, g, b) < 18;
}

function isDarkColor(color: string): boolean {
  const rgb = parseRgb(color);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function parseRgb(color: string): [number, number, number] | null {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
