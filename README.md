# github-lang-widget

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)
![Scriptable](https://img.shields.io/badge/Scriptable-1E90FF?style=flat&logoColor=white)

GitHub リポジトリの言語別バイト数を集計し、iOS Scriptable ウィジェットに表示します。公開プレビューは Public リポジトリの集計です。本人用ウィジェットでは、許可した Private リポジトリを合算できます。

## 構成

- `/api/data` は Public の言語別バイト数、`/api/chart` は Public の PNG を返します。公開結果は30分間キャッシュできます。
- `/api/private-widget` はウィジェット専用キーで保護します。既定の `format=png` は合算の PNG、`format=top` は最上位言語と割合を返します。Private を含む応答には `private, no-store` を設定します。
- `lib/githubData.js` はリポジトリ一覧の全ページを巡回し、言語別バイト数を取得します。PNG は同梱の Inter フォントで描画します。ライセンスは [OFL.txt](lib/fonts/OFL.txt) を参照してください。
- Public モードでは、既存の `loader.js` で配信コードを更新する方式と、レビュー済みの `widget-body.js` を端末に貼る方式を選べます。Private モードは端末に貼る方式を使います。

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

### Vercel の環境変数

| 変数 | 用途 |
|---|---|
| `GITHUB_TOKEN` | 任意。公開 API の GitHub レート制限に余裕を持たせるための Public アクセス用トークン。 |
| `GITHUB_PRIVATE_TOKEN` | Private モード用。対象アカウントで有効期限付きの fine-grained PAT を作成し、対象の Private リポジトリを選びます。Repository permissions は `Metadata: Read-only` のみです。 |
| `WIDGET_ACCESS_KEY` | Private モード用。GitHub PAT とは別に、パスワードマネージャーなどで生成したランダムなキーを使います。端末側にも同じキーを設定します。 |

Private 用の2つの値は Vercel の Secret として保存します。環境変数設定後は再デプロイが必要です。Preview で Private モードを試す場合は、テスト用のリポジトリに限定した PAT と専用キーを対象ブランチだけに設定してください。対象とする個人アカウントは `lib/githubData.js` の `DEFAULT_OWNER` で固定されています。Private リポジトリを追加したときは PAT の対象選択も更新してください。

### `api/chart.js` のクエリパラメータ

- `owner` — 対象アカウントを上書き (デフォルト: `Axe0320`)
- `w`, `h` — 出力画像サイズ (デフォルト: 600x400)
- `legendCount` — バーの下に言語名を何件テキスト表示するか (デフォルト: 6、`0`でバーのみ)
- `theme` — `dark` (デフォルト) または `light`。背景・文字色を切り替える
- `rowBars` — `1` (デフォルト) で各言語行にも my-intro 同様の個別バーを表示、`0` でテキストのみ
- `boost` — バーの太さ・凡例のフォント/ドット/行間をまとめて拡大する倍率 (デフォルト: `1`)。
  名前欄・%欄の幅（横方向）は影響を受けない（キャンバス幅を超えて崩れないようにするため）。
  `legendCount`が多くて縦に収まりきらない場合は、指定値より小さい値へ自動的に縮小される
- `rowBarHeight` — 各言語行のミニバーの太さだけをさらに拡大する倍率 (デフォルト: `1`)

## Scriptable 側のセットアップ

### Public モード

Scriptable に `scriptable/loader.js` を貼り、`SCRIPT_URL` をデプロイ先の `/api/widget-script` に設定します。デプロイした `scriptable/widget-body.js` の `API_ORIGIN` と `OWNER` も必要に応じて更新します。端末でコードを管理する場合は `widget-body.js` を直接貼り、`INCLUDE_PRIVATE = false` のまま使えます。

### Public と Private を合算する

1. 既存の Scriptable スクリプトを、レビュー済みの `scriptable/widget-body.js` 全体で置き換えます。
2. `API_ORIGIN` をデプロイ先の HTTPS オリジンに設定し、`INCLUDE_PRIVATE = true` にします。
3. Scriptable 内でスクリプトを実行し、**Set access key** から Vercel の `WIDGET_ACCESS_KEY` と同じ値を入力します。キーは端末の Keychain に保存されます。
4. ホーム画面とロック画面のウィジェットで、このスクリプトを指定します。ロック画面は既定で Public の集計を表示します。合算後の最上位言語と割合をロック画面に出す場合は `SHOW_PRIVATE_ON_LOCK_SCREEN = true` にします。

白背景にするには、ウィジェットの Parameter に `light`／`white`／`白`／`ホワイト`／`ライト` のいずれかを入力します。既定はダークです。

## 対応ウィジェットサイズ

`widget-body.js` が `config.widgetFamily` を見て自動で出し分けます。

| ファミリー | 表示内容 |
|---|---|
| `small` (iPhone ホーム画面) | 棒グラフ + 上位5言語のテキスト（%は右端固定、行ごとのミニバーは無し） |
| `medium` | 棒グラフ + 上位5言語（太めのミニバー付き） |
| `large` | 棒グラフ + 上位15言語（ミニバー付き） |
| `extraLarge` (iPad ホーム画面) | 棒グラフ + 上位15言語（ミニバー付き） |
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

## 検証

`npm ci` の後に `npm test` を実行します。GitHub の応答は架空データに置き換え、テスト用のキーで認証・ページネーション・PNG 生成・ロック画面のリクエストを検証します。
