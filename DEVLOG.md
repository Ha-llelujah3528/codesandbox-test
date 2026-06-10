# PANEL ASSAULT — 開発記録・仕様ドキュメント

> パネルでポン（Tetris Attack / Puzzle League）系パズルの本格再現プロジェクト。
> **次セッションでのフィードバック継続用に、現状の仕様・設計判断・残課題をまとめたもの。**
> 最終更新: 2026-06-10

---

## 0. 次セッションでの再開方法（最初に読む）

- 本ドキュメント（`DEVLOG.md`）が現状のすべての要約。まずこれを読む。
- 作業ブランチ: **`claude/panel-de-pon-game-design-r17n2y`**（このブランチで開発／プッシュ）。
- 設計の元プラン（より詳細な背景）: Claude側のプランファイルにも記録あり（`iphone-immutable-flame.md`）。
- 動作確認: `npm install && npm start`（Parcel, http://localhost:1234）。
- 実機プレビュー: GitHub Pages（後述）。
- 「続きのフィードバック」は、§9 のフィードバック履歴の続きとして受ける想定。

---

## 1. プロジェクト概要・目的

- **目的**: 「パネルでポン」のゲーム性を**超本格的に**再現した、デザインの凝った **iPhoneネイティブアプリ**（最終形）を作る。自分用も想定。
- **最終ターゲット**: Swift / SpriteKit のネイティブアプリ。
- **現段階**: この実行環境（Web / Parcel）ではSwiftをビルドできないため、**まず「完成イメージを実際に遊んで体感」できる高品質Webプロトタイプ**を作っている。決定論ゲームコアは後でSwiftへほぼ1:1移植できる設計。
- **ビジュアル方針**: ネオン/サイバー × **ガンダム的メカ意匠**。
- **サウンド方針**: アシッドジャズ風グルーヴBGM ＋ メカ系SFX（すべてWebAudio合成、著作権配慮で実音源は不使用）。
- **対象モード（最終）**: エンドレス/スコアアタック・お題パズル・vs CPU・対戦（ローカル/オンライン）。
  - **現状はエンドレスのみ実装**。他は未実装（§10）。

---

## 2. 実行 / デプロイ方法

### ローカル
```bash
npm install
npm start            # parcel index.html（http://localhost:1234）
npx parcel build index.html --public-url ./   # 静的ビルド -> dist/
```

### GitHub Pages（実機で遊ぶ常設リンク）
- URL: **https://ha-llelujah3528.github.io/codesandbox-test/**
- 仕組み: `.github/workflows/deploy-pages.yml` が push 時にParcelビルド→`gh-pages`ブランチへ配信。
- ユーザー側の1回設定: リポジトリ Settings → Pages → Source「Deploy from a branch」→ Branch `gh-pages` / `(root)`。
- 以後はブランチへの push ごとに自動更新。

### CodeSandbox（代替）
- `https://codesandbox.io/p/github/Ha-llelujah3528/codesandbox-test` をSafariで開き、当該ブランチに切替→自動プレビュー。

---

## 3. 操作方法

| 操作 | キーボード | タッチUI |
|---|---|---|
| カーソル移動 | 矢印 / WASD | 十字ボタン |
| スワップ（横2マス入替） | Space / Z / J | SWAP |
| 手動せり上げ（押し続け） | Shift / K | RAISE |
| ポーズ | P | 右上 ⏸ ボタン（再開はタップ or P） |
| リスタート | R | （未配置） |
| ミュート | M | （未配置） |

- 初回タップ/キー入力でAudioContextを起動（オートプレイ規制対応）。
- タッチUIは `@media (pointer: coarse)` で自動表示（iPhone等）。

---

## 4. アーキテクチャ & ファイル構成

**設計原則**: ブラウザ依存ゼロの決定論コアと、描画/入力/音響を分離。Swift移植時はコアをほぼ1:1で書き写せる。

