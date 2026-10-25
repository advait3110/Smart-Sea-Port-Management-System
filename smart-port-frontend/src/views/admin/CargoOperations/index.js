import React from "react";

import {
  MdInventory,
  MdScale,
  MdLocalShipping,
  MdSearch,
  MdRefresh,
  MdTrendingUp,
  MdUploadFile,
  MdCheckCircle,
  MdErrorOutline,
} from "react-icons/md";

// Yearly, monthly and shipping statistics (second tab). The file sits in
// this same folder, next to portData.js.
import CargoThroughput from "./ThroughputTab";

import {
  DATASETS,
  TRADE_DATASET_URL,
  cargoSummary,
  clearStored,
  dataChecks,
  loadStored,
  mergeOtherSeries,
  readCsv,
  saveStored,
  yearlyTotals,
} from "./portData";

/*
=========================================================
CARGO OPERATIONS

Everything on this page comes from real CSV files that you import with
the Import CSV button (several at once):

  Singapore Merchandise Trade by Commodity (HS 2-Digit)  -> imports and exports
  Cargo Throughput Breakdown Annual Data                 -> cargo by type
  Cargo Throughput Total Annual Data                     -> yearly total cargo
  Cargo Throughput Monthly (total, or by type)           -> monthly cargo
  Container Throughput Monthly                           -> containers
  Sea Cargo and Shipping Statistics Annual               -> bunkers, registry
  any other Singapore port / cargo CSV with a month or year column
  (for example Vessel Arrivals)                          -> other figures

Each file is recognised from its column names (see portData.js) and
kept in this browser. The Predict Cargo Throughput tab (Delay
Prediction page) forecasts from the same files. Nothing is made up: a
panel stays empty until its file is imported. Reload removes every
imported file and returns the page to its starting state.
=========================================================
*/

// =========================================================
// NUMBER FORMATTERS
// =========================================================

// MPA figures are published in thousand tonnes.
const formatMillionTonnes = (thousandTonnes) =>
  (Number(thousandTonnes) / 1000).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

// Million US dollars with one decimal.
const formatUsdMillion = (value) =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? "—"
    : Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });

// Bar colour of each MPA cargo type.
const cargoTypeColors = {
  Containerised: "bg-brand-500",
  Conventional: "bg-blue-500",
  Oil: "bg-orange-500",
  "Non-Oil Bulk": "bg-green-500",
};

// =========================================================
// IMPORTS AND EXPORTS BY COMMODITY
// =========================================================

const TRADE_ROWS_SHOWN = 10;

