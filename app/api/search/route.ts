import { NextRequest, NextResponse } from "next/server";
import { searchWeb } from "@/lib/open-source-web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const results = await searchWeb(query, 10);

    const hasSearchProvider = Boolean(
      process.env.SEARXNG_URL || process.env.SEARXNG_INSTANCE_URL,
    );

    return NextResponse.json({
      results,
      searchProvider: hasSearchProvider ? "searxng" : "none",
      message: hasSearchProvider
        ? undefined
        : "Set SEARXNG_URL to enable open-source web search.",
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to perform search",
      },
      { status: 500 },
    );
  }
}