```
index.html              # canvas / タッチUI / ポーズボタン / bootヒント
src/
  index.js              # 唯一ブラウザ時計に触れる: 固定タイムステップRAFループ + ポーズ + restart
  styles.css            # 暗背景・キャンバス・タッチUI(半透明)・ポーズボタン
  core/                 # ★決定論ゲームコア（window/Math.random/Date/performance 不使用）
    constants.js        # 全フレームタイミング・スコア表（唯一のチューニング面）
    rng.js              # Mulberry32 seed付きPRNG（整数演算のみ・Swift移植可）
    types.js            # enum: Color / State / Ev(イベント種別)
    block.js            # Block値データ + 判定ヘルパ（isEmpty/isClearing/clearBlock 等）
    board.js            # グリッド格納・rise・spawn・top-out・色生成（即マッチ回避）
    matcher.js          # 縦横3+の同色ラン検出（IDLEのみ対象）
    commands.js         # 入力コマンド構築子（MOVE/SWAP/RAISE_DOWN/RAISE_UP）
    engine.js           # ★tick(commands)オーケストレータ本体（連鎖フラグ等もここ）
  input/
    inputManager.js     # キーボード/タッチ→抽象コマンド（DASリピート、論理フレーム単位サンプリング）
  render/
    palette.js          # ブロック色ランプ（RX-78トリコロール＋ジオン緑）/ UI色
    renderer.js         # Canvas2D描画一式（盤面・ブロック・スワップ演出・カーソル・HUD・パーティクル・ポーズ等）
  audio/
    audioEngine.js      # WebAudio合成（BGMスケジューラ＋SFX）
.github/workflows/
  deploy-pages.yml      # Pages自動デプロイ
```

> 注: 設計プランでは `chain.js` `clearTimeline.js` `gravity.js` `scoring.js` を分離予定だったが、
> 現プロトでは結合度の高さから **`engine.js` 内に集約**。Swift移植時に分割し直してよい。
> 同様に `modes/` `net/` `scene/` `render/` の細分ファイルはまだ作っておらず、最小構成。

### コア公開IF（移植の境界）
- 入力: `engine.tick(commands[])`（コマンドは `{type, ...}` の素データ）
- 出力: `engine.events[]`（描画/音響が購読。種別は `types.js` の `Ev`）＋ engine の状態フィールド（renderが直接読む）

---

## 5. 実装済みゲーム仕様（メカニクス）

### 盤面 / 座標
- 6列 × 12行（`GRID_W=6`, `GRID_H=12`）。row0が上、row(H-1)が下。
- `board.nextRow`（横6）＝下からせり上がってくる「未有効化」行。
- せり上がりは `riseSub`（`0..RISE_UNIT` の整数固定小数）。`RISE_UNIT` 到達で全行を上シフト＋下に nextRow 投入＋新 nextRow 生成。
- top-out: 上シフト時に row0 が埋まっていればゲームオーバー。

### tick処理順（`engine.tick`）— 決定論のため固定
1. 入力適用（カーソル移動 / スワップ開始 / RAISE保持）
2. スワップ進行（`SWAP_TIME` 経過で2マスの色を交換）
3. 消去タイムライン進行（後述、空セル化）
4. 重力（落下・着地ラグ・**clear起因の不支持ブロックに chaining フラグ付与**）
5. matcher実行 → 新規clear開始 + **連鎖検出** + スコア
6. （garbage進行: 未実装）
7. せり上がり進行（stop timer=0 かつ clear無 かつ スワップ無 のときのみ）
8. 連鎖終了判定 / 危険(danger)判定 / レベルアップ
9. （renderは engine 状態を直接読む）

### 消去タイムライン（フレーム精度）
`IDLE → (match) → FLASHING(点滅) → FACE(顔) → POPPING(読み順に1個ずつstagger) → EMPTY`
- `FLASH_TIME=44`, `FACE_TIME=16`, `POP_TIME=9`（各 `popIndex*POP_TIME` 遅延でpop）。
- clear中は `riseStopTimer` でせり上がり停止（`FLASH+FACE+総数*POP+猶予`）。

### 連鎖（チェインフラグ方式）
1. 消去でセルが空き、その上のブロックが落下開始する瞬間 → `chaining=true` 付与（スワップ起因では付けない＝`chainActive` を文脈に使用）。
2. `chaining` は FALLING→LANDING を通じて保持。
3. 新マッチ構成に `chaining=true` が1つでもあれば連鎖リンク → `chainCounter++`、なければ新規（=1）。
4. フラグ付き落下ブロックが着地→直後のマッチ判定でマッチしなければ `chaining=false`（着地フレームの判定まではフラグを生かす）。
5. clear無 かつ chainingフラグ無 で連鎖終了 → `CHAIN_END` 発火・ボーナス加算・`chainCounter=0`。

