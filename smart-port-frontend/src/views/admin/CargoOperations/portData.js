/*
=========================================================
PORT DATA

Reads the real CSV files behind the Cargo Operations page and keeps
them in this browser (localStorage). The Predict Cargo Throughput tab
(Delay Prediction page) reads the same stored files.

  trade             Singapore Merchandise Trade by Commodity (HS 2-Digit)
                    first column = commodity, then 2013_Total, 2013_Export,
                    2013_Import ... in US$ million (SingStat, data.gov.sg)

  cargoBreakdown    Cargo Throughput Breakdown Annual Data
                    year, cargo_type_primary, cargo_type_secondary,
                    cargo_throughput in thousand tonnes (MPA, data.gov.sg)

  cargoTotal        Cargo Throughput Total Annual Data
                    year, cargo_throughput in thousand tonnes

  containerMonthly  Container Throughput Monthly
                    month, container_throughput in thousand TEU

  seaCargo          Sea Cargo and Shipping Statistics Annual
                    DataSeries, 2025, 2024, ... (SingStat, data.gov.sg)

  cargoMonthly      Cargo Throughput, Monthly (total)
                    month, cargo_throughput in thousand tonnes (MPA)

  cargoMonthlyBreakdown
                    Cargo Throughput, Monthly (by type)
                    month, cargo_type_primary, cargo_type_secondary,
                    cargo_throughput in thousand tonnes (MPA)

  otherSeries       Any other Singapore port / cargo CSV with a month or
                    year column and number columns (for example vessel
                    arrivals, bunker sales). Kept as plain series.

The kind of a file is worked out from its column names, so the files
can be chosen in any order, several at once. Nothing is invented:
a panel stays empty until its file is imported.
=========================================================
*/

// =========================================================
// THE FIVE DATASETS
// =========================================================

export const DATASETS = [
  {
    key: "trade",
    label: "Imports and exports by commodity",
    file: "Singapore Merchandise Trade by Commodity (HS 2-Digit)",
    shownIn: "Cargo Operations tab",
  },
  {
    key: "cargoBreakdown",
    label: "Cargo throughput by type (yearly)",
    file: "Cargo Throughput Breakdown Annual Data",
    shownIn: "Both tabs",
  },
  {
    key: "cargoTotal",
    label: "Cargo throughput total (yearly)",
    file: "Cargo Throughput Total Annual Data",
    shownIn: "Both tabs",
  },
  {
    key: "containerMonthly",
    label: "Container throughput (monthly)",
    file: "Container Throughput Monthly",
    shownIn: "Cargo Throughput tab",
  },
  {
    key: "seaCargo",
    label: "Sea cargo and shipping statistics",
    file: "Sea Cargo and Shipping Statistics Annual",
    shownIn: "Cargo Throughput tab",
  },
  {
    key: "cargoMonthly",
    label: "Cargo throughput total (monthly)",
    file: "Cargo Throughput Monthly (total)",
    shownIn: "Cargo Throughput tab",
  },
  {
    key: "cargoMonthlyBreakdown",
    label: "Cargo throughput by type (monthly)",
    file: "Cargo Throughput Monthly (by type)",
    shownIn: "Cargo Throughput tab",
  },
  {
    key: "otherSeries",
    label: "Other port and cargo figures",
    file: "Any other Singapore port or cargo CSV",
    shownIn: "Cargo Throughput tab",
  },
];

export const TRADE_DATASET_URL =
  "https://data.gov.sg/datasets/d_d066bd78f5449a9b041ed5e8d98b6ef6/view";

export const emptyData = () => ({
  trade: null,
  cargoBreakdown: null,
  cargoTotal: null,
  containerMonthly: null,
  seaCargo: null,
  cargoMonthly: null,
  cargoMonthlyBreakdown: null,
  otherSeries: null,
});

// =========================================================
// CSV TEXT -> TABLE
// =========================================================

/* Reads CSV text into rows of cells (quoted cells, comma / semicolon /
   tab separators, Excel's byte-order mark). */
export const parseCsv = (text) => {
  const source = String(text ?? "").replace(/^﻿/, "");

  const firstLine = source.split(/\r?\n/, 1)[0] || "";

  const separator = [",", ";", "\t"]
    .map((candidate) => ({
      candidate,
      count: firstLine.split(candidate).length - 1,
    }))
    .sort((a, b) => b.count - a.count)[0].candidate;

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === separator) {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
};

// "Cargo Type Primary" and "cargo_type_primary" both become
// "cargo type primary".
const cleanHeader = (value) =>
  String(value ?? "")
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// "2013_Total" and "(2013) Total" both become "2013_total".
const slug = (value) =>
  String(value ?? "")
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// A number, or NaN for an empty cell, "na" and other text.
const readValue = (text) => {
  const cleaned = String(text ?? "")
    .replace(/,/g, "")
    .trim();

  if (cleaned === "") return NaN;

  return Number(cleaned);
};

const problemsMessage = (problems) =>
  `${problems.length} row${
    problems.length === 1 ? "" : "s"
  } could not be read, so nothing was imported. ${problems
    .slice(0, 3)
    .join(" ")}`;

