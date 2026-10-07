export interface QueryTemplateContext {
  /** epoch ms: the Timeline widget's current position if one is enabled, else "now" */
  timestamp: number;
  /** epoch ms: the Timeline widget's range, or `timestamp` on both ends when it's off */
  timeRangeStart: number;
  timeRangeEnd: number;
  /** degrees: the map viewport's current extent (longitude/latitude) */
  bboxWest: number;
  bboxSouth: number;
  bboxEast: number;
  bboxNorth: number;
}

/**
 * `{{timestamp}}` / `{{timeRangeStart}}` / `{{timeRangeEnd}}` / `{{bboxWest}}` / `{{bboxSouth}}` /
 * `{{bboxEast}}` / `{{bboxNorth}}` in a query are replaced with the matching number before it's
 * sent. Double braces (not ClickHouse's own `{name:Type}` parameter syntax) so the two don't
 * collide — a query can use both.
 */
const PLACEHOLDER = /\{\{\s*(timestamp|timeRangeStart|timeRangeEnd|bboxWest|bboxSouth|bboxEast|bboxNorth)\s*\}\}/g;

export function interpolateQuery(query: string, ctx: QueryTemplateContext): string {
  return query.replace(PLACEHOLDER, (_, name: keyof QueryTemplateContext) => String(ctx[name]));
}
