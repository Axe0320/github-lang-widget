# github-lang-widget

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)
![Scriptable](https://img.shields.io/badge/Scriptable-1E90FF?style=flat&logoColor=white)

`Axe0320` アカウントの **全 public リポジトリを横断集計した** GitHub 言語使用率を PNG 画像として
生成する Vercel Function 群と、それを表示する iOS Scriptable ウィジェット。

[my-intro](https://github.com/Axe0320/my-intro) の `index.js` (`loadGitHubRepos()`) と同じロジック
(`/users/:owner/repos` で全リポジトリを取得 → 各リポジトリの `languages_url` を並列取得して合計) を
サーバーサイドで再現しています。単一リポジトリの言語比率ではありません。

## 構成

- `api/chart.js` — Vercel Edge Function。GitHub API (`/users/:owner/repos` → 各リポジトリの
  `languages_url`) を叩いて全リポジトリ分のバイト数を合計し、言語別の使用率バー + 凡例を描画した
  PNG を返す。
- `api/widget-script.js` — `scriptable/widget-body.js` の中身をそのままテキストとして返す
  Vercel Function。Scriptable 側から毎回フェッチされる「本体コード配信用」エンドポイント。
- `scriptable/loader.js` — **iPhone に一度だけ貼る**小さなブートストラップ。
  `api/widget-script.js` から最新コードを取得して `eval` するだけ。
- `scriptable/widget-body.js` — ウィジェットの実際のロジック（サイズ判定・画像取得・
  ロック画面用フォールバックなど）。ここを直せば iPhone 側は何もしなくても更新される。

## デプロイ手順 (Vercel)

Git 連携なしで Vercel CLI から直接デプロイできます（GitHub リポジトリを別途作るのは任意）。

```bash
npm install -g vercel   # 未インストールの場合
vercel login
vercel                  # このフォルダで実行。初回はプロジェクト作成の質問に答える
vercel --prod           # 本番URLを発行
```

デプロイ後、ブラウザで以下を開いて画像が表示されれば成功です。

```
https://<your-project>.vercel.app/api/chart
https://<your-project>.vercel.app/api/widget-script   ← JSのソースコードがそのまま表示されればOK
```

### 環境変数 (任意だが推奨)

このAPIはリクエスト1回につき「リポジトリ一覧取得 + リポジトリ数ぶんの言語取得」を行うため、
未認証 (60回/時) だとリポジトリ数が多い場合にすぐ枯渇し得ます。
`Cache-Control: s-maxage=1800` で画像自体は30分キャッシュされますが、余裕を持たせるために
Personal Access Token の設定を推奨します。

```bash
vercel env add GITHUB_TOKEN
```

### `api/chart.js` のクエリパラメータ

- `owner` — 対象アカウントを上書き (デフォルト: `Axe0320`)
- `w`, `h` — 出力画像サイズ (デフォルト: 600x400)
- `legendCount` — バーの下に言語名を何件テキスト表示するか (デフォルト: 6、`0`でバーのみ)
- `theme` — `dark` (デフォルト) または `light`。背景・文字色を切り替える

## Scriptable 側のセットアップ (iPhone) — 最初の1回だけ

1. App Store から **Scriptable** をインストール。
2. Scriptable アプリで新規スクリプトを作成し、`scriptable/loader.js` の中身（数行だけ）を貼り付け。
3. `SCRIPT_URL` を、上記でデプロイした Vercel の URL (`https://xxx.vercel.app/api/widget-script`) に書き換える。
4. `scriptable/widget-body.js` 冒頭の `API_BASE` も同様に自分の Vercel URL (`.../api/chart`) に書き換えてから
   Vercel にデプロイしておく（この内容が実行時に自動フェッチされる）。
5. ホーム画面 or ロック画面を長押し → ウィジェット追加 → Scriptable を選択（好きなサイズで）。
6. 追加したウィジェットを長押し → 「ウィジェットを編集」→ Script に `loader.js` を貼ったスクリプトを指定。
   同じ画面の **Parameter** 欄に `light` と入力すると白背景テーマになる（未入力/それ以外は `dark`）。

**これ以降、`widget-body.js` を直して `vercel --prod` するだけで iPhone 側は自動的に最新ロジックで動きます。
Scriptable アプリを再度開いて貼り直す必要はありません。**
（`api/chart.js` 側は `Cache-Control: s-maxage=1800` なので画像自体は30分程度キャッシュされます。
`api/widget-script.js` は `no-store` なので、コードは毎回最新のものが取得されます。）

## 対応ウィジェットサイズ

`widget-body.js` が `config.widgetFamily` を見て自動で出し分けます。

| ファミリー | 表示内容 |
|---|---|
| `small` (iPhone ホーム画面) | 棒グラフ + 上位3言語のテキスト |
| `medium` | 棒グラフ + 上位3言語のテキスト |
| `large` | 棒グラフ + 上位8言語のテキスト |
| `extraLarge` (iPad ホーム画面) | 棒グラフ + 上位10言語のテキスト |
| `accessoryCircular` / `accessoryRectangular` / `accessoryInline` (ロック画面) | 最も使用率の高い言語名 + % のテキスト表示のみ |

ロック画面ウィジェットは iOS の仕様上、常にモノクロ／ティント表示に強制変換されるため、
カラーの棒グラフ画像をそのまま出しても潰れて見えるだけです。そのためロック画面向けだけは
画像ではなくテキストにフォールバックしています。

## GitHub リポジトリとして管理する場合 (任意)

このフォルダをそのまま新規 GitHub リポジトリにしたい場合:

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create <repo-name> --private --source=. --push
```

Vercel 側でその GitHub リポジトリと連携すれば、`git push` するだけで自動デプロイされるようになります
（loader.js だけ手元の Scriptable に残っていれば、以後は push だけでウィジェットの中身を更新できます）。