### コンボ
- 同時消し4個以上で `COMBO` 発火＋ボーナス。

### スコア（`constants.js`）
- `BLOCK_CLEAR_SCORE=10`/個、`CHAIN_BONUS[]`（段数別）、`COMBO_BONUS[]`（同時消し数別）。

### 重力 / 落下
- 列ごと下から走査。下が空なら FALLING、`fallOffset += FALL_INC`、`FALL_UNIT` で1セル降下。着地で `LAND_TIME` の LANDING を経て IDLE。

---

## 6. ビジュアル仕様（`render/renderer.js`, `palette.js`）

- **配色**: 5色。RX-78トリコロール（白/青/赤/黄）＋ジオン緑。各色にネオングロー＋**色覚配慮の図形グリフ**（円/三角/菱形/四角/十字）。
- **ブロック意匠（メカ装甲パネル調）**: 面取り八角（`chamferRect`）、メタリック縦グラデ、上端スペキュラ、ベベル縁、パネルシーム、ベント(ルーバー)、コーナーリベット、発光センサー、ステンシル風エンブレム。FLASH時は白発光、POP時に縮小フェード、FACE時は顔表示。
- **スワップ演出**: 2マスが交差しながら scaleX で「くるっと」フリップ（`drawSwap`、`SWAP_TIME=11` で可視化）。
- **未有効化の最下段（nextRow）**: グレー装甲＋微かな色味＋ハザード斜線＋ロック枠で「まだ有効でない」と明示。
- **カーソル**: ガンダム的ターゲティングブラケット（四隅＋中央レティクル、明滅）。
- **HUD**: コックピット風。SCORE / SPD LV、ライブ連鎖表示。`▲ CHAIN xN`。
- **演出**: パーティクル（pop/連鎖burst, additive）、画面シェイク（連鎖/コンボ/トップアウト）、大型バナー（`CHAIN xN` 等）、危険時の赤パルス＋`! WARNING !`、ゲームオーバー `SYSTEM DOWN`。
- **ポーズ**: `PAUSED` オーバーレイ（タップ/Pで再開）。
- **レイアウト**: `resize()` で上部HUD/下部タッチUIのぶんを確保し盤面を必ず上に配置（コントローラーで隠れない）。`dpr`は最大2。

---

## 7. サウンド仕様（`audio/audioEngine.js`）

すべてWebAudio合成。`engine.events` を `consumeEvents` で受けてSFX発火。

### バス構成
`各音 → musicGain / sfxGain → warm(LPF) → master → compressor → 出力`
- リバーブ送り（生成インパルスのConvolver, return 0.28）
- フィードバックディレイ送り（feedback 0.32, return 0.2）
- マスターコンプ（glue）

### BGM（アシッドジャズ風グルーヴ, bpm 92 / 危険時104）
- 進行: ii–V–I–vi（Dm9 → G13 → Cmaj9 → Am9, 9th/13th）。4小節ループ・16分・スウィング。
- レイヤー: 持続パッド（デチューンsaw, リバーブ）/ ウォーキングベース（triangle）/ Rhodes風FMコンピング（リバーブ送り）/ 上声アルペジオ（ディレイ送り）/ クローズドハット / バックビートスネア / キック。
- 危険時に warm の cutoff を上げ、bpmも上昇。

### SFX マップ（種別→音）
- `CURSOR_MOVE`→電子ビープ / `SWAP`→メカ作動 / `MATCH`→ビーム（消し数でピッチ）/ `CHAIN_LINK`→上昇チャージ（段数でピッチ）/ `COMBO`→ロックオン連打 / `RAISE`→装甲スライド / `LEVEL_UP`→上昇音 / `DANGER`→アラート（＋フィルタ/テンポ変化）/ `TOP_OUT`→システムダウン。
- ポーズ時は `setPaused` で AudioContext を suspend/resume。

---

## 8. 主要チューニング定数（`src/core/constants.js`）

