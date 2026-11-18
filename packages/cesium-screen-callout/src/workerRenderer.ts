import type { TargetCalloutStyle } from "./legacyCallout";
import { createCalloutFont } from "./font";
import {
  BADGE_FONT_FAMILY, BADGE_FONT_SIZE, layoutCalloutPresentation, normalizeCalloutRow,
  type CalloutPresentationItem, type PresentationRect,
} from "./presentationLayout";

export interface PaintItem extends CalloutPresentationItem { x: number; y: number; lines: string[] }

/** One fixed-size screen canvas; no per-target textures or unbounded glyph/bitmap cache. */
export class WorkerCalloutRenderer {
  private readonly context: OffscreenCanvasRenderingContext2D;
  private canvas: OffscreenCanvas;
  constructor(canvas: OffscreenCanvas) {
    this.canvas = canvas;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("OffscreenCanvas 2D 不可用");
    this.context = context;
  }

  draw(items: PaintItem[], positions: Float64Array, visibility: Uint8Array, vp: number[], width: number, height: number, ratio: number, bounds: Float32Array, actionRects?: Float32Array): number {
    const ctx = this.context;
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 2;
    let visible = 0;
    for (let index = 0; index < items.length; index++) {
      const b = index * 5;
      bounds[b + 4] = 0;
      actionRects?.fill(0, index * 4, index * 4 + 4);
      if (!visibility[index]) continue;
      visible++;
      const x = positions[index * 3]!, y = positions[index * 3 + 1]!, z = positions[index * 3 + 2]!;
      const w = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
      const ax = ((vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!) / w + 1) * width / 2;
      const ay = (1 - (vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!) / w) * height / 2;
      const item = items[index]!, s = item.style;
      ctx.font = createCalloutFont(s);
      let textWidth = 1;
      for (const line of item.lines) {
        const m = ctx.measureText(normalizeCalloutRow(line));
        textWidth = Math.max(textWidth, m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
      }
      const t = item.titleStyle ?? s;
      ctx.font = createCalloutFont(t);
      const titleWidth = item.title !== undefined ? ctx.measureText(normalizeCalloutRow(item.title)).width : 0;
      const geometry = layoutCalloutPresentation(item, { bodyWidth: textWidth, titleWidth });
      const panelWidth = geometry.width, panelHeight = geometry.height;
      const left = ax + item.x, bottom = ay + item.y, top = bottom - panelHeight;
      bounds[b] = ax; bounds[b + 1] = ay; bounds[b + 2] = panelWidth; bounds[b + 3] = panelHeight; bounds[b + 4] = 1;
      if (geometry.actions && actionRects) {
        const a = geometry.actions;
        actionRects.set([a.x, a.y, a.width, a.height], index * 4);
      }
      if (s.showLeader) {
        let nx = item.x, ny = item.y;
        for (const [cx, cy] of [[item.x, item.y - panelHeight], [item.x + panelWidth, item.y - panelHeight], [item.x + panelWidth, item.y]]) {
          if (cx! * cx! + cy! * cy! < nx * nx + ny * ny) { nx = cx!; ny = cy!; }
        }
        ctx.strokeStyle = s.leaderColor;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + nx, ay + ny); ctx.stroke();
      }
      const region = (rect: PresentationRect, style: TargetCalloutStyle, topBorder = true, bottomBorder = true) => {
        if (style.backgroundColor !== "transparent") {
          ctx.fillStyle = style.backgroundColor; ctx.fillRect(left + rect.x, top + rect.y, rect.width, rect.height);
        }
        if (style.showBorder) {
          ctx.fillStyle = style.borderColor;
          if (topBorder) ctx.fillRect(left + rect.x, top + rect.y, rect.width, 2);
          if (bottomBorder) ctx.fillRect(left + rect.x, top + rect.y + rect.height - 2, rect.width, 2);
          ctx.fillRect(left + rect.x, top + rect.y, 2, rect.height);
          ctx.fillRect(left + rect.x + rect.width - 2, top + rect.y, 2, rect.height);
        }
      };
      region(geometry.body, s, !geometry.header);
      if (geometry.header) region(geometry.header, t, true, false);
      ctx.font = createCalloutFont(s);
      ctx.fillStyle = s.textColor;
      item.lines.forEach((line, row) => ctx.fillText(normalizeCalloutRow(line), left + geometry.bodyText.x,
        top + geometry.bodyText.y + s.fontSize * .8 + row * geometry.bodyLineHeight));
      if (geometry.titleText) {
        ctx.font = createCalloutFont(t); ctx.fillStyle = t.textColor;
        ctx.fillText(normalizeCalloutRow(item.title ?? ""), left + geometry.titleText.x, top + geometry.titleText.y + t.fontSize * .8);
      }
      if (geometry.badge) {
        const r = geometry.badge, style = geometry.header ? t : s;
        ctx.fillStyle = style.badgeColor; ctx.fillRect(left + r.x, top + r.y, r.width, r.height);
        ctx.font = `normal 700 ${BADGE_FONT_SIZE}px ${BADGE_FONT_FAMILY}`; ctx.fillStyle = style.badgeTextColor;
        const text = normalizeCalloutRow(item.badgeText ?? ""), width = ctx.measureText(text).width;
        ctx.fillText(text, left + r.x + (r.width - width) / 2,
          top + r.y + (r.height - BADGE_FONT_SIZE) / 2 + BADGE_FONT_SIZE * .8);
      }
    }
    return visible;
  }
}
