export interface SnapshotCountry {
  qid: string;
  sitelinks: number;
  /** Set when notoriety is measured on another item than `qid`. */
  sitelinksQid?: string;
  population: { value: number; year: number } | null;
  drivingSide: 'left' | 'right' | null;
  highestPoint: { qid: string; label: string; elevationM: number } | null;
  currencies: string[];
  languages: string[];
  memberOf: string[];
  flagColors: string[];
  unescoSites: number;
}
