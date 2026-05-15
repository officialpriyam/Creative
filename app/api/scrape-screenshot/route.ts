import { NextRequest, NextResponse } from "next/server";
import { captureScreenshot } from "@/lib/open-source-web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    console.log("[scrape-screenshot] Capturing screenshot with Playwright:", url);
    const screenshot = await captureScreenshot(url);

    return NextResponse.json({
      success: true,
      screenshot,
      metadata: {
        scraper: "playwright",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[scrape-screenshot] Screenshot capture error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to capture screenshot",
      },
      { status: 500 },
    );
  }
}
