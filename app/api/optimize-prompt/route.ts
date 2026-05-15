import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { getProviderForModel } from "@/lib/ai/provider-manager";
import { appConfig } from "@/config/app.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OptimizeBody = {
  prompt?: string;
  siteUrl?: string;
  image?: string;
  imageName?: string;
  model?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OptimizeBody;
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 },
      );
    }

    const fallback = buildOptimizedPrompt({
      prompt,
      siteUrl: body.siteUrl,
      imageName: body.imageName,
    });

    try {
      const modelId = body.model || appConfig.ai.defaultModel;
      const { client, actualModel } = getProviderForModel(modelId);
      const userContent: any = [
        {
          type: "text",
          text: `Turn this rough request into a concise production-ready app generation brief.

Raw request:
${prompt}

Optional site link:
${body.siteUrl || "none"}

Reference image:
${body.image ? body.imageName || "attached image" : "none"}

Return only the improved brief. Include product intent, target users, pages/sections, UX states, visual direction, responsive behavior, and implementation constraints. Do not mention that you optimized it.`,
        },
      ];

      if (body.image) {
        userContent.push({
          type: "image",
          image: body.image,
        });
      }

      const options: any = {
        model: (client as any)(actualModel),
        messages: [
          {
            role: "system",
            content:
              "You are a senior product designer and frontend architect. You transform vague app ideas into precise briefs for a React/Tailwind code generator.",
          },
          {
            role: "user",
            content: userContent,
          } as any,
        ],
      };

      if (!modelId.startsWith("openai/gpt-5")) {
        options.temperature = 0.3;
      }

      const result = await generateText(options);

      const optimizedPrompt = result.text?.trim() || fallback;
      return NextResponse.json({
        success: true,
        optimizedPrompt,
        fallback: false,
      });
    } catch (error) {
      console.warn("[optimize-prompt] AI optimization failed, using fallback:", error);
      return NextResponse.json({
        success: true,
        optimizedPrompt: fallback,
        fallback: true,
      });
    }
  } catch (error) {
    console.error("[optimize-prompt] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to optimize prompt",
      },
      { status: 500 },
    );
  }
}

function buildOptimizedPrompt({
  prompt,
  siteUrl,
  imageName,
}: {
  prompt: string;
  siteUrl?: string;
  imageName?: string;
}) {
  return `Build a complete React web application from this product brief:

USER REQUEST:
${prompt}

${siteUrl ? `REFERENCE SITE:
Use ${siteUrl} as optional context for content, structure, or visual inspiration. Do not blindly clone it unless the user explicitly asks for a clone.` : ""}

${imageName ? `REFERENCE IMAGE:
The user attached ${imageName}. Treat it as a visual reference for layout, mood, spacing, and hierarchy when possible.` : ""}

EXPECTED OUTPUT:
- Create a polished, working React app with Tailwind CSS.
- Include the primary screens, sections, and interaction states implied by the request.
- Use realistic copy and data where the user did not provide exact content.
- Make the first screen immediately useful, not a marketing explainer about the tool.
- Make the app responsive across desktop and mobile.
- Create all imported components and keep the implementation self-contained.`;
}
