# 独立幾何エンジン Phase 1

実装は `feat/geometry-engine` にある。公開 API は
`js/geometry/index.js` の `solveGeometryProblem(problem, { math } = {})`。
Chrome・Windows の通常経路とは接続していない。既存の数学エンジン、OCR、
アプリ本体のソースと既存テストは基点 `532793d` と同じ。

## 使用例

```js
import { length, property, solveGeometryProblem } from "./js/geometry/index.js";

const result = solveGeometryProblem({
  type: "geometry",
  version: 1,
  objects: [
    { id: "ABC", type: "right_triangle", vertices: ["A", "B", "C"], rightAngleAt: "C" },
  ],
  givens: [
    { ref: length("A", "B"), value: 13 },
    { ref: length("A", "C"), value: 5 },
  ],
  goals: [length("B", "C"), property("ABC", "area")],
});
// status: "solved", verified: true, goals の value は "12", "30"
```

入力は JSON にできる。参照は線分 `len:A:B`、角 `angle:A:B:C`（中央が頂点）、
図形属性 `shape:ABC:area`、座標 `coord:A:x`、方向 `parallel:A:B:C:D` と
`perpendicular:A:B:C:D`。公開ヘルパーが点の順序を正規化する。
長さ・面積・角度・体積はそれぞれ一貫した単位で与え、角は度で入力する。
有理数は `"1/3"`、根号や円周率は `"sqrt(2)"` や `"3*pi"` のように表せる。
解答は機械可読の厳密値文字列で返る。各目標の `evidence` が
`trace` のステップ番号を指し、`sources` に根拠となった先行ステップが入る。

## 実装・検証した範囲

| 分野 | 対応する入力と推論 | 範囲の制約 |
| --- | --- | --- |
| 三角形 | 内角和、外角、二等辺、正三角形、三平方と逆、30・45度の直角三角形、底辺と高さ、ヘロン、三角不等式 | `isosceles_triangle` は `apex`、`right_triangle` は `rightAngleAt`。高さの参照例は `height:A:B` |
| 角と直線 | 対頂角、等角、補角、余角、角の二等分、平行・垂直の連鎖、横断線の同位角・錯角・同側内角と逆 | 横断線上の角の配置は明示する |
| 四角形 | 長方形・正方形の面積、対角線、平行四辺形の対辺・対角と対角線の二等分、ひし形・凧形の対角線と面積、台形・等脚台形の角と面積 | 周回順の4頂点。台形の底辺は1〜2番と3〜4番。対角線の交点は必要時に `diagonalIntersection` |
| 多角形 | 3〜32角形の内角和、対角線本数、三角形への分割数、周長。正多角形の角・周長・内接円半径を用いた面積 | 頂点列か `sides`。個別内角や外角和の計算には凸性を明示する。正三・四・六角形では辺から内接円半径も計算 |
| 円・扇形 | 半径・直径・円周・面積の相互計算、扇形の中心角・弧長・面積・周長、見込む弧を明示した円周角、内接四角形の対角、弦、接線 | 円弧は `arc` の2端点と `circle`、必要に応じて `centralAngle`。扇形は0度より大きく360度未満 |
| 合同・相似 | SSS、SAS、ASA、直角三角形の斜辺と1辺、AA相似。対応する角・辺・周長・面積、三角形内の平行線、中点連結 | `triangle_matches` では対応する頂点を指定し、`kind: "infer"` で定理を判定。対応順の探索は行わない |
| 座標と移動 | 距離、中点、直線の傾き・切片・標準方程式、2直線の交点、三角形・四角形の座標面積、軸・原点対称、平行移動、原点まわりの90度単位の回転 | 鉛直線は有限の傾きを返さない。直線式は `lineA*x + lineB*y = lineC` |
| 立体 | 直方体・立方体の空間対角線、直角柱・角錐・円柱・円錐・球の体積と表面積、円錐の母線、明示した相似立体の比 | 角錐の側面積は与件。角柱と角錐の `base` は別の平面図形を参照できる |
| 複合 | 異なる図形が同じ線分・角・属性を共有する推論、面積と体積の加算・差分 | 重なりや包含は構造化条件で明示する |

よく使う属性は `area`、`perimeter`、`height`、`radius`、`diameter`、
`circumference`、`arcLength`、`centerAngle`、`diagonal1`、`diagonal2`、
`volume`、`baseArea`、`basePerimeter`、`lateralArea`、`surfaceArea`、`slantHeight`。
`polygon` の集計属性は `interiorSum`、`exteriorSum`、`diagonalCount`、`triangleCount`。
各型に登録されていない図形属性を直接指定すると `invalid`。

### 関係の形式

