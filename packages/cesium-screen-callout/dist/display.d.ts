import { type TargetCalloutStyle } from "./legacyCallout";
export type CalloutDisplayMode = "detailed" | "compact";
export type CalloutStyleSection = CalloutDisplayMode | "title";
export interface CalloutField {
    key: string;
    value: string | number | boolean | null;
}
export type CompactFieldFormatter = (field: Readonly<CalloutField>, index: number, id: string | number) => string;
export declare const DEFAULT_COMPACT_CALLOUT_STYLE: Readonly<TargetCalloutStyle>;
export declare const DEFAULT_TITLE_CALLOUT_STYLE: Readonly<TargetCalloutStyle>;
export declare function validateStyleSection(section: CalloutStyleSection): void;
/** Only the value is shown; title is independent of the compact formatter. */
export declare function getFieldTitle(fields: readonly CalloutField[]): string | undefined;
export declare function validateDisplayMode(mode: CalloutDisplayMode): void;
export declare function copyCalloutFields(fields: readonly CalloutField[]): CalloutField[];
/** Functions execute on the main thread. Only the resulting one-line text reaches the Worker. */
export declare function formatCompactFields(fields: readonly CalloutField[], formatter: CompactFieldFormatter | undefined, id: string | number, fallbackLines?: readonly string[]): string[];
//# sourceMappingURL=display.d.ts.map