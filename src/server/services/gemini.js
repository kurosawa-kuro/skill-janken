// Admin-only text generation. No image parts, tools, retries, or fallback models.
function generateTextCandidates_(slotKey, settings) {
  const [characterId, outcome] = slotKey.split("_");
  const characters = {
    C01: "ひのこ。明るく前向き",
    C02: "しずく。落ち着いて思いやりがある",
    C03: "このは。穏やかで好奇心がある",
  };
  if (!dialogueSlots_().includes(slotKey))
    throw new AppError_("INVALID_ARGUMENT");
  const prompt =
    "子どもと遊ぶじゃんけんの仲間のセリフ候補を日本語で三つ作成。仲間: " +
    characters[characterId] +
    "。想定結果: " +
    { WIN: "勝ち", LOSE: "負け", DRAW: "あいこ" }[outcome] +
    "。各一文四十文字以内。短く親しみやすく、相手をあおらず前向きに。数値、得点、ルール説明、個人情報の要求、URL、HTML、改行、攻撃的表現は禁止。異なる三文をJSONのtexts配列だけで返す。";
  const response = UrlFetchApp.fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(settings.model) +
      ":generateContent",
    {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": settings.apiKey },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              texts: {
                type: "ARRAY",
                items: { type: "STRING" },
                minItems: 1,
                maxItems: 3,
              },
            },
            required: ["texts"],
          },
          maxOutputTokens: 512,
        },
      }),
    },
  );
  const code = response.getResponseCode();
  if (code !== 200)
    return { ok: false, stop: [400, 401, 403, 404, 429].includes(code) };
  const raw = response.getContentText();
  if (typeof raw !== "string" || raw.length > 32768)
    return { ok: false, stop: false };
  try {
    const body = JSON.parse(raw),
      candidate = body.candidates?.[0];
    if (
      body.promptFeedback?.blockReason ||
      candidate?.finishReason !== "STOP" ||
      candidate.safetyRatings?.some((r) => r.blocked)
    )
      return { ok: false, stop: false };
    const parts = candidate.content?.parts;
    if (
      !Array.isArray(parts) ||
      parts.some((p) => typeof p.text !== "string" || p.thought)
    )
      return { ok: false, stop: false };
    const result = JSON.parse(parts.map((p) => p.text).join(""));
    requireObjectKeys_(result, ["texts"]);
    validateTexts_(result.texts);
    return { ok: true, texts: result.texts, stop: false };
  } catch (_) {
    return { ok: false, stop: false };
  }
}