| `type` | 追加フィールド |
| --- | --- |
| `equal_lengths` | `segments: [[A,B],[C,D]]` |
| `equal_angles`、`vertical_angles`、`supplementary`、`complementary` | `angles` に点3個の配列を2組 |
| `angle_bisector`、`exterior_angle` | `angles` を全角・半角・半角、または外角・隣接内角・非隣接内角2個の順 |
| `parallel`、`perpendicular`、`line_pair` | `lines: [[A,B],[C,D]]`。最後の型では座標から両関係を判定 |
| `parallel_transversal` | `lines`、`angles` 2組、`position: "alternate" / "corresponding" / "same_side"` |
| `triangle_matches` | `first`、`second` に図形 ID、`correspondence` に最初の図形の頂点順に対応する2番目の点名、`kind: "infer" / "similar" / "congruent"` |
| `midsegment`、`parallel_in_triangle` | `triangle`、共通頂点 `vertex`、残りの頂点順に両辺の内部点を `points` に指定。前者は両点が中点であることを宣言 |
| `triangle_angle_bisector`、`perpendicular_bisector` | 前者は `triangle`、頂点 `vertex`、対辺上の `point`。後者は `segment: [A,B]`、`midpoint`、垂直二等分線上の別の `point` |
| `inscribed_angle`、`cyclic_quadrilateral` | `arc` と `point`、または `quadrilateral` の図形 ID |
| `tangent`、`point_on_circle` | 中心を持つ円の `circle` と `point`。接線ではさらに `external` |
| `midpoint` | `point` と `segment: [A,B]` |
| `line_intersection` | 2つの直線の図形 ID を `lines`、交点名を `point` に指定 |
| `transform` | 点名 `from`、`to` と `operation`。`translate` は `offset: [dx,dy]`、`rotate` は `degrees`、`reflect` は `axis: "x" / "y" / "origin" / "y=x"` |
| `similar_solids` | 同種の立体の図形 ID を `first` と `second` に指定 |
| `composite_measure` | `total` と `parts` にすべて同種の面積または体積参照。`operation: "sum"` は `topology: "disjoint"`、`"difference"` は `"contained"` とし、差分の最初の部品が全体 |

例えば相似宣言の `AB=6, DE=9, BC=8` は、辺の比をアダプターへ渡して
`EF=12` を求め、対応辺の積の関係を検算する。複合ケースでは
平行線から直角を移し、AA相似と相似比、三平方を通して面積 `50*√3` を導出した。

## 検証と判定

条件は参照ごとに一つの値を保持し、追加した事実に関連する定理を再評価する。
候補を仮に代入して定理の検証に通った場合に登録する。距離・面積の符号、三角不等式、
座標の退化・交差、相似の対応、直線方向の循環などは追加のチェックを持つ。
三平方とヘロンでは平方した不変式を確認し、直線の交点は両方の元の方程式に代入する。
処理は目標値が出ても条件の伝播が止まるまで続ける。

| 状態 | 意味 |
| --- | --- |
| `solved` | 全目標が定まり、登録された検証を通過した |
| `multiple-solutions` | 1目標の円と座標直線の交点について、両候補を再実行し整合した。値と各候補の根拠を返す |
| `underdetermined` | 与件と対応する規則から値を一意に導出できなかった |
| `inconsistent` | 入力条件または導出結果に矛盾が見つかった |
| `unsupported` | 対応外の型・演算、厳密照合の不足、またはリソース上限 |
| `invalid` | 入力スキーマ・参照の誤り |

アダプターは既存の `ExactRational`、式パーサー、平方根・二次根、
一次・連立一次ソルバーを利用する。二次根ソルバーはアダプターから利用可能。
一般のCASによる候補生成は使わない。根号の項とπの一次項は厳密に保持し、
大小が有理数の上下界で確定できなければ未対応とする。
推論は1探索あたり図形64、既知条件256、関係128、目標32、登録規則2,048、
事実2,048、規則評価16,384を上限とする。分岐検証は円の交点で最大2枝。

任意の配置を作図して実現可能性を証明するエンジンではない。横断線の配置、内接、
包含、頂点の対応などは与件として扱う。一般のSSA・任意の角と辺の関係、
内接円・外接円の一般構成、任意角度の回転、三次元の配置推論や展開図、
複数解を持つ一般の制約系、複雑な代数数は対応範囲外。
共通の底辺・高さからの比は、それぞれの三角形に同じ参照条件を与えて計算できる。
独立検証後の次工程は、未知の対応頂点探索、より広い幾何整合性検査と
任意の図形間の連鎖を評価すること。アプリ統合は別工程。

## 実測

Windows、Core i7-13620H、Node.js 24.11.1。各入力20回のウォームアップ後、
構造化入力の検証・定理登録・推論・解答整形をまとめて計測した。

| 入力 | 実行回数 | 中央値 | p95 | 規則評価 |
| --- | ---: | ---: | ---: | ---: |
| 三平方で直角辺を求める | 200 | 0.86 ms | 2.26 ms | 103 |
| 平行線から相似、三平方、面積まで | 200 | 2.45 ms | 7.62 ms | 299 |
| 40図形・80与件・32目標 | 50 | 13.18 ms | 32.14 ms | 1,760 |

## 再現

独立テスト235件と既存回帰996件が成功し、失敗は0件。
相似式を計算するアダプターを差し替え、誤った答えが定理の検算で拒否されることも確認した。

```powershell
npm.cmd test
npm.cmd run test:geometry
npm.cmd run check
node tests/geometry/measure-performance.mjs
```
