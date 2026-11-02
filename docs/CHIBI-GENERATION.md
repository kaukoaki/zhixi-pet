# 新版 Q 版桌宠生图规格

当前采用小芽抱星胸章与白结／双紫晶／流苏发饰的[新版立绘](../assets/character/qiqi-chibi-v5-knot-sprout.png)。后续生成请使用[新版固定人设与动作模板](animation/README.md)。下方2026-10-23记录属于历史制作来源，不再作为当前提示词。

## 历史：GPT 胸标版本

2026-10-23，用户确认当前 Q 版形象后，要求添加 GPT 标志并放大。内置 imagegen 成功生成 `assets/character/qiqi-chibi-v3-gpt.png`，采用透明背景与以下提示词：

+ A single adorable Japanese anime chibi girl desktop mascot, compact 2.2 heads tall, big rounded head, short torso and tiny legs. Refined hand-painted anime illustration with delicate softly shaded hair and fabric and clean dark outlines. Warm gentle smiling face, tiny mouth, soft blush, very large luminous violet eyes with star-like white highlights. Fluffy silver-white long wavy hair with pale mint tips framing her whole body to skirt height, a tiny curled ahoge, a braid down the image-right side of her head tied with a black ribbon with gold trim. Little charcoal cape with gold botanical embroidery over a white ruffled miniature dress, charcoal side panels and fine gold edging, relaxed small arms at her sides, tiny short charcoal boots with gold trim, feet level. CRITICAL CLOTHING DETAIL: a large clear accurate OpenAI ChatGPT logo centered on her upper chest, gold six-loop interlocking knot on a plain ivory chest panel. Use the well-known ChatGPT hexagonal knot of six rounded interwoven ribbon loops and its central hexagonal negative space. It must be instantly recognizable as the ChatGPT logo, not a star, flower, snowflake, sun, generic spiral, medallion, letters or a random ornamental knot. Keep the chest around the emblem clean with no pendants covering it, emblem about one fifth of the head width so it reads when the character is 160px tall. Front-facing natural idle standing pose, full body entirely visible with 7 percent clear margin on every side. Rounded cute silhouette designed for desktop use. Single character only, square canvas and genuine transparent alpha background. No text, floating ornaments, speech bubbles, floor, ground shadow, frames, UI or extra poses. Avoid tall slender body or long legs. Avoid vector, SVG, flat geometric or crude drawing.

---

用户反馈：抠出的原图在小尺寸下比例不合适，改为重新生成角色立绘。

目标：2～2.5 头身，头部约占总高度 45%，短身体和短腿，轮廓圆润；整个人物约 120 像素高时，脸和表情仍清晰。使用第一张图的银白渐青头发、紫眼睛、黑白金服装；第二张图只参考比例和桌宠体量，不复制其蓝发女仆设计。透明背景，正面自然站姿，完整保留头发和鞋。

## 生图提示词

+ Use case: stylized-concept.
 Asset type: One production-quality transparent PNG illustration for a tiny desktop pet, designed to remain adorable and readable when its entire body is only 120 pixels tall.
 Input image 1: reference ONLY for character identity, silver-to-mint hair, violet eyes, black-white-gold outfit. Do NOT retain its tall body proportions or its peace-sign pose.
 Input image 2: reference ONLY for very compact chibi body proportions, rounded silhouette, large expressive head, and detailed Japanese anime illustration quality. Do NOT copy its blue hair, maid clothes, whale motif or accessories.
 Create a NEW illustration, not a cutout or resized version of either input. One very cute Japanese manga chibi girl, approximately 2.2 heads tall, oversized rounded head occupying about 45 percent of total character height, short compact torso, tiny legs and little boots. Big luminous violet eyes, small smiling mouth, gentle blush, beautiful softly shaded silver-white hair with pale mint ends, short rounded flowing hair silhouette ending around her skirt, a small side braid and black-gold bow. White and charcoal mini dress with readable gold edging, little cape, simple gold interwoven emblem at chest. Refined anime painting and clean confident dark contours; preserve lovely facial detail, layered shaded hair and fabric, but simplify tiny gold ornament to suit desktop scale. Pose: front facing idle stance, feet level, both arms naturally relaxed, warm friendly expression. Balanced slightly pear-shaped silhouette, ample fluffy hair framing body. Compact, adorable, not slender, not tall, not long-legged.
 Composition: single full-body character centered on square canvas with 8 percent empty margin around her entire silhouette, all hair and shoes visible. No background, genuine transparent alpha, no cast shadow, no floor, no UI, no floating hearts or chat icons, no text or frame, no sprite sheet, no extra character. The final result should look like a beautifully hand-painted anime mascot, never a geometric SVG, flat vector, stick figure or crude code drawing.

原图抠图版本保留为历史产物。只有成功生成且检查过的新素材，才替换运行时角色；不把原图缩放冒充重新生图。

## 成功生成提示词

2026-10-23，内置 `image_gen`，透明背景，未传参考图片。输出 `assets/character/qiqi-chibi-v2.png`，1254×1254 RGBA。

+ Create one original adorable Japanese anime chibi girl for a tiny desktop pet. A compact 2.2-heads-tall body, oversized rounded head, short tiny legs and boots, big sparkling violet eyes, rosy cheeks, small gentle smile. Fluffy silver-white hair fading to pale mint at the tips, side braid with a small black and gold ribbon, hair framing her small body down to skirt length. White and charcoal miniature dress with refined gold trim, little cape, small gold interwoven chest emblem. Refined hand-painted anime shading with clean dark outlines, expressive face and readable clothing details. Front-facing full-body natural idle standing pose, arms relaxed at her sides, feet level. Rounded adorable silhouette that remains clear at 120 pixels tall. Single complete character centered on a square canvas with 8 percent clear margins, all hair and shoes visible. Genuine transparent alpha background. No floor, shadows, text, speech bubbles, hearts, UI, extra characters or sprite sheet. Avoid tall or slender proportions and long legs; avoid geometric vector or SVG appearance.
