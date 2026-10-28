declare module 'mapshaper' {
  const mapshaper: {
    /** Runs mapshaper commands on in-memory inputs; resolves to output files by name. */
    applyCommands(
      commands: string,
      input: Record<string, unknown>,
    ): Promise<Record<string, string | Uint8Array>>;
  };
  export default mapshaper;
}

declare module 'polylabel' {
  /** Pole of inaccessibility of a polygon ([x, y] rings) with the given precision. */
  export default function polylabel(
    polygon: number[][][],
    precision?: number,
  ): [number, number] & { distance: number };
}
