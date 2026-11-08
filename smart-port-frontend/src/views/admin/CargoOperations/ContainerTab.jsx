import React from "react";

import {
  MdDirectionsBoat,
  MdDownload,
  MdEmojiEvents,
  MdCalendarMonth,
  MdOpenInNew,
} from "react-icons/md";

import {
  MonthlyContainerChart,
  TrendChart,
  KpiCard,
  ChartCard,
  formatNumber,
  formatMillions,
  formatPercent,
  changePercent,
  monthLabel,
} from "./ThroughputTab";

/*
=========================================================
CONTAINER THROUGHPUT (third tab of Cargo Operations)

Container throughput = how many containers the Port of Singapore
handles, counted in TEU (twenty-foot equivalent units: one 20-foot
container = 1 TEU, one 40-foot container = 2 TEU).

It is NOT the same as cargo throughput: cargo throughput is the
weight (tonnes) of ALL goods, oil and bulk included; containers are
one part of it.

The figures come from the MPA file "Container Throughput, Monthly"
(data.gov.sg), imported with the Import CSV button at the top of the
page. MPA publishes them in thousand TEU. Nothing is made up: the
tab stays empty until that file is imported.

Download CSV saves the imported figures together with the worked-out
columns (TEU, change against the same month last year, yearly
totals), ready for Excel or the report.
=========================================================
*/

export const CONTAINER_DATASET_URL =
  "https://data.gov.sg/datasets/d_da030f7028200d19ffcbe4a2d71af39c/view";

const RANGES = [
  { label: "2 years", value: 2 },
  { label: "5 years", value: 5 },
  { label: "10 years", value: 10 },
  { label: "All", value: 0 },
];