| 定数 | 現在値 | 意味 |
|---|---|---|
| `GRID_W / GRID_H` | 6 / 12 | 盤面サイズ |
| `NUM_COLORS` | 5 | 色数 |
| `SWAP_TIME` | 11 | スワップ（フリップ）フレーム |
| `FLASH_TIME / FACE_TIME / POP_TIME` | 44 / 16 / 9 | 消去タイムライン |
| `CLEAR_STOP_GRACE` | 12 | 消去後のせり上がり停止猶予 |
| `FALL_UNIT / FALL_INC` | 16 / 2 | 落下（小さいほど遅い。8フレーム/セル） |
| `LAND_TIME` | 3 | 着地ラグ |
| `RISE_UNIT / RISE_BASE / RISE_PER_LEVEL` | 3000 / 4 / 2 | せり上がり速度 |
| `MANUAL_RISE_INC` | 90 | RAISE中の加算 |
| `SPEED_LEVEL_FRAMES` | 1500(25秒) | レベルアップ間隔 |
| `CHAIN_BONUS[] / COMBO_BONUS[] / BLOCK_CLEAR_SCORE` | — | スコア表 |

---

## 9. フィードバック履歴

### 初期版（第1回プレイ前）
- ネオン×ガンダム配色、装甲フレーム、コックピットHUD、色覚配慮グリフ、パーティクル/シェイク、アシッドジャズBGM＋メカSFX を実装。

### 第1回フィードバック（iPhone実機）と対応 ✅
1. コントローラーが盤面下部を隠す → **盤面をコントローラーの上に収まるよう配置＋UI半透明化**。
2. スワップの動作ビジュアルが欲しい（くるっと） → **交差フリップ演出追加**（`SWAP_TIME`を可視化値に）。
3. 落下が速い → **`FALL_INC` 4→2 に減速**。
4. 最下段の未有効化を分かるように → **グレー＋ハザード＋ロック枠表示**。
5. BGMをもっとリッチに → **リバーブ/ディレイ/パッド/ウォーキングベース/アルペジオ/バックビート/コンプ/9th・13th**。
6. ポーズボタン設置 → **右上⏸＋Pキー＋オーバーレイ＋AudioContext停止**。
7. ブロックをもっとメカっぽく → **装甲パネル調に刷新**（面取り/メタリック/シーム/ベント/センサー/リベット/エンブレム）。

### 第2回フィードバック（iPhone実機）と対応 ✅
1. スワップ時のパネルがペラペラ → **スワップ演出を「持ち上げ」式に刷新**。平面的なscaleXフリップをやめ、2枚が油圧アーチで盤面から浮き上がり（cast shadow＋scale pop）ながら入れ替わる立体表現に（`renderer.drawSwap`）。
2. メカ意匠をもっとリアルに → **全ブロックに押し出し（厚み）を追加**。本体の下に暗いsideプレート＋接地シャドウを描き、平面ステッカー感を解消（`renderer.drawBlock` の extruded side）。
3. 一番上の判定がおかしい → **「上の線に触れた瞬間」即ゲームオーバーに修正**。row0到達を毎tick判定（`engine.checkTopOut`）。せり上げ/落下どちらでもrow0占有＝即TOP_OUT。盤面最上部に**デッドラインを可視化**（危険時は赤く点滅）。
4. 焦るBGM時にパネルも焦り顔＋上下揺れ → **danger中、全ブロックが焦り顔（>_<＋汗＋への字口）になり個別に上下バウンド**（`drawPanicFace`＋`drawBoardCells`のbob）。danger閾値を `DANGER_TOP_ROW=2` に拡大して焦りゾーンを確保。
5. 効果音をもっとリアルにリッチに → **SFX専用の短いプレートリバーブ送りを追加**し、各SFXを多層化（swap=ノイズ過渡＋デチューン金属体、beam=デチューンsaw＋エア＋金属リング尾、chain=2層上昇＋倍音、down=長い崩壊＋低域ブーム 等）。**pop音（破壊）を1個ずつ段階発音**で追加（`Ev.POP`）。
6. コントローラー配置を自由に変えられる設定画面 → **設定画面（⚙）を新設**。(a)全アクションのキー再割り当て、(b)画面コントローラーの**利き手切替/サイズ(小中大)/ドラッグで自由配置**。`localStorage`に永続化（`input/controlConfig.js`＋`ui/settings.js`）。
7. RAISEの文字がボタンからはみ出す → **アクションボタンを内容幅＋`min-width:100px`/`white-space:nowrap`に修正**しSWAP/RAISE両方が綺麗に収まるように（`styles.css`）。

