# 名刺帳（meishi-app）

名刺を撮影するだけで、氏名・電話番号・住所などを自動読み取りして登録・検索できる個人用アプリ。

- OCR: Google Gemini Flash — 無料枠あり（月100万トークン）
- フロント/バック: Next.js（App Router）
- データ保存: ブラウザの localStorage（テキスト）+ IndexedDB（名刺画像）
- サーバーDB不要。Vercelに無料でデプロイ可能

## 必要なもの

- Node.js 18以上
- Gemini APIキー（https://aistudio.google.com/apikey で無料取得）

## ローカルで動かす

```bash
npm install
cp .env.local.example .env.local
# .env.local を開いて GEMINI_API_KEY に自分のキーを設定
npm run dev
```

http://localhost:3000 を開く。

## GitHubに上げる

```bash
git init
git add -A
git commit -m "initial commit"
# GitHubで空のリポジトリ（例: meishi-app）を作成してから:
git remote add origin https://github.com/<あなたのユーザー名>/meishi-app.git
git push -u origin main
```

※ `.env.local`（APIキー）は `.gitignore` 済みなのでコミットされません。

## Vercelにデプロイ（スマホから使えるようになる）

1. https://vercel.com にGitHubアカウントでログイン
2. 「Add New → Project」で `meishi-app` リポジトリをインポート
3. Environment Variables に `GEMINI_API_KEY` を追加
4. Deploy

発行されたURL（`https://meishi-app-xxx.vercel.app`）をiPhoneのホーム画面に追加すれば、アプリのように使えます。

## 注意

- データは**使っているブラウザ内**に保存されます。端末・ブラウザをまたいだ同期はされません（個人用MVPの割り切り）。
- 公開URLを他人に知られるとAPIキー経由のOCRを使われてしまうため、気になる場合はVercelの「Deployment Protection」でパスワードをかけてください。

## 構成

```
app/
  layout.js        # 共通レイアウト・フォント読み込み
  page.js          # アプリ本体（一覧・撮影・確認・詳細）
  api/ocr/route.js # Claude APIを呼ぶOCRエンドポイント
```
