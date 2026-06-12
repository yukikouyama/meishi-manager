"use client";

import { useState, useEffect, useRef } from "react";

const FIELDS = [
  { key: "name", label: "氏名" },
  { key: "kana", label: "ふりがな" },
  { key: "company", label: "会社名" },
  { key: "title", label: "役職" },
  { key: "phone", label: "電話番号" },
  { key: "mobile", label: "携帯番号" },
  { key: "email", label: "メール" },
  { key: "postal", label: "郵便番号" },
  { key: "address", label: "住所" },
  { key: "website", label: "Web" },
];

const emptyCard = () => Object.fromEntries(FIELDS.map((f) => [f.key, ""]));

// ---------- カード本体: localStorage ----------
const LS_KEY = "meishi:cards";
function loadCards() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveCards(cards) {
  localStorage.setItem(LS_KEY, JSON.stringify(cards));
}

// ---------- 名刺画像: IndexedDB ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("meishi", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("images");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveImage(id, dataUrl) {
  try {
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put(dataUrl, id);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) {
    console.error("image save failed", e);
  }
}
async function loadImage(id) {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const tx = db.transaction("images", "readonly");
      const r = tx.objectStore("images").get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  } catch {
    return null;
  }
}
async function deleteImage(id) {
  try {
    const db = await openDb();
    db.transaction("images", "readwrite").objectStore("images").delete(id);
  } catch {}
}

// ---------- 画像圧縮 ----------
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("ファイルを読み込めませんでした"));
    r.readAsDataURL(file);
  });
}

async function decodeToCanvasDataUrl(source, maxSize, quality) {
  let w, h, drawable;
  if (typeof createImageBitmap === "function" && source instanceof Blob) {
    const bmp = await createImageBitmap(source);
    w = bmp.width;
    h = bmp.height;
    drawable = bmp;
  } else {
    const dataUrl = source instanceof Blob ? await readAsDataUrl(source) : source;
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("decode failed"));
      im.src = dataUrl;
    });
    w = img.width;
    h = img.height;
    drawable = img;
  }
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d").drawImage(drawable, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/jpeg", quality);
  if (!out || out.length < 100) throw new Error("canvas export failed");
  return out;
}

const MAX_B64 = 1500 * 1024;

async function compressImage(file) {
  const attempts = [
    [1200, 0.8],
    [1000, 0.7],
    [800, 0.6],
  ];
  let lastErr = null;
  for (const [size, q] of attempts) {
    try {
      const out = await decodeToCanvasDataUrl(file, size, q);
      if (out.length <= MAX_B64) return out;
    } catch (e) {
      lastErr = e;
      break;
    }
  }
  const raw = await readAsDataUrl(file);
  if (raw.length <= MAX_B64) return raw;
  throw new Error(
    "画像の圧縮に失敗しました（" +
      Math.round(raw.length / 1024) +
      "KB / " +
      (lastErr ? lastErr.message : "サイズ超過") +
      "）。小さめの画像でお試しください"
  );
}

// ---------- OCR（自前APIルート経由） ----------
async function ocrCard(dataUrl) {
  const res = await fetch("/api/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "APIエラー " + res.status);
  const card = emptyCard();
  for (const f of FIELDS) card[f.key] = String((data.card || {})[f.key] || "");
  return card;
}

// ---------- styles ----------
const C = {
  bg: "#F7F6F1",
  paper: "#FFFFFF",
  ink: "#211F1A",
  sub: "#85806F",
  line: "#E6E3D8",
  accent: "#5C4332",
  danger: "#A3382D",
};
const serif = "'Shippori Mincho', 'Hiragino Mincho ProN', serif";
const sans = "'Zen Kaku Gothic New', 'Hiragino Kaku Gothic ProN', sans-serif";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid " + C.line,
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 15,
  fontFamily: sans,
  color: C.ink,
  background: C.paper,
  outline: "none",
};
const btn = (primary) => ({
  border: primary ? "none" : "1px solid " + C.line,
  background: primary ? C.accent : C.paper,
  color: primary ? "#FFF" : C.ink,
  borderRadius: 10,
  padding: "12px 20px",
  fontSize: 15,
  fontFamily: sans,
  fontWeight: 500,
  cursor: "pointer",
});

