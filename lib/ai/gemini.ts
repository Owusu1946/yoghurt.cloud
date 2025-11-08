const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

const MODEL = "gemini-1.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type TagInput = {
  name: string;
  type: string;
  extension: string;
  contentType?: string;
  size?: number;
  previewText?: string;
  imageBase64?: string;
};

const systemPrompt = ({ name, type, extension, contentType, size }: TagInput) => `You are a tagging assistant for a cloud drive app.
Given a file's name, extension, type category, and content-type, return up to 8 short, relevant tags.
- Output strictly as a JSON array of strings. No commentary.
- Prefer general-purpose, safe tags users would use to search (e.g., "music", "lecture", "invoice", "vacation", "mp4", "spreadsheet").
- Use lowercase, kebab or space separated, max 2 words per tag.
- Avoid duplicates and special characters.

File info:
- name: ${name}
- extension: ${extension}
- type: ${type}
- contentType: ${contentType || "unknown"}
- sizeBytes: ${size || 0}
`;

export async function generateTagsForFile(input: TagInput): Promise<string[]> {
  if (!GEMINI_API_KEY) return [];

  try {
    const parts: any[] = [{ text: systemPrompt(input) }];
    if (input.previewText) {
      parts.push({ text: `Preview content (may be truncated):\n${input.previewText.slice(0, 5000)}` });
    }
    if (input.imageBase64) {
      parts.push({ inline_data: { mime_type: input.contentType || "image/png", data: input.imageBase64 } });
    }

    const body = {
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
      },
    } as const;

    const res = await fetch(`${API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("generateTagsForFile: API error", res.status, await res.text());
      return [];
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let tags: string[] | null = null;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) tags = parsed as string[];
    } catch {}

    if (!tags) {
      tags = String(text)
        .replace(/^[^\[]*\[/, "[")
        .replace(/\][^\]]*$/, "]")
        .replace(/["']/g, "")
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    return Array.from(
      new Set(
        (tags || [])
          .map((t) => t.toLowerCase())
          .map((t) => t.replace(/[^a-z0-9\s\-]/g, ""))
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ).slice(0, 8);
  } catch (err) {
    console.error("generateTagsForFile: unexpected error", err);
    return [];
  }
}
