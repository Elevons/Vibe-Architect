/**
 * Minimal Anthropic Messages API client shared by the code agent and the
 * file describer.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
}

/**
 * Send a single user prompt and return the concatenated text blocks.
 * Throws on network or HTTP errors.
 */
export async function RequestAnthropicText(prompt: string, maxTokens: number): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = (await response.json()) as AnthropicResponse;
  const blocks = data.content ?? [];
  return blocks
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");
}
