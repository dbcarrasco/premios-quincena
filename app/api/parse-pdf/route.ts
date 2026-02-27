import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content:
          `Extract all transactions from this bank statement. Return a JSON array only, no explanation. ` +
          `Each item must have: date (YYYY-MM-DD), amount (number, negative for expenses), ` +
          `description (merchant name only, no reference codes). Statement text: ${text}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") {
    return NextResponse.json({ error: "Unexpected response from Claude" }, { status: 500 });
  }

  // Extract JSON array from response (handles optional ```json ... ``` wrapping)
  const match = block.text.match(/\[[\s\S]*\]/);
  if (!match) {
    return NextResponse.json({ error: "No JSON array in Claude response" }, { status: 500 });
  }

  const transactions = JSON.parse(match[0]);
  return NextResponse.json({ transactions });
}
