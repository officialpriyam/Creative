import { NextRequest, NextResponse } from "next/server";
import { extractBrandGuidelines } from "@/lib/open-source-web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = body.url;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400 },
      );
    }

    console.log("[extract-brand-styles] Extracting brand styles with Playwright:", url);

    const guidelines = await extractBrandGuidelines(url);

    return NextResponse.json({
      success: true,
      url,
      styleName: guidelines.name || url,
      guidelines,
    });
  } catch (error) {
    console.error("[extract-brand-styles] Error occurred:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to extract brand styles",
      },
      { status: 500 },
    );
  }
}
