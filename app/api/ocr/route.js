// 名刺画像をGemini Flashに送って構造化JSONを返すAPIルート
// APIキーはサーバー側の環境変数 GEMINI_API_KEY で管理する（無料枠あり）

export async function POST(req) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY が設定されていません。Vercelの環境変数を確認してください。" },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const dataUrl = body.image || "";
  const match = dataUrl.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
  if (!match) {
    return Response.json({ error: "画像データが不正です" }, { status: 400 });
  }
  const mediaType = match[1].toLowerCase();
  const base64 = match[2];

  const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!supported.includes(mediaType)) {
    return Response.json(
      { error: `非対応の画像形式です（${mediaType}）。JPEG/PNGでお試しください。` },
      { status: 400 }
    );
  }

  const prompt =
    "この名刺画像から情報を抽出し、以下のキーを持つJSONオブジェクトのみを返してください。" +
    "前置き・説明・コードブロック記号は一切不要です。読み取れない項目は空文字にしてください。\n" +
    '{"name":"氏名","kana":"ふりがな(なければ空)","company":"会社名","title":"役職",' +
    '"phone":"固定電話","mobile":"携帯電話","email":"メールアドレス",' +
    '"postal":"郵便番号","address":"住所","website":"WebサイトURL"}';

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mediaType, data: base64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0,
          },
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data?.error?.message || `Gemini APIエラー (${res.status})` },
        { status: 502 }
      );
    }

    const text = ((data.candidates || [])[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return Response.json({ error: "読み取り結果の解析に失敗しました" }, { status: 502 });
    }

    const parsed = JSON.parse(clean.slice(start, end + 1));
    return Response.json({ card: parsed });
  } catch (e) {
    return Response.json({ error: "OCR処理に失敗しました: " + e.message }, { status: 500 });
  }
}
