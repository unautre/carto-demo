import { WFS_JSON_FORMAT } from '../ogc';

interface Props {
  value: string;
  onChange: (format: string) => void;
  /** formats advertised in GetCapabilities, if known */
  serverFormats?: string[];
}

/** GetFeature output format: GeoJSON, the server's default GML, or any format the server lists. */
export function WfsFormatSelect({ value, onChange, serverFormats = [] }: Props) {
  const options = [
    { value: WFS_JSON_FORMAT, label: 'GeoJSON' },
    { value: '', label: 'GML / XML (server default)' },
    ...[...new Set([...serverFormats, value])]
      .filter((f) => f && f !== WFS_JSON_FORMAT)
      .map((f) => ({ value: f, label: f })),
  ];
  return (
    <label className="field" title="Pick GML / XML for servers that cannot return JSON">
      <span>Output format</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