// =========================================================
// LABELS
// =========================================================

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "2024-05" -> "May 2024"
export const monthLabel = (period) => {
  const [year, month] = String(period).split("-");

  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
};

// =========================================================
// 1. MERCHANDISE TRADE
// =========================================================

// 2013_export, 2013_import, 2013_total (also "export_2013").
const readTradeHeader = (name) => {
  let year = null;
  let word = null;

  const first = /^(\d{4})_?(total|exports?|imports?)(?:_.*)?$/.exec(name);

  if (first) {
    year = first[1];
    word = first[2];
  } else {
    const second = /^(total|exports?|imports?)_?(\d{4})(?:_.*)?$/.exec(name);

    if (second) {
      year = second[2];
      word = second[1];
    }
  }

  if (!year) {
    return null;
  }

  return {
    year: Number(year),
    kind: word.startsWith("export")
      ? "exp"
      : word.startsWith("import")
      ? "imp"
      : "total",
  };
};

// Returns { data } or { error }, or null when the table is not a
// merchandise trade file.
const readTradeTable = (table) => {
  const names = table[0].map(slug);

  const columns = [];

  names.forEach((name, index) => {
    const info = index > 0 ? readTradeHeader(name) : null;

    if (info) {
      columns.push({ index, year: info.year, kind: info.kind });
    }
  });

  const columnOf = (year, kind) =>
    columns.find((column) => column.year === year && column.kind === kind);

  const years = [...new Set(columns.map((column) => column.year))]
    .filter((year) => columnOf(year, "imp") && columnOf(year, "exp"))
    .sort((a, b) => a - b);

  if (years.length === 0) {
    return null;
  }

  const numberAt = (row, column) => {
    const number = readValue(row[column.index]);

    return Number.isFinite(number) ? number : null;
  };

  let total = null;
  const rows = [];

  table.slice(1).forEach((row, position) => {
    const label = String(row[0] === undefined ? "" : row[0]).trim();

    if (!label) {
      return;
    }

    const imp = {};
    const exp = {};

    years.forEach((year) => {
      imp[year] = numberAt(row, columnOf(year, "imp"));
      exp[year] = numberAt(row, columnOf(year, "exp"));
    });

    const coded = /^\[([^\]]+)\]\s*(.*)$/.exec(label);

    // The first row without an HS code is the all-commodities total.
    if (
      !coded &&
      total === null &&
      (position === 0 || /merchandise trade/i.test(label))
    ) {
      total = { imp, exp };
      return;
    }

    rows.push({
      code: coded ? coded[1].trim() : "",
      name: coded ? coded[2].trim() || label : label,
      imp,
      exp,
    });
  });

  if (rows.length === 0) {
    return { error: "The trade file has no commodity rows." };
  }

  return { data: { years, total, rows } };
};

// =========================================================
// 2. CARGO THROUGHPUT BY TYPE (yearly)
// =========================================================

const readCargoBreakdown = (table, headers) => {
  const yearAt = headers.indexOf("year");
  const primaryAt = headers.indexOf("cargo type primary");
  const secondaryAt = headers.indexOf("cargo type secondary");
  const valueAt = headers.indexOf("cargo throughput");

  const byKey = new Map();
  const problems = [];

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;

    const year = String(cells[yearAt] ?? "").trim();
    const primary = String(cells[primaryAt] ?? "").trim();
    const secondary = String(cells[secondaryAt] ?? "").trim();
    const value = readValue(cells[valueAt]);

    if (!/^\d{4}$/.test(year) || !primary || !secondary) {
      problems.push(`Line ${line}: needs a year and both cargo types.`);
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      problems.push(`Line ${line}: the throughput is not a number.`);
      return;
    }

    byKey.set(`${year}|${primary}|${secondary}`, {
      year,
      primary,
      secondary,
      value,
    });
  });

  if (problems.length > 0) {
    return { error: problemsMessage(problems) };
  }

  return { data: { rows: [...byKey.values()] } };
};

// =========================================================
// 3. CARGO THROUGHPUT TOTAL (yearly)
// =========================================================

const readCargoTotal = (table, headers) => {
  const yearAt = headers.indexOf("year");
  const valueAt = headers.indexOf("cargo throughput");

  const byYear = new Map();
  const problems = [];

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;

    const year = String(cells[yearAt] ?? "").trim();
    const value = readValue(cells[valueAt]);

    if (!/^\d{4}$/.test(year)) {
      problems.push(`Line ${line}: the year is not a number such as 2024.`);
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      problems.push(`Line ${line}: the throughput is not a number.`);
      return;
    }

    byYear.set(year, { year, value });
  });

  if (problems.length > 0) {
    return { error: problemsMessage(problems) };
  }

  return { data: { rows: [...byYear.values()] } };
};

// =========================================================
// 4. CONTAINER THROUGHPUT (monthly)
// =========================================================

const readContainerMonthly = (table, headers) => {
  const monthAt = headers.indexOf("month");
  const valueAt = headers.indexOf("container throughput");

  const byMonth = new Map();
  const problems = [];

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;

    const month = String(cells[monthAt] ?? "").trim();
    const value = readValue(cells[valueAt]);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      problems.push(`Line ${line}: the month must look like 2024-05.`);
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      problems.push(`Line ${line}: the throughput is not a number.`);
      return;
    }

    byMonth.set(month, { month, value });
  });

  if (problems.length > 0) {
    return { error: problemsMessage(problems) };
  }

  return {
    data: {
      rows: [...byMonth.values()].sort((a, b) =>
        a.month < b.month ? -1 : a.month > b.month ? 1 : 0
      ),
    },
  };
};

