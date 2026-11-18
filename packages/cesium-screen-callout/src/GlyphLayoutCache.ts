import { encodeGlyphDistanceField } from "./glyphDistanceField";
import { createCalloutFont } from "./font";
import { BADGE_FONT_FAMILY, normalizeCalloutRow } from "./presentationLayout";
import type { PaintItem } from "./workerRenderer";

interface Glyph { uv: number[]; w: number; h: number; advance: number; left: number; ascent: number }
interface CachedRow { font: string; text: string; glyphs: Glyph[]; width: number }
interface CachedText { rows: CachedRow[]; title?: CachedRow; badge?: CachedRow }
export const ATLAS_SIZE = 4096;
export const GLYPH_FONT_SIZE = 64;
const SIZE = ATLAS_SIZE, FONT_SIZE = GLYPH_FONT_SIZE, PADDING = 12;


/** 字形图集与逐行布局缓存：负责字体栅格化、容量回收和文字测量。 */
export class GlyphLayoutCache {
  readonly canvas = new OffscreenCanvas(SIZE, SIZE);
  private ctx = this.canvas.getContext("2d")!;
  private glyphs = new Map<string, Glyph>();
  private textCache = new WeakMap<PaintItem, CachedText>();
  private atlasX = 8;
  private atlasY = 0;
  private atlasRowHeight = 4;
  constructor() {
    this.resetAtlas();
  }
  private resetAtlas(): void {
    // 重排图集会改变 UV，必须同时清空逐行字形引用。
    this.glyphs.clear();
    this.textCache = new WeakMap();
    this.ctx.clearRect(0, 0, SIZE, SIZE);
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, 4, 4);
    this.atlasX = 8;
    this.atlasY = 0;
    this.atlasRowHeight = 4;
  }
  /** 未变化的行复用缓存；图集满时仅保留当前字符并重新排布。 */
  prepare(items: PaintItem[]): { texts: CachedText[]; maximum: number; changed: boolean } {
    const required = new Map<string, { font: string; character: string }>();
    const descriptors = items.map(item => ({
      font: createCalloutFont(item.style, FONT_SIZE),
      lines: item.lines.map(normalizeCalloutRow),
      title: item.displayMode !== "compact" && item.title !== undefined ? normalizeCalloutRow(item.title) : undefined,
      titleFont: createCalloutFont(item.titleStyle ?? item.style, FONT_SIZE),
      badge: item.badgeText ? normalizeCalloutRow(item.badgeText) : undefined,
      badgeFont: `normal 700 ${FONT_SIZE}px ${BADGE_FONT_FAMILY}`,
    }));
    const collect = (font: string, text: string, cached?: CachedRow) => {
      if (cached?.font === font && cached.text === text) return;
      for (const character of text) {
        const key = font + "\n" + character;
        if (!this.glyphs.has(key) && !required.has(key)) {
          required.set(key, { font, character });
        }
      }
    };
    descriptors.forEach((descriptor, index) => {
      const cached = this.textCache.get(items[index]!);
      descriptor.lines.forEach((line, row) => collect(descriptor.font, line, cached?.rows[row]));
      if (descriptor.title !== undefined) collect(descriptor.titleFont, descriptor.title, cached?.title);
      if (descriptor.badge !== undefined) collect(descriptor.badgeFont, descriptor.badge, cached?.badge);
    });
    let changed = false;
    // 仅栅格化缓存中没有的字符；常规数字更新通常直接命中。
    for(const [key, { font, character }] of required) {
      if(this.glyphs.has(key)) continue;
      this.ctx.font = font; this.ctx.textBaseline = "alphabetic";
      const m = this.ctx.measureText(character);
      const left = Math.ceil(m.actualBoundingBoxLeft), ascent = Math.ceil(m.actualBoundingBoxAscent);
      const w = Math.max(1, Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight)) + PADDING * 2;
      const h = Math.max(1, Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)) + PADDING * 2;
      if(this.atlasX + w > SIZE) {
        this.atlasX = 0;
        this.atlasY += this.atlasRowHeight;
        this.atlasRowHeight = 0;
      }
      if(this.atlasY + h > SIZE) {
        const active = new Set<string>();
        descriptors.forEach(descriptor => {
          for (const line of descriptor.lines) for (const character of line) active.add(descriptor.font + "\n" + character);
          if (descriptor.title !== undefined) for (const character of descriptor.title) active.add(descriptor.titleFont + "\n" + character);
          if (descriptor.badge !== undefined) for (const character of descriptor.badge) active.add(descriptor.badgeFont + "\n" + character);
        });
        const hasUnusedGlyphs = [...this.glyphs.keys()].some((cached) => !active.has(cached));
        if(hasUnusedGlyphs) {
          this.resetAtlas();
          return this.prepare(items);
        }
        throw new Error("当前字体/字符组合超出 4096px 字形图集容量");
      }
      const x = this.atlasX, y = this.atlasY;
      this.ctx.fillText(character, x + PADDING + left, y + PADDING + ascent);
      this.ctx.putImageData(
        encodeGlyphDistanceField(this.ctx.getImageData(x, y, w, h), PADDING - 2),
        x,
        y,
      );
      this.glyphs.set(key, { uv: [x / SIZE, y / SIZE, w / SIZE, h / SIZE], w, h, advance: m.width, left: left + PADDING, ascent: ascent + PADDING });
      this.atlasX += w;
      this.atlasRowHeight = Math.max(this.atlasRowHeight, h);
      changed = true;
    }
    // Two independently bordered regions, one leader and one square badge.
    let maximum = descriptors.reduce((total, descriptor) => total + 6
      + Number(descriptor.title !== undefined) * 5 + Number(descriptor.badge !== undefined), 0);
    const row = (font: string, text: string, cached?: CachedRow): CachedRow => {
      if (cached?.font === font && cached.text === text) return cached;
      const glyphs: Glyph[] = [];
      let width = 0;
      for (const character of text) {
        const glyph = this.glyphs.get(font + "\n" + character)!;
        glyphs.push(glyph);
        width += glyph.advance;
      }
      return { font, text, glyphs, width };
    };
    const texts = items.map((item, index) => {
      const descriptor = descriptors[index]!;
      let cached = this.textCache.get(item);
      if (!cached) {
        cached = { rows: [] };
        this.textCache.set(item, cached);
      }
      cached.rows.length = descriptor.lines.length;
      descriptor.lines.forEach((text, index) => {
        cached.rows[index] = row(descriptor.font, text, cached.rows[index]);
        maximum += cached.rows[index]!.glyphs.length;
      });
      cached.title = descriptor.title !== undefined ? row(descriptor.titleFont, descriptor.title, cached.title) : undefined;
      cached.badge = descriptor.badge !== undefined ? row(descriptor.badgeFont, descriptor.badge, cached.badge) : undefined;
      maximum += (cached.title?.glyphs.length ?? 0) + (cached.badge?.glyphs.length ?? 0);
      return cached;
    });

    return { texts, maximum, changed };
  }
}
