/*
=========================================================
CARGO SERIES FOR PREDICT CARGO THROUGHPUT

Reads the CSV figures that the Cargo Operations page keeps in this
browser (localStorage "smartport.portData.v2", written by
Cargo/portData.js) and turns them into the series the backend
forecasts. Kept in this folder so the Delay Prediction page does not
depend on where the Cargo Operations files are saved.
=========================================================
*/

export const STORAGE_KEY = "smartport.portData.v2";

const isObject = (value) => value && typeof value === "object";
const hasRows = (value) => isObject(value) && Array.isArray(value.rows) && value.rows.length > 0;

/* The stored files, or {} when nothing is stored (or storage is unreadable). */
export const loadStored = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!isObject(parsed)) return {};
    const data = {};
    ["cargoBreakdown", "cargoTotal", "containerMonthly", "cargoMonthly", "cargoMonthlyBreakdown"].forEach((key) => {
      if (hasRows(parsed[key])) data[key] = parsed[key];
    });
    if (isObject(parsed.seaCargo) && Array.isArray(parsed.seaCargo.series)) data.seaCargo = parsed.seaCargo;
    if (isObject(parsed.otherSeries) && Array.isArray(parsed.otherSeries.series)) data.otherSeries = parsed.otherSeries;
    return data;
  } catch (error) {
    return {};
  }
};

const slug = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const seaSeries = (sea, role) =>
  sea && Array.isArray(sea.series) ? sea.series.find((item) => item.role === role) : undefined;

/* Total cargo per year (thousand tonnes): full years of the monthly cargo
   file, then the yearly breakdown sum, then the yearly total file. */
const yearlyTotals = (data) => {
  const totals = new Map();

  const monthly = data.cargoMonthly
    ? data.cargoMonthly.rows
    : data.cargoMonthlyBreakdown
    ? data.cargoMonthlyBreakdown.rows
    : [];
  const sums = new Map();
  const months = new Map();
  monthly.forEach((row) => {
    const year = String(row.month).slice(0, 4);
    sums.set(year, (sums.get(year) || 0) + row.value);
    if (!months.has(year)) months.set(year, new Set());
    months.get(year).add(row.month);
  });
  sums.forEach((value, year) => {
    if (months.get(year).size === 12) totals.set(year, value);
  });

  if (data.cargoBreakdown) {
    const fromTypes = new Map();
    data.cargoBreakdown.rows.forEach((row) => {
      fromTypes.set(row.year, (fromTypes.get(row.year) || 0) + row.value);
    });
    fromTypes.forEach((value, year) => totals.set(year, value));
  }

  if (data.cargoTotal) {
    data.cargoTotal.rows.forEach((row) => totals.set(row.year, row.value));
  }

  return totals;
};

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