// =========================================================
// 5. SEA CARGO AND SHIPPING STATISTICS (yearly, years across)
// =========================================================

// What each known row means. Rows that match nothing are kept but unused.
const SEA_ROLES = [
  { role: "total", test: /^total cargo/i, unit: "thousand tonnes" },
  { role: "general", test: /^cargo\s*\(general\)/i, unit: "thousand tonnes" },
  { role: "bulk", test: /^cargo\s*\(bulk\)/i, unit: "thousand tonnes" },
  { role: "containers", test: /container/i, unit: "thousand TEU" },
  { role: "bunker", test: /bunker/i, unit: "thousand tonnes" },
  { role: "ships", test: /registry.*number/i, unit: "ships" },
  { role: "tonnage", test: /registry.*gt/i, unit: "thousand GT" },
];

// The Sea Cargo and Shipping Statistics table has rows such as
// "Total Cargo" or "Bunker Sales"; other SingStat tables become plain series.
const isSeaCargoTable = (table) =>
  table
    .slice(1)
    .some((cells) => {
      const label = String(cells[0] ?? "").trim();
      return SEA_ROLES.some((item) => ["total", "containers", "bunker"].includes(item.role) && item.test.test(label));
    });

const readSeaCargo = (table) => {
  const header = table[0].map((cell) => String(cell ?? "").trim());

  const yearColumns = [];

  header.forEach((cell, index) => {
    if (index > 0 && /^\d{4}$/.test(cell)) {
      yearColumns.push({ index, year: cell });
    }
  });

  if (yearColumns.length === 0) {
    return {
      error: "The file has no year columns such as 2025, 2024, 2023.",
    };
  }

  const years = yearColumns.map((column) => column.year).sort();

  const series = [];

  table.slice(1).forEach((cells) => {
    const label = String(cells[0] ?? "").trim();

    if (!label) {
      return;
    }

    const values = {};

    yearColumns.forEach((column) => {
      const number = readValue(cells[column.index]);

      values[column.year] = Number.isFinite(number) ? number : null;
    });

    const known = SEA_ROLES.find((item) => item.test.test(label));

    series.push({
      role: known ? known.role : "",
      label,
      unit: known ? known.unit : "",
      values,
    });
  });

  if (series.length === 0) {
    return { error: "The file has no data rows." };
  }

  return { data: { years, series } };
};

export const seaSeries = (sea, role) =>
  sea ? sea.series.find((item) => item.role === role) : undefined;

// =========================================================
// 6. CARGO THROUGHPUT MONTHLY (total, and by type)
// =========================================================

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const readCargoMonthly = (table, headers) => {
  const monthAt = headers.indexOf("month");
  const valueAt = headers.indexOf("cargo throughput");

  const byMonth = new Map();
  const problems = [];

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const month = normaliseMonth(cells[monthAt]);
    const value = readValue(cells[valueAt]);

    if (!month) {
      problems.push(`Line ${line}: the month must look like 2024-05.`);
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      problems.push(`Line ${line}: the throughput is not a number.`);
      return;
    }

    byMonth.set(month, { month, value });
  });

  if (problems.length > 0) {
    return { error: problemsMessage(problems) };
  }

  return {
    data: {
      rows: [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
    },
  };
};

const readCargoMonthlyBreakdown = (table, headers) => {
  const monthAt = headers.indexOf("month");
  const primaryAt = headers.indexOf("cargo type primary");
  const secondaryAt = headers.indexOf("cargo type secondary");
  const valueAt = headers.indexOf("cargo throughput");

  const byKey = new Map();
  const problems = [];

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const month = normaliseMonth(cells[monthAt]);
    const primary = String(cells[primaryAt] ?? "").trim();
    const secondary = String(cells[secondaryAt] ?? "").trim();
    const value = readValue(cells[valueAt]);

    if (!month || !primary || !secondary) {
      problems.push(`Line ${line}: needs a month such as 2024-05 and both cargo types.`);
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      problems.push(`Line ${line}: the throughput is not a number.`);
      return;
    }

    byKey.set(`${month}|${primary}|${secondary}`, { month, primary, secondary, value });
  });

  if (problems.length > 0) {
    return { error: problemsMessage(problems) };
  }

  return { data: { rows: [...byKey.values()] } };
};

// =========================================================
// 7. ANY OTHER PORT / CARGO CSV (kept as plain series)
//
// Long tables:  a month or year column, optional text columns (for
//               example cargo type) and number columns.
// Wide tables:  SingStat style, first column = series name, then one
//               column per year (2025) or month (2025 Sep, 2025Sep).
// =========================================================

const PORT_WORDS =
  /cargo|container|teu|throughput|tonne|tons?\b|bunker|vessel|ship|port|maritime|berth|freight|shipping|sea|anchorage|arrival|harbour|harbor|registry|gross tonnage|\bgt\b|mpa/i;

