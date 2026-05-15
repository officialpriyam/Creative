import { NextRequest, NextResponse } from "next/server";
import { scrapePage } from "@/lib/open-source-web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { url, formats = ["markdown", "html"], options = {} } =
      await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const scraped = await scrapePage(url, {
      formats,
      onlyMainContent: options.onlyMainContent !== false,
      waitFor: options.waitFor || 2000,
      timeout: options.timeout || 30000,
      screenshot: formats.includes("screenshot"),
      fullPageScreenshot: options.fullPageScreenshot,
    });

    return NextResponse.json({
      success: true,
      data: {
        title: scraped.title || "Untitled",
        content: scraped.markdown || scraped.html || "",
        description: scraped.description || "",
        markdown: scraped.markdown || "",
        html: scraped.html || "",
        metadata: scraped.metadata || {},
        screenshot: scraped.screenshot,
        links: scraped.links || [],
        raw: scraped,
      },
    });
  } catch (error) {
    console.error("Error scraping website:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to scrape website",
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