> 注: 作業ブランチはユーザー指示により本ブランチ（`claude/panel-de-pon-game-design-r17n2y`）。別途 `claude/panel-game-improvements-yl25ek` に誤って新規スクラッチ実装をpushしてしまった経緯あり（本ゲームとは無関係なので破棄可）。

### 第3回フィードバック（iPhone実機）と対応 ✅
1. BGMがしょぼい（→ もっと豪華に） → **8小節構成へ拡張＋作り込み**。歌える**リードメロディ追加**（vibrato＋shimmer、delay/reverb送り）、**ウォーキングベース＋サブオク**、コンピングのvelocity変化、**ライド＋ゴーストスネア**のドラム、musicGain増。路線は「今のジャズをさらに豪華に」を採用。
2. モード追加（対戦・タイムアタック） → **シーン制を導入**し3モード実装：
   - **ENDLESS**（従来）。
   - **TIME ATTACK**：目標スコア(3000)までの最速タイムを競うスプリント（DOMで TARGET/TIME 表示、リザルトにタイム）。
   - **VS CPU（本格版・おじゃま有り）**：エンジン2基＋ヒューリスティックAI、画面左右に2盤面描画、**連鎖/同時消しで相手におじゃまブロックを送り合う**。先にトップアウトした方が負け。
3. スタート画面が欲しい（デモ感を消す） → **タイトル画面＋モード選択＋リザルト画面**をDOMオーバーレイで新設。タイトル裏では**CPUが自己対戦するアトラクトデモ**が動く。

#### 実装メモ（本格版おじゃまブロック）
- `src/core/garbage.js`：おじゃまは `board.garbages`（通常セル配列とは別管理）の剛体矩形。上空から落下→着地、隣接マッチで発火(FLASH)→矩形全体を通常パネル化（`chaining=true`で連鎖巻き込み）。`stackTopRow`/`cellOccupied`がgarbageを考慮。送り出しは `Ev.SEND_GARBAGE`（連鎖=全幅×(段-1)、同時消し=幅(個数-1)×1行）。
- `src/ai/cpuPlayer.js`：盤面スナップショットから「即マッチ最大化→なければ同色隣接を増やす整地」スワップを選ぶ。reactionフレームで人間らしい速度。
- `src/session.js`：`SingleSession`(endless/sprint)・`VsSession`(2エンジン＋AI＋garbageルーティング)・`DemoSession`(アトラクト)。`src/ui/menus.js`：タイトル/モード選択/リザルト/モードHUD。
- `Renderer`は`area`指定でサブ矩形描画に対応（VS左右）。`primary`/`showOverlays`/`label`オプション追加。
- 決定論コアはNodeでヘッドレス検証（garbage落下/変換/送り、CPU自己対戦が例外なく完走）。

### 第4回フィードバック（iPhone実機）と対応 ✅
1. おじゃまブロックが天井に触れてもゲームオーバーにならない → **`stackTopRow` のバグ修正**（ブロックがあると早期returnしてgarbageを見ていなかった）。着地済みgarbageもrow0到達で即トップアウト。
2. CPUが固まった列で次手まで待機する／落として整地しない → **CPU AIを刷新**。各候補スワップを「落下後（重力collapse）」までシミュレートして評価。空マスへ寄せて落とす手も評価し、消し＞同色隣接＞最高列の低さ で総合採点、**常に最善手を選ぶ＝待機しない**（gap埋め・整地を能動的に行う）。検証では送り11/変換45で待機最大24f。
3. 焦りモード中の4コンボ/チェインに連鎖応じた上昇停止付与 → **チェイン段数・コンボ数に比例した停止フレーム加算**（`CHAIN_STOP_BONUS`/`COMBO_STOP_BONUS`、危険時は`DANGER_STOP_MULT=2`で倍増）。
4. 下段有効化時にカーソルが一段下がる → **せり上げシフト時に `cursor.y -= 1`** し、カーソルを同じ画面位置（同じパネル）に保持。
5. 縦2個以上の落下で下のパネルが先に落ち4コンボ判定されないバグ → **重力を列単位の「一斉落下」方式に刷新**。連続する落下パネル群が共有オフセットで同時に1段ずつ降り、同時着地→正しく4個消し判定。
6. 十字キーを1ボタンずつ配置調整 → **全ボタン（十字キー各方向＋SWAP/RAISE）を個別ドラッグで自由配置**できるよう配置モデルを刷新（`localStorage`、利き手/サイズと併用）。
7. おじゃま→通常パネルの解除挙動 → **1パネルずつ「アンジップ」変換**（下段から順に）。全部変わってから通常重力で落下。
8. 高難度時に上で連結したおじゃまをまとめて計算 → **トリガが連結（接触）おじゃまへ伝播**。積み重なったおじゃま塊を一括変換しより多く解除。
9. おじゃまパネルに顔 → **怒り顔（への字・つり眉）を各おじゃまセルに描画**＋メカ意匠（リベット/ハザード）。
10. 対戦時 CHAIN/COMBO が相手画面下に隠れる → **バナーを各自の盤面中央に表示**、盤面幅に応じてフォントサイズ調整。
11. CHAIN/COMBO が出たり出なかったり → **`bannerText` が消えず COMBO が恒久抑制されるバグを修正**（寿命切れでクリア＋COMBOは常時表示、CHAINが上書き）。