const SHORT_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// "2024-05", "2024-5", "2024/05", "2024 May", "2024May", "May 2024" -> "2024-05"
function normaliseMonth(text) {
  const value = String(text ?? "").trim();

  let match = /^(\d{4})[-/](\d{1,2})$/.exec(value);
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
  }

  match = /^(\d{4})\s*([A-Za-z]{3})[a-z]*$/.exec(value);
  if (match && SHORT_MONTHS.includes(match[2].toLowerCase())) {
    return `${match[1]}-${String(SHORT_MONTHS.indexOf(match[2].toLowerCase()) + 1).padStart(2, "0")}`;
  }

  match = /^([A-Za-z]{3})[a-z]*[\s-]+(\d{4})$/.exec(value);
  if (match && SHORT_MONTHS.includes(match[1].toLowerCase())) {
    return `${match[2]}-${String(SHORT_MONTHS.indexOf(match[1].toLowerCase()) + 1).padStart(2, "0")}`;
  }

  return null;
}

const normaliseYear = (text) => {
  const value = String(text ?? "").trim();
  return /^\d{4}$/.test(value) ? value : null;
};

const fileTitle = (fileName) =>
  String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .trim();

const MAX_SERIES = 30;

const readLongSeries = (table, fileName) => {
  const header = table[0].map((cell) => String(cell ?? "").trim());
  const body = table.slice(1);

  const share = (index, test) => {
    const cells = body.map((row) => row[index]).filter((cell) => String(cell ?? "").trim() !== "");
    return cells.length ? cells.filter(test).length / cells.length : 0;
  };

  let timeAt = -1;
  let frequency = null;

  header.forEach((name, index) => {
    if (timeAt !== -1) return;
    if (share(index, (cell) => normaliseMonth(cell)) >= 0.9) {
      timeAt = index;
      frequency = "monthly";
    } else if (share(index, (cell) => normaliseYear(cell)) >= 0.9 && /year|yr|period|date|time/i.test(name)) {
      timeAt = index;
      frequency = "yearly";
    }
  });

  if (timeAt === -1) return null;

  const numberColumns = [];
  const textColumns = [];

  header.forEach((name, index) => {
    if (index === timeAt || /^_?id$/i.test(name)) return;
    const numeric = share(index, (cell) => Number.isFinite(readValue(cell)));
    if (numeric >= 0.8) numberColumns.push(index);
    else textColumns.push(index);
  });

  if (numberColumns.length === 0) return null;

  const title = fileTitle(fileName);
  const series = new Map();

  body.forEach((cells) => {
    const period = frequency === "monthly" ? normaliseMonth(cells[timeAt]) : normaliseYear(cells[timeAt]);
    if (!period) return;

    const group = textColumns.map((index) => String(cells[index] ?? "").trim()).filter(Boolean);

    numberColumns.forEach((index) => {
      const value = readValue(cells[index]);
      if (!Number.isFinite(value)) return;

      const parts = [...group];
      if (numberColumns.length > 1 || parts.length === 0) parts.push(header[index]);
      const name = `${title ? `${title}: ` : ""}${parts.join(", ")}`;

      if (!series.has(name)) {
        if (series.size >= MAX_SERIES) return;
        series.set(name, { name, frequency, values: new Map() });
      }
      const item = series.get(name);
      item.values.set(period, (item.values.get(period) || 0) + value);
    });
  });

  return [...series.values()];
};

const readWideSeries = (table, fileName) => {
  const header = table[0].map((cell) => String(cell ?? "").trim());
  const columns = [];

  header.forEach((cell, index) => {
    if (index === 0) return;
    const month = normaliseMonth(cell);
    const year = normaliseYear(cell);
    if (month) columns.push({ index, period: month, frequency: "monthly" });
    else if (year) columns.push({ index, period: year, frequency: "yearly" });
  });

  if (columns.length < 3) return null;

  const frequency =
    columns.filter((c) => c.frequency === "monthly").length >= columns.length / 2 ? "monthly" : "yearly";
  const used = columns.filter((c) => c.frequency === frequency);
  const title = fileTitle(fileName);
  const series = [];

  table.slice(1).forEach((cells) => {
    const label = String(cells[0] ?? "").trim();
    if (!label || series.length >= MAX_SERIES) return;

    const values = new Map();
    used.forEach((column) => {
      const value = readValue(cells[column.index]);
      if (Number.isFinite(value)) values.set(column.period, value);
    });

    if (values.size > 0) {
      series.push({ name: `${title ? `${title}: ` : ""}${label}`, frequency, values });
    }
  });

  return series;
};

const readOtherSeries = (table, fileName) => {
  const headerText = table[0].join(" ");
  const firstLabels = table
    .slice(1, 40)
    .map((row) => String(row[0] ?? ""))
    .join(" ");

  if (!PORT_WORDS.test(`${fileName} ${headerText} ${firstLabels}`)) {
    return {
      error:
        "This file does not look like Singapore port or cargo data: its name and columns do not mention cargo, containers, ships, vessels, bunkers or the port.",
    };
  }

  const found =
    readLongSeries(table, fileName) ||
    (String(table[0][0] ?? "").trim() ? readWideSeries(table, fileName) : null);

  if (!found || found.length === 0) {
    return null;
  }

  const series = found
    .map((item) => ({
      key: slug(`${fileName}_${item.name}`).slice(0, 110),
      name: item.name,
      unit: "",
      frequency: item.frequency,
      fileName,
      rows: [...item.values.entries()]
        .map(([period, value]) => ({ period, value }))
        .sort((a, b) => (a.period < b.period ? -1 : 1)),
    }))
    .filter((item) => item.rows.length >= 3);

  if (series.length === 0) {
    return { error: "The file has fewer than 3 dated figures per series." };
  }

  return { data: { series } };
};

