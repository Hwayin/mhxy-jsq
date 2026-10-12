# 应用图标：玉色账本

设计日期：2026-10-10。使用内置 imagegen 生成，原始输出已复制到工程，保留已有旧图标文件。

玉色账本呼应角色、装备与玉魄记录；铜钱表达成本与投入；蓝紫背景沿用应用主色。使用不含文字的图形，降低桌面小尺寸下的阅读负担。图标采用不透明方形画布，外部形状由桌面裁切。

## 文件与配置

- 原始生成图：`static/app-icons/jade-ledger-v1-source.png`
- 主图：`static/app-icons/jade-ledger-v1-1024.png`
- 商店图：`static/app-icons/jade-ledger-v1-512.png`
- Android：72 / 96 / 144 / 192 px，已在 `manifest.json` 配置。
- 浏览器：`static/app-icons/jade-ledger-v1-64.png`，已在 `index.html` 配置。

执行 `node scripts/build-app-icons.mjs` 可从原图重新生成各尺寸。旧 `icon-*.png` 和 `static/favicon.svg` 保留。图标路径、PNG 格式与四档尺寸通过 `scripts/check-android-release.mjs` 检查。未提交云打包。

## 最终生成提示词

生成方式：内置 `image_gen.imagegen`，不透明背景，单枚全彩图标。

```text
Use case: logo-brand.
Asset type: a production-ready Android app launcher icon for a Chinese fantasy-game multi-account equipment cost ledger app called 梦幻多开账本.
Primary request: design ONE elegant memorable icon combining a traditional jade-green account book and a simple gold coin, communicating equipment collection and keeping track of investment. Modern polished Chinese fantasy aesthetic, friendly professional utility app.
Composition: square 1:1 icon artwork only, straight-on centered, full-bleed opaque blue-indigo background (#5266df evolving gently to deeper violet), absolutely no surrounding mockup, no phone, no labels, no extra border or white margins, no baked-in rounded exterior corners. Keep all essential foreground inside the central 70% for launcher masking. A single bold jade/ivory bound ledger silhouette with slightly rounded corners, small jade clasp and just THREE thick orderly ledger strokes; ONE small warm golden coin overlapping its lower right edge. A subtle crescent-like jade flourish integrated into the binding evokes Chinese fantasy, not an additional separate object. Clear simple silhouette, high contrast, generous visual breathing room. Premium restrained soft dimensional lighting with crisp vector-like edges, not photorealistic, not over-rendered. Readable at 48–72 pixels. Use few broad shapes, avoid small ornaments, detailed pages, realistic textures and tiny lines. Color palette: indigo/violet background, luminous soft ivory and jade foreground, warm restrained gold accent.
Text: NONE. No Chinese characters, no letters, no numerals, no official game logo, no watermark. No sheets of alternative concepts. Return the finished square icon.
```

