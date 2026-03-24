/**
 * ADIF (Amateur Data Interchange Format) Export Utility
 *
 * ADIF is a standard format for exporting amateur radio logs.
 * Reference: https://www.adif.org/
 */

export interface QSOEntry {
  id: string;
  callsign: string;
  date: string;        // YYYYMMDD
  time: string;        // HHMM UTC
  frequency: string;   // MHz
  mode: string;        // CW, SSB, etc.
  rstSent: string;      // e.g., "599"
  rstReceived: string; // e.g., "599"
  name: string;
  qth: string;         // Location
  notes: string;
  myCallsign: string;  // Operator callsign
}

const ADIF_FIELDS: Record<keyof QSOEntry, string> = {
  id: "",
  callsign: "CALL",
  date: "QSO_DATE",
  time: "TIME_ON",
  frequency: "FREQ",
  mode: "MODE",
  rstSent: "RST_SENT",
  rstReceived: "RST_RCVD",
  name: "NAME",
  qth: "QTH",
  notes: "COMMENT",
  myCallsign: "STATION_CALLSIGN",
};

/**
 * Generate ADIF string from QSO entries
 */
export function toADIF(entries: QSOEntry[], myCallsign: string = ""): string {
  const header = `ADIF Export from CW Master
<ADIF_VER:5>3.1.4
<PROGRAMID:9>CW Master
<PROGRAMVERSION:5>1.0.0
<EOH>

`;

  const records = entries.map(entry => {
    const fields: string[] = [];

    for (const [key, adifTag] of Object.entries(ADIF_FIELDS)) {
      if (!adifTag || key === "id" || key === "myCallsign") continue;

      const value = entry[key as keyof QSOEntry];
      if (value !== undefined && value !== "") {
        const fieldStr = `${value}`;
        fields.push(`<${adifTag}:${fieldStr.length}>${fieldStr}`);
      }
    }

    // Add my callsign
    const opCallsign = entry.myCallsign || myCallsign;
    if (opCallsign) {
      fields.push(`<${ADIF_FIELDS.myCallsign}:${opCallsign.length}>${opCallsign}`);
    }

    return fields.join("") + "<EOR>";
  });

  return header + records.join("\n");
}

/**
 * Parse ADIF string to QSO entries (basic parser)
 */
export function fromADIF(adifString: string): QSOEntry[] {
  const entries: QSOEntry[] = [];
  const recordStrings = adifString.split("<EOR>").filter(s => s.trim());

  for (const record of recordStrings) {
    const entry: Partial<QSOEntry> = {};
    const fieldRegex = /<(\w+):(\d+)>([^<]+)/g;
    let match;

    while ((match = fieldRegex.exec(record)) !== null) {
      const [, tag, , value] = match;
      const upperTag = tag.toUpperCase();

      switch (upperTag) {
        case "CALL":
          entry.callsign = value;
          break;
        case "QSO_DATE":
          entry.date = value;
          break;
        case "TIME_ON":
          entry.time = value;
          break;
        case "FREQ":
          entry.frequency = value;
          break;
        case "MODE":
          entry.mode = value;
          break;
        case "RST_SENT":
          entry.rstSent = value;
          break;
        case "RST_RCVD":
          entry.rstReceived = value;
          break;
        case "NAME":
          entry.name = value;
          break;
        case "QTH":
          entry.qth = value;
          break;
        case "COMMENT":
        case "NOTES":
          entry.notes = value;
          break;
        case "STATION_CALLSIGN":
          entry.myCallsign = value;
          break;
      }
    }

    if (entry.callsign) {
      entry.id = `qso_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      entries.push(entry as QSOEntry);
    }
  }

  return entries;
}

/**
 * Export QSO log as CSV (for simple spreadsheet import)
 */
export function toCSV(entries: QSOEntry[]): string {
  const headers = ["Date", "Time", "Callsign", "Frequency", "Mode", "RST Sent", "RST Received", "Name", "QTH", "Notes"];
  const rows = entries.map(e => [
    formatDate(e.date),
    formatTime(e.time),
    e.callsign,
    e.frequency,
    e.mode,
    e.rstSent,
    e.rstReceived,
    e.name,
    e.qth,
    e.notes,
  ].map(v => `"${v || ""}"`).join(","));

  return [headers.join(","), ...rows].join("\n");
}

function formatDate(dateStr: string): string {
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
}

function formatTime(timeStr: string): string {
  if (timeStr.length === 4) {
    return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`;
  }
  return timeStr;
}