/* Adds newly imported series to the ones already stored (a series with
   the same key is replaced). */
export const mergeOtherSeries = (stored, incoming) => {
  const keep = (stored && Array.isArray(stored.series) ? stored.series : []).filter(
    (item) => !incoming.series.some((other) => other.key === item.key)
  );
  return { series: [...keep, ...incoming.series] };
};

// =========================================================
// WHICH FILE IS THIS?
// =========================================================

const DETAIL = {
  trade: (d) =>
    `${d.rows.length} commodities, ${d.years[0]}–${d.years[d.years.length - 1]}`,

  cargoBreakdown: (d) => {
    const years = [...new Set(d.rows.map((row) => row.year))].sort();

    return `${d.rows.length} rows, ${years[0]}–${years[years.length - 1]}`;
  },

  cargoTotal: (d) => {
    const years = d.rows.map((row) => row.year).sort();

    return `${d.rows.length} years, ${years[0]}–${years[years.length - 1]}`;
  },

  containerMonthly: (d) =>
    `${d.rows.length} months, ${monthLabel(d.rows[0].month)} – ${monthLabel(
      d.rows[d.rows.length - 1].month
    )}`,

  seaCargo: (d) =>
    `${d.series.length} series, ${d.years[0]}–${d.years[d.years.length - 1]}`,

  cargoMonthly: (d) =>
    `${d.rows.length} months, ${monthLabel(d.rows[0].month)} – ${monthLabel(
      d.rows[d.rows.length - 1].month
    )}`,

  cargoMonthlyBreakdown: (d) => {
    const months = [...new Set(d.rows.map((row) => row.month))].sort();
    const types = new Set(d.rows.map((row) => row.secondary)).size;
    return `${months.length} months × ${types} cargo types, ${monthLabel(months[0])} – ${monthLabel(
      months[months.length - 1]
    )}`;
  },

  otherSeries: (d) =>
    `${d.series.length} series (${d.series
      .slice(0, 3)
      .map((item) => `${item.name}, ${item.rows.length} ${item.frequency === "monthly" ? "months" : "years"}`)
      .join("; ")}${d.series.length > 3 ? "; ..." : ""})`,
};

export const datasetDetail = (key, data) =>
  data ? DETAIL[key](data) : "";

/* Works out which dataset the text is and reads it.
   Returns { kind, data, detail } or { error } in plain language. */
export const readCsv = (text, fileName = "") => {
  const table = parseCsv(text);

  if (table.length < 2) {
    return { error: "The file has no data rows." };
  }

  const headers = table[0].map(cleanHeader);

  const has = (...names) => names.every((name) => headers.includes(name));

  let kind = null;
  let result = null;

  if (
    has("year", "cargo type primary", "cargo type secondary", "cargo throughput")
  ) {
    kind = "cargoBreakdown";
    result = readCargoBreakdown(table, headers);
  } else if (has("year", "cargo throughput")) {
    kind = "cargoTotal";
    result = readCargoTotal(table, headers);
  } else if (has("month", "container throughput")) {
    kind = "containerMonthly";
    result = readContainerMonthly(table, headers);
  } else if (
    has("month", "cargo type primary", "cargo type secondary", "cargo throughput")
  ) {
    kind = "cargoMonthlyBreakdown";
    result = readCargoMonthlyBreakdown(table, headers);
  } else if (has("month", "cargo throughput")) {
    kind = "cargoMonthly";
    result = readCargoMonthly(table, headers);
  } else if (headers[0] === "dataseries" && isSeaCargoTable(table)) {
    kind = "seaCargo";
    result = readSeaCargo(table);
  } else {
    const trade = readTradeTable(table);

    if (trade) {
      kind = "trade";
      result = trade;
    } else {
      const other = readOtherSeries(table, fileName);

      if (other) {
        kind = "otherSeries";
        result = other;
      }
    }
  }

  if (!kind) {
    return {
      error: `This file could not be read as Singapore port or cargo data: it needs a month or year column and number columns. Its columns are: ${table[0]
        .slice(0, 6)
        .map((cell) => String(cell).trim())
        .join(", ")}${table[0].length > 6 ? ", ..." : ""}.`,
    };
  }

  if (result.error) {
    return { error: result.error };
  }

  return { kind, data: result.data, detail: datasetDetail(kind, result.data) };
};

// =========================================================
// KEEPING THE DATA IN THIS BROWSER
// =========================================================

export const STORAGE_KEY = "smartport.portData.v2";

// Keys used by earlier versions of this page.
const OLD_KEYS = ["smartport.cargoCsvRecords.v1", "smartport.tradeCsv.v1"];

const isNumberMap = (value) =>
  value &&
  typeof value === "object" &&
  Object.values(value).every(
    (item) => item === null || Number.isFinite(Number(item))
  );

