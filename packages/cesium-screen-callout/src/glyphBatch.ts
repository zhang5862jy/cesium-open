import type { PaintItem } from "./workerRenderer";
import { GlyphLayoutCache, ATLAS_SIZE as SIZE, GLYPH_FONT_SIZE as FONT_SIZE } from "./GlyphLayoutCache";
import { BADGE_FONT_SIZE, layoutCalloutPresentation, type PresentationRect } from "./presentationLayout";
import type { TargetCalloutStyle } from "./legacyCallout";

export interface GlyphBatch {
  instances: Float32Array;
  count: number;
  /** Leading instances contain only leaders; absent on older batches. */
  leaderCount?: number;
  sizes: Float32Array;
  /** Local toolbar rectangles, committed together with the matching panel sizes. */
  actionRects?: Float32Array;
  atlas?: ImageBitmap;
  /** 仅位置或显隐变化，主线程应保留现有 GPU 字符缓冲。 */
  unchanged?: boolean;
}

const STRIDE = 16;

/** 将布局转换为实例缓冲；图集管理交给 GlyphLayoutCache。公开接口保持兼容。 */
export class GlyphBatchBuilder {
  private readonly layout = new GlyphLayoutCache();
  private colorCanvas = new OffscreenCanvas(1, 1);
  private colorContext = this.colorCanvas.getContext("2d", { willReadFrequently: true })!;
  // 有上限的颜色缓存，避免频繁从 Canvas 读取相同 CSS 颜色。
  private colors = new Map<string, number[]>();
  private color(value: string): number[] {
    let color = this.colors.get(value);
    if(!color) {
      if(this.colors.size >= 256) this.colors.clear();
      const ctx = this.colorContext;
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
      color = Array.from(ctx.getImageData(0, 0, 1, 1).data, n => n / 255);
      this.colors.set(value, color);
    }
    return color;
  }

  async build(items: PaintItem[], reusable?: Float32Array): Promise<GlyphBatch> {
    const { texts, maximum, changed } = this.layout.prepare(items);
    const capacity = maximum * STRIDE;
    const instances = reusable && reusable.length >= capacity ? reusable : new Float32Array(capacity);
    const sizes = new Float32Array(items.length * 2);
    const actionRects = new Float32Array(items.length * 4);
    let count = 0;
    const quad = (id: number, kind: number, x: number, y: number, w: number, h: number, uv: number[], color: number[]) => {
      // 16 个 float：目标/类型 2、偏移 2、两条轴 4、UV 4、颜色 4。
      if(color[3] === 0 || w === 0 || h === 0) return;
      const n = count++ * STRIDE;
      instances[n] = id; instances[n + 1] = kind;
      instances[n + 2] = x; instances[n + 3] = y;
      instances[n + 4] = w; instances[n + 5] = 0;
      instances[n + 6] = 0; instances[n + 7] = h;
      for(let i = 0;i < 4;i++) { instances[n + 8 + i] = uv[i]!; instances[n + 12 + i] = color[i]!; }
    };
    const white = [1 / SIZE, 1 / SIZE, 2 / SIZE, 2 / SIZE];
    items.forEach((item, index) => {
      if (item.style.showLeader) quad(index, 1, 0, 0, 1, 1, white, this.color(item.style.leaderColor));
    });
    const leaderCount = count;
    items.forEach((item, index) => {
      const s = item.style, t = item.titleStyle ?? s, scale = s.fontSize / FONT_SIZE;
      const text = texts[index]!, rows = text.rows;
      let maxWidth = 1;
      for(const row of rows) maxWidth = Math.max(maxWidth, row.width * scale);
      const geometry = layoutCalloutPresentation(item, { bodyWidth: maxWidth, titleWidth: (text.title?.width ?? 0) * t.fontSize / FONT_SIZE });
      sizes[index * 2] = geometry.width; sizes[index * 2 + 1] = geometry.height;
      if (geometry.actions) {
        const a = geometry.actions;
        actionRects.set([a.x, a.y, a.width, a.height], index * 4);
      }
      const region = (r: PresentationRect, style: TargetCalloutStyle, topBorder = true, bottomBorder = true) => {
        quad(index, 0, r.x, r.y, r.width, r.height, white, this.color(style.backgroundColor));
        if (!style.showBorder) return;
        const color = this.color(style.borderColor);
        if (topBorder) quad(index, 0, r.x, r.y, r.width, 2, white, color);
        if (bottomBorder) quad(index, 0, r.x, r.y + r.height - 2, r.width, 2, white, color);
        quad(index, 0, r.x, r.y, 2, r.height, white, color);
        quad(index, 0, r.x + r.width - 2, r.y, 2, r.height, white, color);
      };
      // Title and body share one outer outline, with no border at their seam.
      region(geometry.body, s, !geometry.header);
      if (geometry.header) region(geometry.header, t, true, false);
      const drawRow = (row: typeof rows[number], fontSize: number, x: number, y: number, color: number[]) => {
        const scale = fontSize / FONT_SIZE;
        let pen = x;
        const baseline = y + fontSize * .8;
        for(const glyph of row.glyphs) {
          quad(index, 2, pen - glyph.left * scale, baseline - glyph.ascent * scale, glyph.w * scale, glyph.h * scale,
            glyph.uv, color);
          pen += glyph.advance * scale;
        }
      };
      const color = this.color(s.textColor);
      rows.forEach((row, rowIndex) => {
        drawRow(row, s.fontSize, geometry.bodyText.x, geometry.bodyText.y + rowIndex * geometry.bodyLineHeight, color);
      });
      if (text.title && geometry.titleText) {
        drawRow(text.title, t.fontSize, geometry.titleText.x, geometry.titleText.y, this.color(t.textColor));
      }
      if (text.badge && geometry.badge) {
        const r = geometry.badge, style = geometry.header ? t : s;
        quad(index, 0, r.x, r.y, r.width, r.height, white, this.color(style.badgeColor));
        drawRow(text.badge, BADGE_FONT_SIZE, r.x + (r.width - text.badge.width * BADGE_FONT_SIZE / FONT_SIZE) / 2,
          r.y + (r.height - BADGE_FONT_SIZE) / 2, this.color(style.badgeTextColor));
      }
    });
    return { instances, count, leaderCount, sizes, actionRects, atlas: changed ? await createImageBitmap(this.layout.canvas) : undefined };
  }
}