export default function MeishiApp() {
  const [cards, setCards] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("list"); // list | confirm | detail
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(null);
  const [draftImg, setDraftImg] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedImg, setSelectedImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    setCards(loadCards());
    setLoaded(true);
  }, []);

  const persist = (next) => {
    setCards(next);
    saveCards(next);
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const dataUrl = await compressImage(file);
      setDraftImg(dataUrl);
      const card = await ocrCard(dataUrl);
      setDraft(card);
      setView("confirm");
    } catch (err) {
      setError("読み取りに失敗しました。（" + err.message + "）");
    } finally {
      setBusy(false);
    }
  };

  const addManually = () => {
    setDraft(emptyCard());
    setDraftImg(null);
    setError("");
    setView("confirm");
  };

  const saveDraft = async () => {
    if (!draft.name && !draft.company) {
      setError("氏名か会社名のどちらかは入力してください。");
      return;
    }
    setBusy(true);
    const isEdit = !!draft.id;
    const id = draft.id || String(Date.now());
    const record = { ...draft, id, created: draft.created || Date.now() };
    const next = isEdit ? cards.map((c) => (c.id === id ? record : c)) : [record, ...cards];
    persist(next);
    if (draftImg) await saveImage(id, draftImg);
    setBusy(false);
    setDraft(null);
    setDraftImg(null);
    setError("");
    if (isEdit) {
      setSelected(record);
      setSelectedImg(draftImg || selectedImg);
      setView("detail");
    } else {
      setView("list");
    }
  };

  const openDetail = async (card) => {
    setSelected(card);
    setSelectedImg(null);
    setView("detail");
    const img = await loadImage(card.id);
    setSelectedImg(img);
  };

  const editSelected = () => {
    setDraft({ ...selected });
    setDraftImg(selectedImg);
    setView("confirm");
  };

  const removeSelected = async () => {
    if (!window.confirm("この名刺を削除しますか？")) return;
    persist(cards.filter((c) => c.id !== selected.id));
    await deleteImage(selected.id);
    setSelected(null);
    setView("list");
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? cards.filter((c) =>
        ["name", "kana", "company", "phone", "mobile", "email", "address"].some((k) =>
          (c[k] || "").toLowerCase().includes(q)
        )
      )
    : cards;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: sans, color: C.ink }}>
      <style>{`
        input::placeholder { color: ${C.sub}; }
        button:focus-visible, input:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
      `}</style>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 20px 60px" }}>
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <h1
            style={{
              fontFamily: serif,
              fontSize: 26,
              fontWeight: 600,
              margin: 0,
              letterSpacing: "0.06em",
            }}
          >
            名刺帳
          </h1>
          {loaded && <span style={{ fontSize: 13, color: C.sub }}>{cards.length} 枚</span>}
        </header>

        {error && (
          <div
            style={{
              background: "#FBEDEB",
              color: C.danger,
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {view === "list" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              <button
                style={btn(true)}
                onClick={() => fileRef.current.click()}
                disabled={busy}
              >
                {busy ? "読み取り中…" : "名刺を撮影して登録"}
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  style={{ ...btn(false), flex: 1 }}
                  onClick={() => galleryRef.current.click()}
                  disabled={busy}
                >
                  写真から選ぶ
                </button>
                <button style={{ ...btn(false), flex: 1 }} onClick={addManually} disabled={busy}>
                  手入力
                </button>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFile}
              style={{ display: "none" }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              style={{ display: "none" }}
            />

            <input
              style={{ ...inputStyle, marginBottom: 20 }}
              placeholder="名前・会社・電話番号で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            {busy && (
              <div style={{ textAlign: "center", color: C.sub, fontSize: 14, padding: "20px 0" }}>
                名刺を読み取っています…（数秒かかります）
              </div>
            )}

            {loaded && cards.length === 0 && !busy && (
              <div style={{ textAlign: "center", color: C.sub, padding: "60px 0", lineHeight: 1.9 }}>
                <div style={{ fontFamily: serif, fontSize: 18, color: C.ink }}>
                  まだ名刺がありません
                </div>
                <div style={{ fontSize: 14 }}>「名刺を撮影して登録」から始めましょう</div>
              </div>
            )}

            {filtered.length === 0 && cards.length > 0 && (
              <div style={{ textAlign: "center", color: C.sub, fontSize: 14, padding: "40px 0" }}>
                「{query}」に一致する名刺はありません
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openDetail(c)}
                  style={{
                    textAlign: "left",
                    background: C.paper,
                    border: "1px solid " + C.line,
                    borderRadius: 12,
                    padding: "16px 18px",
                    cursor: "pointer",
                    fontFamily: sans,
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
                  >
                    <span style={{ fontFamily: serif, fontSize: 18, fontWeight: 600, color: C.ink }}>
                      {c.name || "（氏名なし）"}
                    </span>
                    {c.title && <span style={{ fontSize: 12, color: C.sub }}>{c.title}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>
                    {[c.company, c.phone || c.mobile].filter(Boolean).join("　")}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {view === "confirm" && draft && (
          <>
            <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
              {draft.id ? "名刺を編集" : "内容を確認して登録"}
            </div>
            <div style={{ fontSize: 13, color: C.sub, marginBottom: 18 }}>
              読み取り結果は修正できます。
            </div>

            {draftImg && (
              <img
                src={draftImg}
                alt="名刺画像"
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid " + C.line,
                  marginBottom: 18,
                }}
              />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
              {FIELDS.map((f) => (
                <label key={f.key} style={{ fontSize: 12, color: C.sub }}>
                  {f.label}
                  <input
                    style={{ ...inputStyle, marginTop: 4 }}
                    value={draft[f.key] || ""}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  />
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...btn(true), flex: 1 }} onClick={saveDraft} disabled={busy}>
                {busy ? "保存中…" : "保存する"}
              </button>
              <button
                style={btn(false)}
                onClick={() => {
                  const wasEdit = !!draft.id;
                  setDraft(null);
                  setDraftImg(null);
                  setError("");
                  setView(wasEdit && selected ? "detail" : "list");
                }}
              >
                キャンセル
              </button>
            </div>
          </>
        )}

        {view === "detail" && selected && (
          <>
            <button
              style={{ ...btn(false), padding: "8px 14px", fontSize: 13, marginBottom: 18 }}
              onClick={() => {
                setSelected(null);
                setView("list");
              }}
            >
              ← 一覧へ戻る
            </button>

            <div
              style={{
                background: C.paper,
                border: "1px solid " + C.line,
                borderRadius: 14,
                padding: "26px 24px",
              }}
            >
              <div style={{ borderBottom: "1px solid " + C.line, paddingBottom: 18, marginBottom: 18 }}>
                {selected.kana && (
                  <div style={{ fontSize: 12, color: C.sub, marginBottom: 2 }}>{selected.kana}</div>
                )}
                <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 600 }}>
                  {selected.name || "（氏名なし）"}
                </div>
                <div style={{ fontSize: 14, color: C.sub, marginTop: 6 }}>
                  {[selected.company, selected.title].filter(Boolean).join("　")}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 15 }}>
                {selected.phone && (
                  <Row label="電話">
                    <a href={"tel:" + selected.phone} style={{ color: C.accent }}>
                      {selected.phone}
                    </a>
                  </Row>
                )}
                {selected.mobile && (
                  <Row label="携帯">
                    <a href={"tel:" + selected.mobile} style={{ color: C.accent }}>
                      {selected.mobile}
                    </a>
                  </Row>
                )}
                {selected.email && (
                  <Row label="メール">
                    <a href={"mailto:" + selected.email} style={{ color: C.accent }}>
                      {selected.email}
                    </a>
                  </Row>
                )}
                {(selected.postal || selected.address) && (
                  <Row label="住所">
                    {[
                      selected.postal && "〒" + selected.postal.replace(/^〒/, ""),
                      selected.address,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </Row>
                )}
                {selected.website && (
                  <Row label="Web">
                    <a
                      href={
                        selected.website.startsWith("http")
                          ? selected.website
                          : "https://" + selected.website
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: C.accent }}
                    >
                      {selected.website}
                    </a>
                  </Row>
                )}
              </div>

              {selectedImg && (
                <img
                  src={selectedImg}
                  alt="名刺画像"
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: "1px solid " + C.line,
                    marginTop: 20,
                  }}
                />
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button style={{ ...btn(false), flex: 1 }} onClick={editSelected}>
                編集
              </button>
              <button
                style={{ ...btn(false), color: C.danger, borderColor: "#E8C9C4" }}
                onClick={removeSelected}
              >
                削除
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      <span style={{ width: 52, flexShrink: 0, fontSize: 12, color: "#85806F", paddingTop: 3 }}>
        {label}
      </span>
      <span style={{ lineHeight: 1.6, wordBreak: "break-all" }}>{children}</span>
    </div>
  );
}