> コア変更（重力一斉落下／garbage天井判定／段階アンジップ＋連結伝播）は Node ヘッドレステストで検証（7/7 PASS）。CPU自己対戦も113秒完走・待機解消を確認。

### 第5回フィードバック（次セッション）
- ここに追記していく。

---

## 10. 未実装 / 次の候補（設計マイルストーン）

- ✅ **おじゃまブロック**（実装済 / 第3回）: 矩形まるごと変換方式。`src/core/garbage.js`。
- ✅ **vs CPU**（実装済 / 第3回）: `VsSession`＋`CpuPlayer`＋garbage送り合い。
- ✅ **シーン/メニュー**（実装済 / 第3回）: タイトル・モード選択・リザルト（`src/ui/menus.js`）。
- ✅ **タイムアタック**（実装済 / 第3回）: 目標スコア最速（sprint）。
- **お題パズル**: 固定盤・手数制限・全消し勝利（単一エンジン再利用）。未実装。
- **対戦/ネットコード**: 入力プロトコル＋ロックステップ（`serialize` のsnapshot活用）。まずローカルホットシート。未実装。
- **おじゃま挙動の原作寄せ**: 現状は「隣接マッチで矩形全体を一括変換」。原作の「下段から1行ずつ剥がれる」段階変換や、連鎖中の連続変換は今後の調整候補。
- **CPUの強さ調整 / おじゃま対応**: 現AIはおじゃま隣接消しを狙わない。難易度選択（reaction可変）やおじゃま処理ロジックは今後。
- **アクティブ連鎖/スキルチェイン**: 入力受付フレーム・各位相の猶予を原作同等に詰める（土台はあり）。
- **Swift/SpriteKit移植**: `core/`（garbage含む）を struct＋自由関数へ転写、`render/`→SKScene、`input/`→UIResponder、`audio/`→AVAudioEngine。

### デザイン面の検討候補（フィードバック由来）
- メカ意匠を**機体タイプ別テーマ**（連邦/ジオン等）で配色切替。
- スワップのフリップ量/速度の微調整、落下のさらなる調整。
- BGMの方向性（もっと攻め/もっと静か）。

---

## 11. 既知の制限・留意点

- 描画は60Hz論理ステップを**そのまま描画**（prev/curr補間は未実装）。60Hz表示なら十分滑らか。高/低リフレッシュ環境での補間は将来課題。
- `engine.js` にロジックが集約（分離は移植時に実施）。
- パーティクル/シェイクの更新は描画フレーム依存（装飾用途のため決定論外で問題なし）。
- スワップ可否は両マスが IDLE/EMPTY のときのみ（clear/falling中は不可）。
- 連鎖判定はプロト用の文脈フラグ方式。原作の完全フレーム一致は今後の詰め対象。
- 旧スターターの依存（parcel-bundler 1.x 等）をそのまま使用。Node 20/22 でビルド確認済み。

---

## 12. コミット規約

- 開発ブランチ: `claude/panel-de-pon-game-design-r17n2y`（必ずここへ）。
- push: `git push -u origin <branch>`（ネットワーク失敗時のみ指数バックオフで最大4回）。
- PRはユーザー明示時のみ作成。