const MONTH_SHORT = [
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

// "2024-05" -> "2023-05"
const sameMonthLastYear = (month) =>
  `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;

// =========================================================
// CSV DOWNLOAD
// =========================================================

const csvCell = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadCsv = (fileName, header, rows) => {
  const text = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  // The BOM lets Excel read the file correctly.
  const blob = new Blob(["﻿" + text], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const round = (value, digits) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? ""
    : Number(value.toFixed(digits));

// =========================================================
// THE FIGURES
// =========================================================

const workOut = (rows) => {
  const valueByMonth = new Map(rows.map((row) => [row.month, row.value]));

  const months = [...valueByMonth.keys()].sort();

  // One entry per year: total, months present, busiest month.
  const byYear = new Map();

  months.forEach((month) => {
    const year = month.slice(0, 4);

    const value = valueByMonth.get(month);

    const entry = byYear.get(year) || {
      year,
      total: 0,
      count: 0,
      firstMonth: month,
      lastMonth: month,
      busiest: null,
    };

    entry.total += value;
    entry.count += 1;
    entry.lastMonth = month;

    if (!entry.busiest || value > entry.busiest.value) {
      entry.busiest = { month, value };
    }

    byYear.set(year, entry);
  });

  const years = [...byYear.values()].sort((a, b) =>
    a.year < b.year ? -1 : 1
  );

  const fullYears = years.filter((entry) => entry.count === 12);

  // Change of each full year against the full year before it.
  const fullTotal = new Map(fullYears.map((entry) => [entry.year, entry.total]));

  years.forEach((entry) => {
    const previous = fullTotal.get(String(Number(entry.year) - 1));

    entry.change =
      entry.count === 12 && previous !== undefined
        ? changePercent(entry.total, previous)
        : null;
  });

  const latestMonth = months[months.length - 1] || null;

  const latestValue = latestMonth ? valueByMonth.get(latestMonth) : null;

  const latestLastYear = latestMonth
    ? valueByMonth.get(sameMonthLastYear(latestMonth))
    : undefined;

  // Year to date: this year's months against the same months last year
  // (only when every one of those months is there).
  let ytd = null;

  if (latestMonth) {
    const year = latestMonth.slice(0, 4);

    const thisYear = months.filter((month) => month.startsWith(`${year}-`));

    const lastYear = thisYear.map(sameMonthLastYear);

    const total = thisYear.reduce(
      (sum, month) => sum + valueByMonth.get(month),
      0
    );

    const complete = lastYear.every((month) => valueByMonth.has(month));

    const previous = complete
      ? lastYear.reduce((sum, month) => sum + valueByMonth.get(month), 0)
      : null;

    ytd = {
      year,
      total,
      count: thisYear.length,
      first: thisYear[0],
      last: thisYear[thisYear.length - 1],
      change: previous === null ? null : changePercent(total, previous),
    };
  }

  const lastFull = fullYears[fullYears.length - 1] || null;

  let record = null;

  months.forEach((month) => {
    const value = valueByMonth.get(month);

    if (!record || value > record.value) {
      record = { month, value };
    }
  });

  return {
    valueByMonth,
    months,
    years,
    fullYears,
    latestMonth,
    latestValue,
    latestChange:
      latestLastYear === undefined
        ? null
        : changePercent(latestValue, latestLastYear),
    ytd,
    lastFull,
    record,
  };
};

// =========================================================
// EMPTY TAB
// =========================================================

const EmptyContainers = () => (
  <div
    data-testid="container-empty"
    className="rounded-[20px] bg-white p-8 text-center shadow-sm dark:bg-navy-800"
  >
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
      <MdDirectionsBoat className="h-8 w-8" />
    </div>

    <h2 className="mt-4 text-xl font-bold text-navy-700 dark:text-white">
      No container figures imported yet
    </h2>

    <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-300">
      Download the MPA file <b>Container Throughput, Monthly</b> from
      data.gov.sg (monthly figures since 1995, in thousand TEU), then
      choose <b>Import CSV</b> at the top of this page and select it.
    </p>

    <a
      href={CONTAINER_DATASET_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600"
    >
      <MdOpenInNew className="h-5 w-5" />
      Open the dataset on data.gov.sg
    </a>
  </div>
);

// =========================================================
// THE TAB
// =========================================================

const ContainerThroughput = ({ data }) => {
  const rows = React.useMemo(
    () => (data.containerMonthly ? data.containerMonthly.rows : []),
    [data.containerMonthly]
  );

  const figures = React.useMemo(() => workOut(rows), [rows]);

  const [rangeYears, setRangeYears] = React.useState(5);

  if (figures.months.length === 0) {
    return <EmptyContainers />;
  }

  const {
    valueByMonth,
    months,
    years,
    fullYears,
    latestMonth,
    latestValue,
    latestChange,
    ytd,
    lastFull,
    record,
  } = figures;

  const shownMonths =
    rangeYears === 0 ? months : months.slice(-rangeYears * 12);

  const fileName =
    (data.containerMonthly && data.containerMonthly.fileName) ||
    "Container Throughput Monthly";

  // -------------------------------------------------------
  // DOWNLOADS
  // -------------------------------------------------------

  const downloadMonthly = () =>
    downloadCsv(
      "container_throughput_monthly.csv",
      [
        "month",
        "container_throughput_thousand_teu",
        "container_throughput_teu",
        "change_vs_same_month_last_year_percent",
      ],
      months.map((month) => {
        const value = valueByMonth.get(month);

        const before = valueByMonth.get(sameMonthLastYear(month));

        return [
          month,
          round(value, 1),
          Math.round(value * 1000),
          before === undefined ? "" : round(changePercent(value, before), 2),
        ];
      })
    );

  const downloadYearly = () =>
    downloadCsv(
      "container_throughput_yearly.csv",
      [
        "year",
        "months_included",
        "container_throughput_thousand_teu",
        "container_throughput_teu",
        "change_vs_previous_year_percent",
        "busiest_month",
        "busiest_month_thousand_teu",
      ],
      years.map((entry) => [
        entry.year,
        entry.count,
        round(entry.total, 1),
        Math.round(entry.total * 1000),
        entry.change === null ? "" : round(entry.change, 2),
        entry.busiest.month,
        round(entry.busiest.value, 1),
      ])
    );

  const ytdLabel =
    ytd && ytd.count < 12
      ? `${MONTH_SHORT[Number(ytd.first.slice(5)) - 1]} – ${
          MONTH_SHORT[Number(ytd.last.slice(5)) - 1]
        } ${ytd.year}`
      : ytd
      ? ytd.year
      : "";

  return (
    <div data-testid="container-tab">
      {/* WHAT THIS TAB IS */}

      <div className="mb-5 flex flex-col justify-between gap-4 rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800 md:flex-row md:items-center">
        <p className="text-sm text-gray-500 dark:text-gray-300">
          <b className="text-navy-700 dark:text-white">Container throughput</b>{" "}
          is the number of containers the port handles, in TEU (one 20-foot
          container = 1 TEU). It is one part of cargo throughput, which is
          the weight of all goods in tonnes. Source: MPA,{" "}
          <a
            href={CONTAINER_DATASET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-500 underline"
          >
            {fileName}
          </a>
          , {monthLabel(months[0])} – {monthLabel(latestMonth)}.
        </p>

        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <button
            type="button"
            data-testid="download-monthly"
            onClick={downloadMonthly}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            <MdDownload className="h-5 w-5" />
            Monthly CSV
          </button>

          <button
            type="button"
            data-testid="download-yearly"
            onClick={downloadYearly}
            className="flex items-center gap-2 rounded-xl bg-lightPrimary px-4 py-2.5 text-sm font-bold text-navy-700 transition hover:bg-gray-200 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
          >
            <MdDownload className="h-5 w-5" />
            Yearly CSV
          </button>
        </div>
      </div>

      {/* KEY FIGURES */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`Containers, ${monthLabel(latestMonth)}`}
          value={formatNumber(latestValue, 0)}
          unit="k TEU"
          change={latestChange !== null ? latestChange : undefined}
          changeNote="vs same month last year"
          icon={<MdDirectionsBoat className="h-6 w-6" />}
        />

        <KpiCard
          label={`Year to date, ${ytdLabel}`}
          value={ytd ? formatMillions(ytd.total) : "—"}
          unit="M TEU"
          change={ytd && ytd.change !== null ? ytd.change : undefined}
          changeNote={
            ytd && ytd.change !== null ? "vs same months last year" : ""
          }
          icon={<MdCalendarMonth className="h-6 w-6" />}
        />

        <KpiCard
          label={lastFull ? `Full year ${lastFull.year}` : "Last full year"}
          value={lastFull ? formatMillions(lastFull.total) : "—"}
          unit="M TEU"
          change={
            lastFull && lastFull.change !== null ? lastFull.change : undefined
          }
          changeNote={
            lastFull && lastFull.change !== null ? "vs the year before" : ""
          }
          icon={<MdDirectionsBoat className="h-6 w-6" />}
        />

        <KpiCard
          label="Busiest month on record"
          value={record ? formatNumber(record.value, 0) : "—"}
          unit="k TEU"
          changeNote={record ? monthLabel(record.month) : ""}
          icon={<MdEmojiEvents className="h-6 w-6" />}
        />
      </div>

      {/* MONTHLY CHART */}

      <div className="mt-5">
        <ChartCard
          title="Monthly container throughput"
          subtitle={`${monthLabel(shownMonths[0])} – ${monthLabel(
            latestMonth
          )}, million TEU per month`}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {RANGES.map((range) => (
              <button
                key={range.label}
                type="button"
                aria-pressed={rangeYears === range.value}
                onClick={() => setRangeYears(range.value)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                  rangeYears === range.value
                    ? "bg-brand-500 text-white"
                    : "bg-lightPrimary text-navy-700 hover:bg-gray-200 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          <MonthlyContainerChart
            months={shownMonths}
            valueByMonth={valueByMonth}
          />
        </ChartCard>
      </div>

      {/* YEARLY CHART */}

      {fullYears.length > 1 && (
        <div className="mt-5">
          <ChartCard
            title="Yearly container throughput"
            subtitle={`Full years ${fullYears[0].year} – ${
              fullYears[fullYears.length - 1].year
            }, sum of the 12 monthly figures, million TEU`}
          >
            <TrendChart
              points={fullYears.map((entry) => ({
                label: entry.year,
                value: entry.total,
              }))}
              divisor={1000}
              unitLabel="million TEU"
              formatValue={(value) => `${formatMillions(value)} million TEU`}
              label="Yearly container throughput"
            />
          </ChartCard>
        </div>
      )}

      {/* YEAR BY YEAR TABLE */}

      <div className="mt-5 overflow-hidden rounded-[20px] bg-white shadow-sm dark:bg-navy-800">
        <div className="p-6 pb-2">
          <h2 className="text-xl font-bold text-navy-700 dark:text-white">
            Year by year
          </h2>

          <p className="mt-1 text-sm text-gray-400">
            Newest first. A year that is not complete yet shows which
            months it includes.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]" data-testid="year-table">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-bold uppercase tracking-wide text-gray-400 dark:border-white/10">
                <th className="px-6 py-3">Year</th>
                <th className="px-6 py-3">Total</th>
                <th className="px-6 py-3">Change</th>
                <th className="px-6 py-3">Monthly average</th>
                <th className="px-6 py-3">Busiest month</th>
              </tr>
            </thead>

            <tbody>
              {[...years].reverse().map((entry) => (
                <tr
                  key={entry.year}
                  className="border-b border-gray-50 text-sm text-navy-700 last:border-0 dark:border-white/5 dark:text-white"
                >
                  <td className="px-6 py-3 font-bold">
                    {entry.year}

                    {entry.count < 12 && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                        {MONTH_SHORT[Number(entry.firstMonth.slice(5)) - 1]} –{" "}
                        {MONTH_SHORT[Number(entry.lastMonth.slice(5)) - 1]}
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-3">
                    {formatMillions(entry.total)} M TEU
                  </td>

                  <td
                    className={`px-6 py-3 font-bold ${
                      entry.change === null
                        ? "text-gray-400"
                        : entry.change >= 0
                        ? "text-green-500"
                        : "text-red-500"
                    }`}
                  >
                    {entry.change === null ? "—" : formatPercent(entry.change)}
                  </td>

                  <td className="px-6 py-3">
                    {formatNumber(entry.total / entry.count, 0)} k TEU
                  </td>

                  <td className="px-6 py-3">
                    {monthLabel(entry.busiest.month)} (
                    {formatNumber(entry.busiest.value, 0)} k TEU)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ContainerThroughput;