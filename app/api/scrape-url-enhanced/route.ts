import { NextRequest, NextResponse } from "next/server";
import { scrapePage, sanitizeText } from "@/lib/open-source-web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400 },
      );
    }

    console.log("[scrape-url-enhanced] Scraping with Playwright:", url);

    const scraped = await scrapePage(url, {
      formats: ["markdown", "html", "screenshot"],
      waitFor: 2500,
      timeout: 30000,
      onlyMainContent: true,
      screenshot: true,
    });

    const formattedContent = `
Title: ${sanitizeText(scraped.title)}
Description: ${sanitizeText(scraped.description)}
URL: ${scraped.finalUrl}

Main Content:
${sanitizeText(scraped.markdown)}
    `.trim();

    return NextResponse.json({
      success: true,
      url: scraped.finalUrl,
      content: formattedContent,
      screenshot: scraped.screenshot,
      structured: {
        title: scraped.title,
        description: scraped.description,
        content: scraped.markdown,
        url: scraped.finalUrl,
        screenshot: scraped.screenshot,
      },
      metadata: {
        ...scraped.metadata,
        scraper: "playwright-readability",
        contentLength: formattedContent.length,
        cached: false,
      },
      message: "URL scraped successfully with Playwright and Readability",
    });
  } catch (error) {
    console.error("[scrape-url-enhanced] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to scrape URL",
      },
      { status: 500 },
    );
  }
}
