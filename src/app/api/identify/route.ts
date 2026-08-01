import { NextRequest, NextResponse } from "next/server";

/**
 * Identifies a kitchen product from a photo using OpenAI's cheapest vision
 * model (gpt-4o-mini, roughly $0.001-0.003 per image as of 2025). Requires
 * OPENAI_API_KEY to be set in the deployment environment. If it's not set,
 * this route responds with a clear error so the app can fall back to
 * manual entry instead of breaking.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI photo identification isn't configured. Add OPENAI_API_KEY to enable it." },
      { status: 501 }
    );
  }

  const { imageBase64 } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "This is a photo of a kitchen item (a spice jar, bottle of oil, cut of meat, or pantry item). " +
                  "Reply with strict JSON only, no markdown: " +
                  '{"name": "short product name", "category": one of "seasoning","oil","meat","produce","pantry","other"}. ' +
                  "Keep the name short, e.g. 'Smoked Paprika' or 'Extra Virgin Olive Oil' or 'Boneless Chicken Thighs'.",
              },
              { type: "image_url", image_url: { url: imageBase64 } },
            ],
          },
        ],
        max_tokens: 100,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Vision API error: ${text}` }, { status: 502 });
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to identify item" },
      { status: 500 }
    );
  }
}
