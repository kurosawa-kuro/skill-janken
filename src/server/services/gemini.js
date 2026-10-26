// Transport/error handling adapted from ai-photo-diary/draft/gemini-client.js.
function generateImage_(assetId) {
  const names = {
    A_C01: "ひのこをテーマにした丸いキャラクター",
    A_C02: "しずくをテーマにした丸いキャラクター",
    A_C03: "このはをテーマにした丸いキャラクター",
    A_S01: "勝ちのひらめきのアイコン",
    A_S02: "負けても一歩進むアイコン",
    A_S03: "あいこの輪のアイコン",
    A_S04: "探究の光のアイコン",
  };
  if (!Object.prototype.hasOwnProperty.call(names, assetId))
    throw new AppError_("INVALID_ARGUMENT");
  const { apiKey, model } = geminiSettings_();
  if (!/^gemini-[a-z0-9.-]+$/.test(model))
    throw new AppError_("INVALID_ARGUMENT");
  const folder = imageFolder_();
  const prompt = `小学生向け教育ゲームのオリジナルイラスト。${names[assetId]}。正方形、中央に大きく、太い輪郭、明るい配色、単色背景。同じカードシリーズに合う絵柄。文字・数字・ロゴ・既存作品の人物・実在人物は描かない。怖い表現を避ける。`;
  let body;
  try {
    const response = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "post",
        contentType: "application/json",
        headers: { "x-goog-api-key": apiKey },
        payload: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
        muteHttpExceptions: true,
        followRedirects: false,
      },
    );
    if (response.getResponseCode() !== 200) {
      console.log(
        `Gemini image request failed: HTTP ${response.getResponseCode()}`,
      );
      throw new Error("provider");
    }
    body = JSON.parse(response.getContentText());
  } catch (_) {
    throw new AppError_("INTERNAL_ERROR");
  }
  const candidate = Array.isArray(body.candidates) && body.candidates[0];
  if (
    body.promptFeedback?.blockReason ||
    !candidate ||
    candidate.finishReason !== "STOP"
  )
    throw new AppError_("INTERNAL_ERROR");
  const parts = candidate.content && candidate.content.parts;
  const image =
    Array.isArray(parts) &&
    parts.find((part) => !part.thought && part.inlineData)?.inlineData;
  if (
    !image ||
    !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType) ||
    typeof image.data !== "string" ||
    image.data.length > 16 * 1024 * 1024 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      image.data,
    )
  )
    throw new AppError_("INTERNAL_ERROR");
  const bytes = Utilities.base64Decode(image.data);
  if (!bytes.length) throw new AppError_("INTERNAL_ERROR");
  const suffix = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  }[image.mimeType];
  const file = folder.createFile(
    Utilities.newBlob(
      bytes,
      image.mimeType,
      `${assetId}_${Date.now()}.${suffix}`,
    ),
  );
  if (!isPrivateOwned_(file)) throw new AppError_("ASSET_UNAVAILABLE");
  return {
    sourceFileId: file.getId(),
    modelId: model,
    generatedAt: new Date().toISOString(),
    promptVersion: "v1",
  };
}

// Admin-only, read-only diagnostic: no prompt, image generation, key or raw body.
function inspectGemini_() {
  const { apiKey, model } = geminiSettings_();
  const response = UrlFetchApp.fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    {
      headers: { "x-goog-api-key": apiKey },
      muteHttpExceptions: true,
      followRedirects: false,
    },
  );
  const status = response.getResponseCode();
  console.log(`Gemini model lookup: HTTP ${status}`);
  if (status !== 200) throw new AppError_("INTERNAL_ERROR");
  const body = JSON.parse(response.getContentText());
  const names = (body.models || [])
    .map((item) => item.name)
    .filter(
      (name) =>
        typeof name === "string" &&
        /^models\/gemini-[a-z0-9.-]*(image|banana)[a-z0-9.-]*$/.test(name),
    );
  console.log(
    JSON.stringify({
      configuredModel: model,
      available: names.includes(`models/${model}`),
      imageModels: names,
    }),
  );
}