const TradeTable = ({
  title,
  subtitle,
  icon,
  bubbleClass,
  textClass,
  barClass,
  rows,
  count,
  grandTotal,
  maxValue,
  searching,
  expanded,
  onToggle,
}) => {
  const shown = expanded || searching ? rows : rows.slice(0, TRADE_ROWS_SHOWN);

  const headerClass =
    "px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400";

  return (
    <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
      {/* SECTION HEADER */}

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${bubbleClass}`}
          >
            {icon}
          </div>

          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              {title}
            </h2>

            <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
          </div>
        </div>

        <div className="md:text-right">
          <p className={`text-2xl font-bold ${textClass}`}>
            US$ {formatUsdMillion(grandTotal)} M
          </p>

          <p className="mt-1 text-xs text-gray-400">
            {count} {count === 1 ? "commodity" : "commodities"} traded
          </p>
        </div>
      </div>

      {/* TABLE */}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-white/10">
              <th className={headerClass}>Rank</th>

              <th className={headerClass}>HS Code</th>

              <th className={headerClass}>Commodity</th>

              <th className={headerClass}>Value (US$ million)</th>

              <th className={headerClass}>Share</th>
            </tr>
          </thead>

          <tbody>
            {shown.length > 0 ? (
              shown.map((item) => (
                <tr
                  key={`${item.code}-${item.rank}`}
                  className="border-b border-gray-100 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700"
                >
                  <td className="px-4 py-4 text-sm font-bold text-gray-400">
                    {item.rank}
                  </td>

                  <td className="px-4 py-4">
                    <span className="font-bold text-brand-500">
                      {item.code || "—"}
                    </span>
                  </td>

                  <td className="px-4 py-4 text-sm font-bold text-navy-700 dark:text-white">
                    {item.name}
                  </td>

                  <td className="px-4 py-4 text-sm font-bold text-navy-700 dark:text-white">
                    {formatUsdMillion(item.value)}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-lightPrimary dark:bg-navy-700">
                        <div
                          className={`h-full rounded-full ${barClass}`}
                          style={{
                            width: `${
                              maxValue > 0
                                ? Math.min((item.value / maxValue) * 100, 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>

                      <span className="text-xs font-medium text-gray-500 dark:text-gray-300">
                        {grandTotal > 0
                          ? ((item.value / grandTotal) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <div className="flex flex-col items-center">
                    <MdInventory className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />

                    <p className="font-bold text-navy-700 dark:text-white">
                      {searching
                        ? "No matching commodities"
                        : "No figures for this year"}
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      {searching
                        ? "Try a different search term."
                        : "Choose another year above."}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!searching && rows.length > TRADE_ROWS_SHOWN && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onToggle}
            className="text-sm font-bold text-brand-500 underline dark:text-white"
          >
            {expanded
              ? `Show top ${TRADE_ROWS_SHOWN} only`
              : `Show all ${rows.length} commodities`}
          </button>
        </div>
      )}
    </div>
  );
};

// =========================================================
// TRADE SECTION (Singapore merchandise trade, imports and exports)
// =========================================================

const TradeSection = ({
  trade,
  year,
  onYear,
  search,
  onSearch,
  checks,
  expanded,
  onToggle,
}) => {
  const query = search.trim().toLowerCase();

  const totalFor = (kind, forYear) => {
    const fromTotal =
      trade.total && trade.total[kind] ? Number(trade.total[kind][forYear]) : NaN;

    if (Number.isFinite(fromTotal)) {
      return fromTotal;
    }

    return trade.rows.reduce(
      (sum, row) =>
        Number.isFinite(Number(row[kind][forYear]))
          ? sum + Number(row[kind][forYear])
          : sum,
      0
    );
  };

  const rank = (kind) =>
    trade.rows
      .map((row) => ({
        code: row.code,
        name: row.name,
        value: row[kind][year] === null ? NaN : Number(row[kind][year]),
      }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((item, index) => ({ ...item, rank: index + 1 }));

  const matching = (list) =>
    query
      ? list.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.code.toLowerCase().includes(query)
        )
      : list;

  const importList = rank("imp");
  const exportList = rank("exp");

  const importTotal = totalFor("imp", year);
  const exportTotal = totalFor("exp", year);
  const balance = exportTotal - importTotal;

  // Largest yearly value, so the yearly bars share one scale.
  const yearly = trade.years.map((y) => ({
    year: y,
    imp: totalFor("imp", y),
    exp: totalFor("exp", y),
  }));

  const yearlyMax = yearly.reduce(
    (largest, item) => Math.max(largest, item.imp, item.exp),
    0
  );

  const inBillions = (value) => `${(value / 1000).toFixed(1)} B`;

  return (
    <>
      {/* HEADER + YEAR CHOICE */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Singapore Merchandise Trade
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Imports and exports by commodity, {year} (SingStat via
              data.gov.sg). National goods trade measured in US$ million, not
              port cargo tonnage.
            </p>
          </div>

          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Trade year"
          >
            {trade.years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => onYear(y)}
                aria-pressed={y === year}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                  y === year
                    ? "bg-brand-500 text-white"
                    : "bg-lightPrimary text-gray-600 hover:bg-gray-200 dark:bg-navy-900 dark:text-gray-300 dark:hover:bg-navy-700"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="relative">
            <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search commodity..."
              aria-label="Search commodity"
              name="commodity-search"
              autoComplete="off"
              className="h-11 w-full rounded-xl bg-lightPrimary pl-10 pr-3 text-sm text-navy-700 outline-none placeholder:text-gray-400 dark:bg-navy-900 dark:text-white md:w-64"
            />
          </div>

          {checks.length > 0 && (
            <ul className="space-y-2 md:max-w-xl">
              {checks.map((check) => (
                <li
                  key={check.text}
                  className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-300"
                >
                  {check.ok ? (
                    <MdCheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                  ) : (
                    <MdErrorOutline className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-500" />
                  )}

                  <span>{check.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* TOTALS */}

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
          <p className="text-sm font-medium text-gray-400">Total Imports</p>

          <h2 className="mt-2 text-2xl font-bold text-blue-500">
            {formatUsdMillion(importTotal)}

            <span className="ml-1 text-sm font-medium text-gray-400">
              US$ M
            </span>
          </h2>

          <p className="mt-3 text-xs text-gray-400">Goods imported, {year}</p>
        </div>

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
          <p className="text-sm font-medium text-gray-400">Total Exports</p>

          <h2 className="mt-2 text-2xl font-bold text-green-500">
            {formatUsdMillion(exportTotal)}

            <span className="ml-1 text-sm font-medium text-gray-400">
              US$ M
            </span>
          </h2>

          <p className="mt-3 text-xs text-gray-400">Goods exported, {year}</p>
        </div>

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
          <p className="text-sm font-medium text-gray-400">Trade Balance</p>

          <h2
            className={`mt-2 text-2xl font-bold ${
              balance >= 0 ? "text-green-500" : "text-orange-500"
            }`}
          >
            {balance >= 0 ? "+" : "−"}
            {formatUsdMillion(Math.abs(balance))}

            <span className="ml-1 text-sm font-medium text-gray-400">
              US$ M
            </span>
          </h2>

          <p className="mt-3 text-xs text-gray-400">
            {balance >= 0
              ? "Surplus: exports above imports"
              : "Deficit: imports above exports"}
          </p>
        </div>
      </div>

      {/* IMPORTS VS EXPORTS BY YEAR */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
        <h2 className="text-xl font-bold text-navy-700 dark:text-white">
          Imports vs Exports by Year
        </h2>

        <p className="mt-1 text-sm text-gray-400">
          Total merchandise trade, US$ billion. Click a year to open it.
        </p>

        <div className="mt-6 space-y-3">
          {yearly.map((item) => (
            <button
              key={item.year}
              type="button"
              onClick={() => onYear(item.year)}
              className={`grid w-full grid-cols-[3.5rem_1fr] items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                item.year === year
                  ? "bg-lightPrimary dark:bg-navy-900"
                  : "hover:bg-gray-50 dark:hover:bg-navy-700"
              }`}
            >
              <span className="text-sm font-bold text-navy-700 dark:text-white">
                {item.year}
              </span>

              <span className="block space-y-1.5">
                <span className="flex items-center gap-3">
                  <span className="block h-2.5 flex-1 overflow-hidden rounded-full bg-lightPrimary dark:bg-navy-700">
                    <span
                      className="block h-full rounded-full bg-blue-500"
                      style={{
                        width: `${
                          yearlyMax > 0 ? (item.imp / yearlyMax) * 100 : 0
                        }%`,
                      }}
                    />
                  </span>

                  <span className="w-28 text-xs font-medium text-gray-500 dark:text-gray-300">
                    Imports {inBillions(item.imp)}
                  </span>
                </span>

                <span className="flex items-center gap-3">
                  <span className="block h-2.5 flex-1 overflow-hidden rounded-full bg-lightPrimary dark:bg-navy-700">
                    <span
                      className="block h-full rounded-full bg-green-500"
                      style={{
                        width: `${
                          yearlyMax > 0 ? (item.exp / yearlyMax) * 100 : 0
                        }%`,
                      }}
                    />
                  </span>

                  <span className="w-28 text-xs font-medium text-gray-500 dark:text-gray-300">
                    Exports {inBillions(item.exp)}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* IMPORTS BY COMMODITY */}

      <TradeTable
        title="Imports by Commodity"
        subtitle={`Goods brought into Singapore, ${year}`}
        icon={<MdInventory className="h-6 w-6" />}
        bubbleClass="bg-blue-50 text-blue-500 dark:bg-blue-500/10"
        textClass="text-blue-500"
        barClass="bg-blue-500"
        rows={matching(importList)}
        count={importList.length}
        grandTotal={importTotal}
        maxValue={importList.length > 0 ? importList[0].value : 0}
        searching={query !== ""}
        expanded={expanded}
        onToggle={onToggle}
      />

      {/* EXPORTS BY COMMODITY */}

      <TradeTable
        title="Exports by Commodity"
        subtitle={`Goods sent out of Singapore, ${year}`}
        icon={<MdTrendingUp className="h-6 w-6" />}
        bubbleClass="bg-green-50 text-green-500 dark:bg-green-500/10"
        textClass="text-green-500"
        barClass="bg-green-500"
        rows={matching(exportList)}
        count={exportList.length}
        grandTotal={exportTotal}
        maxValue={exportList.length > 0 ? exportList[0].value : 0}
        searching={query !== ""}
        expanded={expanded}
        onToggle={onToggle}
      />
    </>
  );
};

// =========================================================
// CARGO OPERATIONS TAB
// =========================================================

const SummaryCard = ({ label, value, unit, valueClass, note, icon, iconClass }) => (
  <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-400">{label}</p>

        <h2 className={`mt-2 text-2xl font-bold ${valueClass}`}>
          {value}

          <span className="ml-1 text-sm font-medium text-gray-400">{unit}</span>
        </h2>
      </div>

      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full ${iconClass}`}
      >
        {icon}
      </div>
    </div>

    <p className="mt-3 text-xs text-gray-400">{note}</p>
  </div>
);

const OperationsTab = ({ data }) => {
  const [search, setSearch] = React.useState("");
  const [tradeYear, setTradeYear] = React.useState(null);
  const [tradeExpanded, setTradeExpanded] = React.useState(false);

  const trade = data.trade;

  const summary = React.useMemo(() => cargoSummary(data), [data]);

  const tradeChecks = React.useMemo(
    () => dataChecks(data).filter((check) => check.scope === "trade"),
    [data]
  );

  // Year shown in the trade section (latest unless chosen).
  const activeTradeYear = trade
    ? trade.years.includes(tradeYear)
      ? tradeYear
      : trade.years[trade.years.length - 1]
    : null;

  const missing = "Import the MPA cargo throughput files";

  const typed = summary && summary.hasTypes;

  return (
    <div className="mt-3">
      {/* SUMMARY CARDS (latest year of the MPA cargo files) */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Cargo"
          value={summary ? formatMillionTonnes(summary.total) : "—"}
          unit="M tonnes"
          valueClass="text-navy-700 dark:text-white"
          note={summary ? `Port of Singapore, ${summary.year} (MPA)` : missing}
          icon={<MdScale className="h-6 w-6" />}
          iconClass="bg-lightPrimary text-brand-500"
        />

        <SummaryCard
          label="General Cargo"
          value={typed ? formatMillionTonnes(summary.general) : "—"}
          unit="M tonnes"
          valueClass="text-blue-500"
          note="Containerised and conventional cargo"
          icon={<MdInventory className="h-6 w-6" />}
          iconClass="bg-blue-50 text-blue-500 dark:bg-blue-500/10"
        />

        <SummaryCard
          label="Bulk Cargo"
          value={typed ? formatMillionTonnes(summary.bulk) : "—"}
          unit="M tonnes"
          valueClass="text-orange-500"
          note="Oil and non-oil bulk cargo"
          icon={<MdLocalShipping className="h-6 w-6" />}
          iconClass="bg-orange-50 text-orange-500 dark:bg-orange-500/10"
        />

        <SummaryCard
          label="Containerised Share"
          value={
            typed && summary.containerisedShare !== null
              ? summary.containerisedShare.toFixed(1)
              : "—"
          }
          unit="%"
          valueClass="text-green-500"
          note={summary ? `Share of all ${summary.year} cargo` : "Share of all cargo"}
          icon={<MdTrendingUp className="h-6 w-6" />}
          iconClass="bg-green-50 text-green-500 dark:bg-green-500/10"
        />
      </div>

      {/* CARGO DISTRIBUTION */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Cargo Distribution
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              {typed ? `Cargo by type, ${summary.year} (MPA)` : "Cargo by type (MPA)"}
            </p>
          </div>

          <MdInventory className="h-8 w-8 text-brand-500" />
        </div>

        {typed ? (
          <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
            {summary.types.map((type) => (
              <div key={type.name}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-300">
                    {type.name}
                  </span>

                  <span className="text-sm font-bold text-navy-700 dark:text-white">
                    {formatMillionTonnes(type.value)} M tonnes
                    <span className="ml-2 font-medium text-gray-400">
                      {type.share.toFixed(1)}%
                    </span>
                  </span>
                </div>

                <div className="h-4 overflow-hidden rounded-full bg-lightPrimary dark:bg-navy-700">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      cargoTypeColors[type.name] || "bg-gray-400"
                    }`}
                    style={{ width: `${Math.min(type.share, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-8 text-sm text-gray-400">
            Import the Cargo Throughput Breakdown Annual Data file to see the
            cargo by type.
          </p>
        )}
      </div>

      {/* SINGAPORE MERCHANDISE TRADE: IMPORTS AND EXPORTS */}

      {trade ? (
        <TradeSection
          trade={trade}
          year={activeTradeYear}
          onYear={setTradeYear}
          search={search}
          onSearch={setSearch}
          checks={tradeChecks}
          expanded={tradeExpanded}
          onToggle={() => setTradeExpanded((value) => !value)}
        />
      ) : (
        <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500">
              <MdTrendingUp className="h-6 w-6" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                Imports and Exports
              </h2>

              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-300">
                Real import and export figures by commodity. Import the CSV{" "}
                <span className="font-bold">
                  Singapore Merchandise Trade by Commodity (HS 2-Digit)
                </span>{" "}
                from{" "}
                <a
                  href={TRADE_DATASET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-brand-500 underline"
                >
                  data.gov.sg
                </a>
                . Imports and exports are then listed separately here.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================
// CARGO OPERATIONS
//
// One module, two tabs:
//   1. Cargo Operations: cargo by type, imports and exports.
//   2. Cargo Throughput: yearly, monthly and shipping statistics.
//
// The Import CSV button is shared: it reads any of the five files, so a
// file can never be imported into the "wrong" tab.
// =========================================================

const TABS = [
  {
    key: "operations",
    label: "Cargo Operations",
    icon: <MdInventory className="h-5 w-5" />,
  },
  {
    key: "throughput",
    label: "Cargo Throughput",
    icon: <MdTrendingUp className="h-5 w-5" />,
  },
];

// The tab that shows what was just imported (null: stay where you are).
const tabFor = (kinds) => {
  const operations = kinds.includes("trade");

  const throughput = kinds.some((kind) =>
    ["containerMonthly", "seaCargo", "cargoMonthly", "cargoMonthlyBreakdown", "otherSeries"].includes(kind)
  );

  if (operations && !throughput) return "operations";
  if (throughput && !operations) return "throughput";

  return null;
};

const CargoOperations = () => {
  const [activeTab, setActiveTab] = React.useState("operations");
  const [data, setData] = React.useState(loadStored);
  const [results, setResults] = React.useState([]);
  const [importing, setImporting] = React.useState(false);
  const [reloading, setReloading] = React.useState(false);

  const inputRef = React.useRef(null);

  const anyLoaded = DATASETS.some((item) => data[item.key]);

  // Reads every chosen file, whatever it is, and reports each one.
  const handleFilesChosen = async (event) => {
    const files = Array.from(event.target.files || []);

    event.target.value = "";

    if (files.length === 0) return;

    setImporting(true);

    const next = { ...data };
    const lines = [];
    const kinds = [];

    for (const file of files) {
      try {
        const parsed = readCsv(await file.text(), file.name);

        if (parsed.error) {
          lines.push({ ok: false, name: file.name, text: parsed.error });
        } else {
          next[parsed.kind] =
            parsed.kind === "otherSeries"
              ? mergeOtherSeries(next.otherSeries, parsed.data)
              : { ...parsed.data, fileName: file.name };
          kinds.push(parsed.kind);

          const dataset = DATASETS.find((item) => item.key === parsed.kind);

          lines.push({
            ok: true,
            name: file.name,
            text: `${dataset.label}: ${parsed.detail}.`,
          });
        }
      } catch (readError) {
        console.error("Unable to read the CSV file:", readError);

        lines.push({
          ok: false,
          name: file.name,
          text: "The file could not be read.",
        });
      }
    }

    if (kinds.length > 0) {
      const saved = saveStored(next);

      setData(next);

      if (!saved) {
        lines.push({
          ok: false,
          name: "This browser",
          text: "It could not save the imported data, so it stays only until you leave this page.",
        });
      }

      const target = tabFor(kinds);

      if (target) {
        setActiveTab(target);
      }
    }

    setResults(lines);
    setImporting(false);
  };

  // Removes every imported file and reloads the page, so it looks like it
  // did before anything was imported.
  const handleReload = () => {
    setReloading(true);

    clearStored();

    window.location.reload();
  };

  return (
    <div>
      {/* PAGE HEADER: Reload and Import CSV, shared by both tabs */}

      <div className="mb-6 mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
            <MdInventory className="h-8 w-8" />
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-300">
            Cargo, container and trade statistics of the Port of Singapore,
            from real published datasets (MPA and SingStat on data.gov.sg).
            Choose Import CSV and select your files, several at once; any
            Singapore port or cargo CSV with a month or year column works.
          </p>
        </div>

        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={handleReload}
            disabled={reloading}
            className="flex items-center justify-center gap-2 rounded-xl bg-lightPrimary px-5 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
            title="Remove the imported CSV files and reload the page"
          >
            <MdRefresh
              className={`h-5 w-5 ${reloading ? "animate-spin" : ""}`}
            />
            Reload
          </button>

          <button
            type="button"
            onClick={() => inputRef.current && inputRef.current.click()}
            disabled={importing}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MdUploadFile className="h-5 w-5" />
            {importing ? "Importing..." : "Import CSV"}
          </button>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".csv,text/csv"
            onChange={handleFilesChosen}
            className="hidden"
          />
        </div>
      </div>

      {/* RESULT OF THE LAST IMPORT, ONE LINE PER FILE */}

      {results.length > 0 && (
        <ul className="mb-6 divide-y divide-gray-100 overflow-hidden rounded-[20px] bg-white shadow-sm dark:divide-white/5 dark:bg-navy-800">
          {results.map((line, index) => (
            <li
              key={`${line.name}-${index}`}
              role={line.ok ? "status" : "alert"}
              className={`flex items-start gap-3 break-words px-5 py-3 text-sm ${
                line.ok
                  ? "text-gray-600 dark:text-gray-300"
                  : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
              }`}
            >
              {line.ok ? (
                <MdCheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
              ) : (
                <MdErrorOutline className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
              )}

              <span className="min-w-0">
                <span className="font-bold">{line.name}</span>
                {": "}
                {line.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div
        className="mb-6 inline-flex flex-wrap gap-1 rounded-2xl bg-white p-1.5 shadow-sm dark:bg-navy-800"
        role="tablist"
        aria-label="Cargo sections"
      >
        {TABS.map((tab) => {
          const selected = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`cargo-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls="cargo-tab-panel"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                selected
                  ? "bg-brand-500 text-white"
                  : "text-gray-600 hover:bg-lightPrimary dark:text-gray-300 dark:hover:bg-navy-700"
              }`}
            >
              {tab.icon}

              {tab.label}
            </button>
          );
        })}
      </div>

      {!anyLoaded && results.length === 0 && (
        <p className="mb-6 text-xs text-gray-400">
          Nothing is imported yet, so the panels below are empty. Reload
          removes every imported file and returns the page to this state.
        </p>
      )}

      <div
        id="cargo-tab-panel"
        role="tabpanel"
        aria-labelledby={`cargo-tab-${activeTab}`}
      >
        {activeTab === "operations" ? (
          <OperationsTab data={data} />
        ) : (
          <CargoThroughput
            data={data}
            helpers={{ dataChecks, yearlyTotals }}
          />
        )}
      </div>
    </div>
  );
};

export default CargoOperations;