// Checks one stored dataset, so damaged storage can never break the page.
const VALID = {
  trade: (d) =>
    Array.isArray(d.years) &&
    d.years.length > 0 &&
    d.years.every((year) => Number.isFinite(Number(year))) &&
    Array.isArray(d.rows) &&
    d.rows.length > 0 &&
    d.rows.every(
      (row) =>
        row &&
        typeof row.name === "string" &&
        typeof row.code === "string" &&
        isNumberMap(row.imp) &&
        isNumberMap(row.exp)
    ) &&
    (d.total === null ||
      (d.total && isNumberMap(d.total.imp) && isNumberMap(d.total.exp))),

  cargoBreakdown: (d) =>
    Array.isArray(d.rows) &&
    d.rows.length > 0 &&
    d.rows.every(
      (row) =>
        row &&
        typeof row.year === "string" &&
        typeof row.primary === "string" &&
        typeof row.secondary === "string" &&
        Number.isFinite(row.value)
    ),

  cargoTotal: (d) =>
    Array.isArray(d.rows) &&
    d.rows.length > 0 &&
    d.rows.every(
      (row) =>
        row && typeof row.year === "string" && Number.isFinite(row.value)
    ),

  containerMonthly: (d) =>
    Array.isArray(d.rows) &&
    d.rows.length > 0 &&
    d.rows.every(
      (row) =>
        row && typeof row.month === "string" && Number.isFinite(row.value)
    ),

  cargoMonthly: (d) =>
    Array.isArray(d.rows) &&
    d.rows.length > 0 &&
    d.rows.every(
      (row) => row && typeof row.month === "string" && Number.isFinite(row.value)
    ),

  cargoMonthlyBreakdown: (d) =>
    Array.isArray(d.rows) &&
    d.rows.length > 0 &&
    d.rows.every(
      (row) =>
        row &&
        typeof row.month === "string" &&
        typeof row.primary === "string" &&
        typeof row.secondary === "string" &&
        Number.isFinite(row.value)
    ),

  otherSeries: (d) =>
    Array.isArray(d.series) &&
    d.series.length > 0 &&
    d.series.every(
      (item) =>
        item &&
        typeof item.key === "string" &&
        typeof item.name === "string" &&
        (item.frequency === "monthly" || item.frequency === "yearly") &&
        Array.isArray(item.rows) &&
        item.rows.every((row) => row && typeof row.period === "string" && Number.isFinite(row.value))
    ),

  seaCargo: (d) =>
    Array.isArray(d.years) &&
    d.years.length > 0 &&
    Array.isArray(d.series) &&
    d.series.length > 0 &&
    d.series.every(
      (item) =>
        item &&
        typeof item.role === "string" &&
        typeof item.label === "string" &&
        isNumberMap(item.values)
    ),
};

export const loadStored = () => {
  const data = emptyData();

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");

    if (parsed && typeof parsed === "object") {
      Object.keys(data).forEach((key) => {
        const item = parsed[key];

        if (item && typeof item === "object" && VALID[key](item)) {
          data[key] = item;
        }
      });
    }
  } catch (storageError) {
    // unreadable storage: start empty
  }

  return data;
};

// Returns false when the browser refuses to store it.
export const saveStored = (data) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    return true;
  } catch (storageError) {
    return false;
  }
};

export const clearStored = () => {
  [STORAGE_KEY, ...OLD_KEYS].forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (storageError) {
      // nothing to remove
    }
  });
};

// =========================================================
// FIGURES SHARED BY BOTH TABS
// =========================================================

/* Total cargo per year in thousand tonnes, as a Map year -> value.
   The MPA yearly total is used when it is loaded, otherwise the sum of
   the MPA breakdown. */
export const yearlyTotals = (data) => {
  const totals = new Map();

  // Full years of the monthly cargo files (used only when no yearly file has the year).
  const monthly = data.cargoMonthly
    ? data.cargoMonthly.rows
    : data.cargoMonthlyBreakdown
    ? data.cargoMonthlyBreakdown.rows
    : [];
  const sums = new Map();
  const months = new Map();
  monthly.forEach((row) => {
    const year = row.month.slice(0, 4);
    sums.set(year, (sums.get(year) || 0) + row.value);
    if (!months.has(year)) months.set(year, new Set());
    months.get(year).add(row.month);
  });
  sums.forEach((value, year) => {
    if (months.get(year).size === 12) totals.set(year, value);
  });

  if (data.cargoBreakdown) {
    data.cargoBreakdown.rows.forEach((row) => {
      totals.set(row.year, (totals.get(row.year) || 0) + row.value);
    });
  }

  if (data.cargoTotal) {
    data.cargoTotal.rows.forEach((row) => {
      totals.set(row.year, row.value);
    });
  }

  return totals;
};

/* Latest year of the MPA cargo figures, split by cargo type.
   Returns null until an MPA cargo file is imported. */
export const cargoSummary = (data) => {
  const totals = yearlyTotals(data);

  const rows = data.cargoBreakdown ? data.cargoBreakdown.rows : [];

  const years = [...new Set([...totals.keys(), ...rows.map((row) => row.year)])].sort();

  if (years.length === 0) {
    return null;
  }

  const year = years[years.length - 1];
  const ofYear = rows.filter((row) => row.year === year);

  const sum = (list) => list.reduce((all, row) => all + row.value, 0);

  const total = totals.has(year) ? totals.get(year) : sum(ofYear);

  const types = ofYear
    .map((row) => ({
      name: row.secondary,
      value: row.value,
      share: total > 0 ? (row.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const containerised = types.find((type) => type.name === "Containerised");

  return {
    year,
    total,
    hasTypes: ofYear.length > 0,
    general: sum(ofYear.filter((row) => row.primary === "General Cargo")),
    bulk: sum(ofYear.filter((row) => row.primary === "Bulk Cargo")),
    types,
    containerisedShare: containerised ? containerised.share : null,
  };
};

// =========================================================
// CHECKS BETWEEN THE FILES
//
// Each check only appears when the files it compares are imported.
// scope says which tab shows it.
// =========================================================

const f1 = (value) =>
  Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export const dataChecks = (data) => {
  const checks = [];

  // Trade: the commodity rows against the official all-commodities row.
  if (data.trade && data.trade.total) {
    let worst = 0;
    let worstYear = null;
    let worstKind = "";

    data.trade.years.forEach((year) => {
      ["imp", "exp"].forEach((kind) => {
        const official = data.trade.total[kind][year];

        if (official === null || official === undefined) {
          return;
        }

        const added = data.trade.rows.reduce(
          (all, row) =>
            row[kind][year] === null || row[kind][year] === undefined
              ? all
              : all + row[kind][year],
          0
        );

        const gap = Math.abs(official - added);

        if (gap > worst) {
          worst = gap;
          worstYear = year;
          worstKind = kind === "imp" ? "imports" : "exports";
        }
      });
    });

    checks.push({
      scope: "trade",
      ok: worst <= 2,
      text:
        worst <= 2
          ? `The ${data.trade.rows.length} commodity rows add up to the official import and export totals in every year (largest gap US$ ${f1(
              worst
            )} million, rounding).`
          : `The commodity rows do not add up to the official totals: ${worstYear} ${worstKind} differ by US$ ${f1(
              worst
            )} million.`,
    });
  }

  // MPA: cargo types against the yearly total.
  if (data.cargoBreakdown && data.cargoTotal) {
    const sums = new Map();

    data.cargoBreakdown.rows.forEach((row) => {
      sums.set(row.year, (sums.get(row.year) || 0) + row.value);
    });

    let worst = 0;
    let compared = 0;

    data.cargoTotal.rows.forEach((row) => {
      if (sums.has(row.year)) {
        compared += 1;
        worst = Math.max(worst, Math.abs(sums.get(row.year) - row.value));
      }
    });

    if (compared > 0) {
      checks.push({
        scope: "throughput",
        ok: worst <= 1,
        text:
          worst <= 1
            ? `Cargo by type adds up to the yearly total in all ${compared} years (largest gap ${f1(
                worst
              )} thousand tonnes, rounding).`
            : `Cargo by type and the yearly total differ by up to ${f1(
                worst
              )} thousand tonnes.`,
      });
    }
  }

  // MPA total against the Sea Cargo statistics.
  const seaTotal = seaSeries(data.seaCargo, "total");
  const mpaTotals = yearlyTotals(data);

  if (seaTotal && mpaTotals.size > 0) {
    const different = [];
    let compared = 0;

    data.seaCargo.years.forEach((year) => {
      const sea = seaTotal.values[year];

      if (sea !== null && sea !== undefined && mpaTotals.has(year)) {
        compared += 1;

        if (Math.abs(sea - mpaTotals.get(year)) > 0.5) {
          different.push({ year, sea, mpa: mpaTotals.get(year) });
        }
      }
    });

    if (compared > 0) {
      checks.push({
        scope: "throughput",
        ok: different.length === 0,
        text:
          different.length === 0
            ? `Total cargo is the same in the MPA files and the Sea Cargo statistics in all ${compared} years they share.`
            : `Total cargo is the same in the MPA files and the Sea Cargo statistics in ${
                compared - different.length
              } of ${compared} shared years. ${different
                .map(
                  (item) =>
                    `${item.year}: ${f1(item.mpa)} (MPA) against ${f1(
                      item.sea
                    )} (Sea Cargo) thousand tonnes`
                )
                .join("; ")}. The two files are published separately, so the cargo cards use the MPA figure and the shipping charts use the Sea Cargo figure.`,
      });
    }
  }

  // Monthly containers against the yearly container figure.
  const seaContainers = seaSeries(data.seaCargo, "containers");

  if (seaContainers && data.containerMonthly) {
    const sums = new Map();
    const counts = new Map();

    data.containerMonthly.rows.forEach((row) => {
      const year = row.month.slice(0, 4);

      sums.set(year, (sums.get(year) || 0) + row.value);
      counts.set(year, (counts.get(year) || 0) + 1);
    });

    let compared = 0;
    let worst = 0;

    data.seaCargo.years.forEach((year) => {
      const yearly = seaContainers.values[year];

      if (yearly !== null && yearly !== undefined && counts.get(year) === 12) {
        compared += 1;
        worst = Math.max(worst, Math.abs(yearly - sums.get(year)));
      }
    });

    if (compared > 0) {
      checks.push({
        scope: "throughput",
        ok: worst <= 1,
        text:
          worst <= 1
            ? `The 12 monthly container figures add up to the yearly container throughput in all ${compared} full years (largest gap ${f1(
                worst
              )} thousand TEU, rounding).`
            : `Monthly containers and the yearly container throughput differ by up to ${f1(
                worst
              )} thousand TEU.`,
      });
    }
  }

  return checks;
};

// =========================================================
// SERIES FOR THE PREDICT CARGO THROUGHPUT TAB
//
// Every imported figure that can be forecast, as
// { key, name, unit, frequency, source, points: [{ period, value }] }.
// Monthly figures are used when they are imported, otherwise yearly.
// =========================================================

export const predictionSeries = (data) => {
  const list = [];
  const add = (key, name, unit, frequency, source, points) => {
    const clean = points
      .filter((point) => point && Number.isFinite(Number(point.value)))
      .map((point) => ({ period: String(point.period), value: Number(point.value) }))
      .sort((a, b) => (a.period < b.period ? -1 : 1));
    if (clean.length > 0) list.push({ key, name, unit, frequency, source, points: clean });
  };

  const sumBy = (rows, periodOf, groupOf) => {
    const groups = new Map();
    rows.forEach((row) => {
      const group = groupOf(row);
      if (!groups.has(group)) groups.set(group, new Map());
      const values = groups.get(group);
      const period = periodOf(row);
      values.set(period, (values.get(period) || 0) + row.value);
    });
    return groups;
  };

  // Containers
  if (data.containerMonthly) {
    add("containers_monthly", "Container throughput", "thousand TEU", "monthly",
      data.containerMonthly.fileName || "Container Throughput Monthly",
      data.containerMonthly.rows.map((row) => ({ period: row.month, value: row.value })));
  } else {
    const yearly = seaSeries(data.seaCargo, "containers");
    if (yearly) {
      add("containers_yearly", "Container throughput (yearly)", "thousand TEU", "yearly",
        data.seaCargo.fileName || "Sea Cargo and Shipping Statistics",
        Object.entries(yearly.values).map(([period, value]) => ({ period, value })));
    }
  }

  // Total cargo
  if (data.cargoMonthly || data.cargoMonthlyBreakdown) {
    const rows = data.cargoMonthly
      ? data.cargoMonthly.rows
      : [...sumBy(data.cargoMonthlyBreakdown.rows, (row) => row.month, () => "all").get("all")].map(
          ([month, value]) => ({ month, value })
        );
    add("cargo_monthly", "Total cargo throughput", "thousand tonnes", "monthly",
      (data.cargoMonthly || data.cargoMonthlyBreakdown).fileName || "Cargo Throughput Monthly",
      rows.map((row) => ({ period: row.month, value: row.value })));
  } else {
    const totals = yearlyTotals(data);
    const seaTotal = seaSeries(data.seaCargo, "total");
    if (totals.size > 0) {
      add("cargo_yearly", "Total cargo throughput (yearly)", "thousand tonnes", "yearly",
        (data.cargoTotal || data.cargoBreakdown || {}).fileName || "Cargo Throughput Annual",
        [...totals.entries()].map(([period, value]) => ({ period, value })));
    } else if (seaTotal) {
      add("cargo_yearly", "Total cargo throughput (yearly)", "thousand tonnes", "yearly",
        data.seaCargo.fileName || "Sea Cargo and Shipping Statistics",
        Object.entries(seaTotal.values).map(([period, value]) => ({ period, value })));
    }
  }

  // Cargo by type
  if (data.cargoMonthlyBreakdown) {
    sumBy(data.cargoMonthlyBreakdown.rows, (row) => row.month, (row) => row.secondary).forEach((values, type) =>
      add(`cargo_type_monthly_${slug(type)}`, `${type} cargo`, "thousand tonnes", "monthly",
        data.cargoMonthlyBreakdown.fileName || "Cargo Throughput Monthly (by type)",
        [...values.entries()].map(([period, value]) => ({ period, value }))));
  } else if (data.cargoBreakdown) {
    sumBy(data.cargoBreakdown.rows, (row) => row.year, (row) => row.secondary).forEach((values, type) =>
      add(`cargo_type_yearly_${slug(type)}`, `${type} cargo (yearly)`, "thousand tonnes", "yearly",
        data.cargoBreakdown.fileName || "Cargo Throughput Breakdown Annual",
        [...values.entries()].map(([period, value]) => ({ period, value }))));
  }

  // Bunker sales (Sea Cargo statistics)
  const bunker = seaSeries(data.seaCargo, "bunker");
  if (bunker) {
    add("bunker_yearly", "Bunker sales (yearly)", "thousand tonnes", "yearly",
      data.seaCargo.fileName || "Sea Cargo and Shipping Statistics",
      Object.entries(bunker.values).map(([period, value]) => ({ period, value })));
  }

  // Any other imported port / cargo figures
  if (data.otherSeries) {
    data.otherSeries.series.forEach((item) =>
      add(`other_${item.key}`, item.name, item.unit || "", item.frequency, item.fileName || "", item.rows));
  }

  return list;
};