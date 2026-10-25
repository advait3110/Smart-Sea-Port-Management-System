import React from "react";

import {
  MdLocalShipping,
  MdDirectionsBoat,
  MdTrendingUp,
  MdCheckCircle,
  MdErrorOutline,
} from "react-icons/md";

// Two small helpers are kept in this file, so it does not depend on where
// portData.js is saved. dataChecks and yearlyTotals arrive from the Cargo
// Operations page through the "helpers" prop.
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
const monthLabel = (period) => {
  const [year, month] = String(period).split("-");

  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
};

// One row of the Sea Cargo statistics, found by its role.
const seaSeries = (sea, role) =>
  sea ? sea.series.find((item) => item.role === role) : undefined;

/*
=========================================================
CARGO THROUGHPUT

Port of Singapore statistics from the imported CSV files
(the Import CSV button of the Cargo Operations page):

  cargo      yearly   by cargo type, and the yearly total   thousand tonnes
  cargo      monthly  total (or sum of the types)           thousand tonnes
  container  monthly  all containers                        thousand TEU
  shipping   yearly   Sea Cargo and Shipping Statistics     see each chart
  other      monthly or yearly, any other port / cargo CSV  as in the file

Sources: Maritime and Port Authority of Singapore (MPA) and SingStat,
through data.gov.sg, under the Singapore Open Data Licence. These are
published totals, not live port activity. Nothing is shown until its
file is imported.
=========================================================
*/

// =========================================================
// SETTINGS
// =========================================================

const SERIES_COLORS = ["#4318FF", "#6AD2FF", "#FFB547", "#05CD99", "#EE5D50"];

const BASELINE_YEAR = "2019";

// =========================================================
// FORMATTERS
// =========================================================

const formatNumber = (value, digits = 1) =>
  Number(value).toLocaleString("en-SG", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

// thousand tonnes / thousand TEU / thousand GT -> millions
const formatMillions = (thousands) => formatNumber(thousands / 1000, 1);

const formatPercent = (value) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value > 0 ? "+" : ""}${formatNumber(value, 1)}%`;

const changePercent = (current, previous) =>
  previous === null ||
  previous === undefined ||
  previous === 0 ||
  current === null ||
  current === undefined
    ? null
    : ((current - previous) / previous) * 100;

const changeClass = (value) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "text-gray-400"
    : value >= 0
    ? "text-green-500"
    : "text-red-500";

// =========================================================
// CHART HELPERS
// =========================================================

/* A round upper limit and tick step for an axis starting at 0. */
const niceScale = (maximum) => {
  const target = Math.max(maximum, 1) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const fraction = target / magnitude;

  const step =
    (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) *
    magnitude;

  return { step, max: step * Math.ceil(Math.max(maximum, 1) / step) };
};

const CHART_WIDTH = 900;
const CHART_HEIGHT = 320;

// Drawing width of the charts that sit two to a row.
const SMALL_WIDTH = 640;
const MARGIN = { top: 16, right: 16, bottom: 30, left: 58 };

const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

// divisor turns the stored figure into the axis unit
// (1000: thousand tonnes -> million tonnes).
const GridAndAxis = ({
  scale,
  unitLabel,
  divisor = 1000,
  width = CHART_WIDTH,
}) => {
  const ticks = [];

  for (let value = 0; value <= scale.max + 1e-9; value += scale.step) {
    ticks.push(value);
  }

  return (
    <>
      {ticks.map((tick) => {
        const y = MARGIN.top + plotHeight - (tick / scale.max) * plotHeight;
        const shown = tick / divisor;

        return (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={y}
              y2={y}
              className="stroke-gray-200 dark:stroke-white/10"
              strokeWidth="1"
            />

            <text
              x={MARGIN.left - 8}
              y={y + 4}
              textAnchor="end"
              className="fill-gray-400"
              fontSize="11"
            >
              {formatNumber(shown, Number.isInteger(shown) ? 0 : 1)}
            </text>
          </g>
        );
      })}

      <text
        x={MARGIN.left}
        y={11}
        className="fill-gray-400"
        fontSize="10"
      >
        {unitLabel}
      </text>
    </>
  );
};

const Tooltip = ({ left, children }) => (
  <div
    className="pointer-events-none absolute top-2 z-10 w-max max-w-[220px] rounded-xl bg-white px-3 py-2 text-xs shadow-xl dark:bg-navy-900"
    style={{
      left: `${left}%`,
      transform: left > 60 ? "translateX(-105%)" : "translateX(8px)",
    }}
  >
    {children}
  </div>
);

// =========================================================
// ANNUAL CARGO (stacked bars)
// =========================================================

const AnnualCargoChart = ({
  years,
  series,
  valueOf,
  label,
  width = CHART_WIDTH,
}) => {
  const [hover, setHover] = React.useState(null);

  const totals = years.map((year) =>
    series.reduce((sum, name) => sum + (valueOf(year, name) || 0), 0)
  );

  const scale = niceScale(Math.max(...totals));

  const slot = (width - MARGIN.left - MARGIN.right) / years.length;
  const barWidth = Math.max(3, slot * 0.7);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={label}
        onMouseLeave={() => setHover(null)}
      >
        <GridAndAxis scale={scale} unitLabel="million tonnes" width={width} />

        {years.map((year, index) => {
          const x = MARGIN.left + index * slot + (slot - barWidth) / 2;
          let stacked = 0;

          return (
            <g key={year}>
              {series.map((name, seriesIndex) => {
                const value = valueOf(year, name) || 0;
                const height = (value / scale.max) * plotHeight;
                const y = MARGIN.top + plotHeight - stacked - height;

                stacked += height;

                return (
                  <rect
                    key={name}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(height, 0)}
                    fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
                    opacity={hover === null || hover === index ? 1 : 0.55}
                  />
                );
              })}

              {(index % 5 === 0 || index === years.length - 1) && (
                <text
                  x={x + barWidth / 2}
                  y={CHART_HEIGHT - 10}
                  textAnchor="middle"
                  className="fill-gray-400"
                  fontSize="11"
                >
                  {year}
                </text>
              )}

              <rect
                x={MARGIN.left + index * slot}
                y={MARGIN.top}
                width={slot}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
              />
            </g>
          );
        })}
      </svg>

      {hover !== null && (
        <Tooltip
          left={((MARGIN.left + (hover + 0.5) * slot) / width) * 100}
        >
          <p className="font-bold text-navy-700 dark:text-white">
            {years[hover]}: {formatMillions(totals[hover])} M tonnes
          </p>

          {series.map((name, seriesIndex) => (
            <p
              key={name}
              className="mt-1 flex items-center gap-2 text-gray-500 dark:text-gray-300"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
                }}
              />

              {name}: {formatMillions(valueOf(years[hover], name) || 0)} M
            </p>
          ))}
        </Tooltip>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 dark:text-gray-300">
        {series.map((name, seriesIndex) => (
          <span key={name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
              }}
            />

            {name}
          </span>
        ))}
      </div>
    </div>
  );
};

// =========================================================
// MONTHLY CONTAINERS (line)
// =========================================================

const MonthlyContainerChart = ({
  months,
  valueByMonth,
  axisUnit = "million TEU",
  valueUnit = "thousand TEU",
  label = "Monthly container throughput",
  color = "#4318FF",
}) => {
  const [hover, setHover] = React.useState(null);
  const svgRef = React.useRef(null);

  if (months.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-gray-400">
        Not enough months to draw a line.
      </p>
    );
  }

  const maximum = Math.max(...months.map((month) => valueByMonth.get(month)));

  const scale = niceScale(maximum);

  const xOf = (index) =>
    MARGIN.left + (index / (months.length - 1)) * plotWidth;

  const yOf = (value) =>
    MARGIN.top + plotHeight - (value / scale.max) * plotHeight;

  const points = months.map(
    (month, index) => `${xOf(index)},${yOf(valueByMonth.get(month))}`
  );

  const area = `${xOf(0)},${MARGIN.top + plotHeight} ${points.join(
    " "
  )} ${xOf(months.length - 1)},${MARGIN.top + plotHeight}`;

  const handleMove = (event) => {
    const box = svgRef.current.getBoundingClientRect();

    const x = ((event.clientX - box.left) / box.width) * CHART_WIDTH;

    const index = Math.round(
      ((x - MARGIN.left) / plotWidth) * (months.length - 1)
    );

    setHover(Math.max(0, Math.min(months.length - 1, index)));
  };

  const hoveredMonth = hover === null ? null : months[hover];

  const sameMonthLastYear =
    hoveredMonth === null
      ? null
      : valueByMonth.get(
          `${Number(hoveredMonth.slice(0, 4)) - 1}${hoveredMonth.slice(4)}`
        );

  // a year label at every January, thinned out for long ranges
  const labelEvery = months.length > 180 ? 5 : months.length > 90 ? 2 : 1;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={label}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <GridAndAxis scale={scale} unitLabel={axisUnit} />

        <polygon points={area} fill={color} opacity="0.08" />

        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {months.map((month, index) => {
          if (!month.endsWith("-01")) return null;

          const year = Number(month.slice(0, 4));

          if (year % labelEvery !== 0) return null;

          return (
            <text
              key={month}
              x={xOf(index)}
              y={CHART_HEIGHT - 10}
              textAnchor="middle"
              className="fill-gray-400"
              fontSize="11"
            >
              {year}
            </text>
          );
        })}

        {hover !== null && (
          <>
            <line
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
              className="stroke-gray-300 dark:stroke-white/20"
              strokeDasharray="4 4"
            />

            <circle
              cx={xOf(hover)}
              cy={yOf(valueByMonth.get(hoveredMonth))}
              r="5"
              fill={color}
              stroke="#ffffff"
              strokeWidth="2"
            />
          </>
        )}
      </svg>

      {hover !== null && (
        <Tooltip left={(xOf(hover) / CHART_WIDTH) * 100}>
          <p className="font-bold text-navy-700 dark:text-white">
            {monthLabel(hoveredMonth)}
          </p>

          <p className="mt-1 text-gray-500 dark:text-gray-300">
            {formatNumber(valueByMonth.get(hoveredMonth), 1)} {valueUnit}
          </p>

          {sameMonthLastYear !== undefined && (
            <p
              className={`mt-1 font-medium ${changeClass(
                changePercent(
                  valueByMonth.get(hoveredMonth),
                  sameMonthLastYear
                )
              )}`}
            >
              {formatPercent(
                changePercent(
                  valueByMonth.get(hoveredMonth),
                  sameMonthLastYear
                )
              )}{" "}
              vs same month last year
            </p>
          )}
        </Tooltip>
      )}
    </div>
  );
};

// =========================================================
// YEARLY TREND (line, one value per year)
//
// points: [{ label: "2024", value: 123 }], oldest first.
// divisor: stored figure -> axis unit. formatValue: the tooltip text.
// =========================================================

const TrendChart = ({
  points,
  divisor,
  unitLabel,
  formatValue,
  color = "#4318FF",
  label,
  width = CHART_WIDTH,
}) => {
  const [hover, setHover] = React.useState(null);
  const svgRef = React.useRef(null);

  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-gray-400">
        Not enough years to draw a line.
      </p>
    );
  }

  const scale = niceScale(Math.max(...points.map((point) => point.value)));

  const last = points.length - 1;

  const plotW = width - MARGIN.left - MARGIN.right;

  const xOf = (index) => MARGIN.left + (index / last) * plotW;

  const yOf = (value) =>
    MARGIN.top + plotHeight - (value / scale.max) * plotHeight;

  const line = points
    .map((point, index) => `${xOf(index)},${yOf(point.value)}`)
    .join(" ");

  const area = `${xOf(0)},${MARGIN.top + plotHeight} ${line} ${xOf(
    last
  )},${MARGIN.top + plotHeight}`;

  // about seven year labels, counted back from the latest year
  const step = Math.max(1, Math.ceil(points.length / 7));
  const labelled = [];

  for (let index = last; index >= 0; index -= step) {
    labelled.push(index);
  }

  const handleMove = (event) => {
    const box = svgRef.current.getBoundingClientRect();

    const x = ((event.clientX - box.left) / box.width) * width;

    const index = Math.round(((x - MARGIN.left) / plotW) * last);

    setHover(Math.max(0, Math.min(last, index)));
  };

  const hovered = hover === null ? null : points[hover];
  const before = hover === null || hover === 0 ? null : points[hover - 1];

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={label}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <GridAndAxis
          scale={scale}
          unitLabel={unitLabel}
          divisor={divisor}
          width={width}
        />

        <polygon points={area} fill={color} opacity="0.08" />

        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {labelled.map((index) => (
          <text
            key={points[index].label}
            x={xOf(index)}
            y={CHART_HEIGHT - 10}
            textAnchor="middle"
            className="fill-gray-400"
            fontSize="11"
          >
            {points[index].label}
          </text>
        ))}

        {hover !== null && (
          <>
            <line
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
              className="stroke-gray-300 dark:stroke-white/20"
              strokeDasharray="4 4"
            />

            <circle
              cx={xOf(hover)}
              cy={yOf(hovered.value)}
              r="5"
              fill={color}
              stroke="#ffffff"
              strokeWidth="2"
            />
          </>
        )}
      </svg>

      {hover !== null && (
        <Tooltip left={(xOf(hover) / width) * 100}>
          <p className="font-bold text-navy-700 dark:text-white">
            {hovered.label}
          </p>

          <p className="mt-1 text-gray-500 dark:text-gray-300">
            {formatValue(hovered.value)}
          </p>

          {before && (
            <p
              className={`mt-1 font-medium ${changeClass(
                changePercent(hovered.value, before.value)
              )}`}
            >
              {formatPercent(changePercent(hovered.value, before.value))} vs{" "}
              {before.label}
            </p>
          )}
        </Tooltip>
      )}
    </div>
  );
};

// =========================================================
// SMALL PIECES
// =========================================================

const KpiCard = ({ label, value, unit, change, changeNote, icon }) => (
  <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-400">{label}</p>

        <h2 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
          {value}
          {unit && (
            <span className="ml-1 text-base font-medium text-gray-400">
              {unit}
            </span>
          )}
        </h2>

        <p className="mt-2 min-h-[18px] text-xs text-gray-400">
          {change !== undefined && (
            <span className={`font-bold ${changeClass(change)}`}>
              {formatPercent(change)}
            </span>
          )}{" "}
          {changeNote}
        </p>
      </div>

      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
        {icon}
      </div>
    </div>
  </div>
);

const ChartCard = ({ title, subtitle, children }) => (
  <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
    <h2 className="text-xl font-bold text-navy-700 dark:text-white">
      {title}
    </h2>

    <p className="mb-4 mt-1 text-sm text-gray-400">{subtitle}</p>

    {children}
  </div>
);

// =========================================================
// CARGO THROUGHPUT PAGE
// =========================================================

const CargoThroughput = ({ data, helpers }) => {
  const { dataChecks, yearlyTotals } = helpers;

  const [rangeYears, setRangeYears] = React.useState(5);

  // =======================================================
  // CARGO BY TYPE (MPA yearly breakdown)
  // =======================================================

  const cargo = React.useMemo(() => {
    const rows = data.cargoBreakdown ? data.cargoBreakdown.rows : [];

    const values = new Map(); // "year|secondary" -> value
    const primaryOf = new Map(); // secondary -> primary
    const yearSet = new Set();
    const series = [];

    rows.forEach((row) => {
      values.set(`${row.year}|${row.secondary}`, row.value);
      yearSet.add(row.year);
      primaryOf.set(row.secondary, row.primary);

      if (!series.includes(row.secondary)) {
        series.push(row.secondary);
      }
    });

    const years = [...yearSet].sort();

    const valueOf = (year, name) => values.get(`${year}|${name}`);

    const totalOf = (year) =>
      series.reduce((sum, name) => sum + (valueOf(year, name) || 0), 0);

    return { years, series, valueOf, totalOf, primaryOf };
  }, [data.cargoBreakdown]);

  const latestYear = cargo.years[cargo.years.length - 1];
  const previousYear = cargo.years[cargo.years.length - 2];

  // Yearly total: the MPA total file, otherwise the sum of the breakdown.
  const totals = React.useMemo(() => yearlyTotals(data), [data]);

  const totalYears = [...totals.keys()].sort();
  const totalLatest = totalYears[totalYears.length - 1];
  const totalPrevious = totalYears[totalYears.length - 2];

  // =======================================================
  // CONTAINERS (MPA monthly)
  // =======================================================

  const container = React.useMemo(() => {
    const rows = data.containerMonthly ? data.containerMonthly.rows : [];

    const valueByMonth = new Map(rows.map((row) => [row.month, row.value]));

    const months = [...valueByMonth.keys()].sort();

    return { valueByMonth, months };
  }, [data.containerMonthly]);

  // =======================================================
  // CARGO (MPA monthly: total file, or the sum of the types)
  // =======================================================

  const cargoMonthly = React.useMemo(() => {
    const valueByMonth = new Map();

    if (data.cargoMonthly) {
      data.cargoMonthly.rows.forEach((row) => valueByMonth.set(row.month, row.value));
    } else if (data.cargoMonthlyBreakdown) {
      data.cargoMonthlyBreakdown.rows.forEach((row) =>
        valueByMonth.set(row.month, (valueByMonth.get(row.month) || 0) + row.value)
      );
    }

    return { valueByMonth, months: [...valueByMonth.keys()].sort() };
  }, [data.cargoMonthly, data.cargoMonthlyBreakdown]);

  const cargoShownMonths =
    rangeYears === 0
      ? cargoMonthly.months
      : cargoMonthly.months.slice(-rangeYears * 12);

  const otherSeries = data.otherSeries ? data.otherSeries.series : [];

  const latestMonth = container.months[container.months.length - 1];

  const sumMonths = (list) =>
    list.reduce((sum, month) => sum + container.valueByMonth.get(month), 0);

  const last12 = container.months.slice(-12);
  const before12 = container.months.slice(-24, -12);

  const last12Total = last12.length === 12 ? sumMonths(last12) : null;

  const last12Change =
    last12.length === 12 && before12.length === 12
      ? changePercent(last12Total, sumMonths(before12))
      : null;

  const latestMonthValue = latestMonth
    ? container.valueByMonth.get(latestMonth)
    : null;

  const latestMonthChange = latestMonth
    ? changePercent(
        latestMonthValue,
        container.valueByMonth.get(
          `${Number(latestMonth.slice(0, 4)) - 1}${latestMonth.slice(4)}`
        )
      )
    : null;

  const shownMonths =
    rangeYears === 0
      ? container.months
      : container.months.slice(-rangeYears * 12);

  // =======================================================
  // CARGO MIX TABLE
  // =======================================================

  const mixRows = latestYear
    ? cargo.series.map((name) => {
        const value = cargo.valueOf(latestYear, name) || 0;

        return {
          name,
          primary: cargo.primaryOf.get(name),
          value,
          share: (value / cargo.totalOf(latestYear)) * 100,
          yearChange: previousYear
            ? changePercent(value, cargo.valueOf(previousYear, name))
            : null,
          baselineChange: cargo.years.includes(BASELINE_YEAR)
            ? changePercent(value, cargo.valueOf(BASELINE_YEAR, name))
            : null,
        };
      })
    : [];

  const containerisedShare = mixRows.find(
    (row) => row.name === "Containerised"
  );

  // =======================================================
  // SEA CARGO AND SHIPPING STATISTICS
  // =======================================================

  const sea = data.seaCargo;

  const pointsOf = (role) => {
    const series = seaSeries(sea, role);

    if (!series) return [];

    return sea.years
      .filter((year) => series.values[year] !== null)
      .map((year) => ({ label: year, value: series.values[year] }));
  };

  const bunker = pointsOf("bunker");
  const ships = pointsOf("ships");
  const tonnage = pointsOf("tonnage");
  const seaContainers = pointsOf("containers");

  const generalSeries = seaSeries(sea, "general");
  const bulkSeries = seaSeries(sea, "bulk");

  const generalBulkYears =
    generalSeries && bulkSeries
      ? sea.years.filter(
          (year) =>
            generalSeries.values[year] !== null ||
            bulkSeries.values[year] !== null
        )
      : [];

  const latestOf = (points) => points[points.length - 1];
  const previousOf = (points) => points[points.length - 2];

  const checks = dataChecks(data).filter(
    (check) => check.scope === "throughput"
  );

  const hasCargoCards = totals.size > 0 || container.months.length > 0;

  const hasAny =
    hasCargoCards || sea || cargoMonthly.months.length > 0 || otherSeries.length > 0;

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div className="mt-3">
      {/* EMPTY STATE */}

      {!hasAny && (
        <div className="rounded-[20px] bg-white p-10 text-center shadow-sm dark:bg-navy-800">
          <MdLocalShipping className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />

          <p className="mt-3 font-bold text-navy-700 dark:text-white">
            No throughput data yet
          </p>

          <p className="mx-auto mt-1 max-w-xl text-sm text-gray-500">
            Select Import CSV and choose the cargo throughput files (yearly
            or monthly, total or by type), the monthly container file, the
            Sea Cargo and Shipping Statistics file, or any other Singapore
            port or cargo CSV. You can select several at once.
          </p>
        </div>
      )}

      {hasAny && (
        <>
          {/* KPI CARDS */}

          {hasCargoCards && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label={totalLatest ? `Total cargo, ${totalLatest}` : "Total cargo"}
                value={
                  totalLatest ? formatMillions(totals.get(totalLatest)) : "—"
                }
                unit="M tonnes"
                change={
                  totalPrevious
                    ? changePercent(
                        totals.get(totalLatest),
                        totals.get(totalPrevious)
                      )
                    : undefined
                }
                changeNote={totalPrevious ? `vs ${totalPrevious}` : ""}
                icon={<MdLocalShipping className="h-6 w-6" />}
              />

              <KpiCard
                label="Containerised share"
                value={
                  containerisedShare
                    ? formatNumber(containerisedShare.share, 1)
                    : "—"
                }
                unit="%"
                change={
                  containerisedShare ? containerisedShare.yearChange : undefined
                }
                changeNote={
                  containerisedShare ? "containerised cargo vs last year" : ""
                }
                icon={<MdTrendingUp className="h-6 w-6" />}
              />

              <KpiCard
                label="Containers, last 12 months"
                value={last12Total !== null ? formatMillions(last12Total) : "—"}
                unit="M TEU"
                change={last12Change !== null ? last12Change : undefined}
                changeNote={
                  last12.length === 12
                    ? `${monthLabel(last12[0])} – ${monthLabel(last12[11])}`
                    : ""
                }
                icon={<MdDirectionsBoat className="h-6 w-6" />}
              />

              <KpiCard
                label={
                  latestMonth
                    ? `Containers, ${monthLabel(latestMonth)}`
                    : "Containers, latest month"
                }
                value={
                  latestMonthValue !== null
                    ? formatNumber(latestMonthValue, 0)
                    : "—"
                }
                unit="k TEU"
                change={latestMonthChange !== null ? latestMonthChange : undefined}
                changeNote={latestMonth ? "vs same month last year" : ""}
                icon={<MdDirectionsBoat className="h-6 w-6" />}
              />
            </div>
          )}

          {sea && (bunker.length > 0 || ships.length > 0 || tonnage.length > 0) && (
            <div
              className={`grid grid-cols-1 gap-5 md:grid-cols-3 ${
                hasCargoCards ? "mt-5" : ""
              }`}
            >
              <KpiCard
                label={
                  bunker.length > 0
                    ? `Bunker sales, ${latestOf(bunker).label}`
                    : "Bunker sales"
                }
                value={
                  bunker.length > 0 ? formatMillions(latestOf(bunker).value) : "—"
                }
                unit="M tonnes"
                change={
                  bunker.length > 1
                    ? changePercent(
                        latestOf(bunker).value,
                        previousOf(bunker).value
                      )
                    : undefined
                }
                changeNote={
                  bunker.length > 1 ? `vs ${previousOf(bunker).label}` : ""
                }
                icon={<MdLocalShipping className="h-6 w-6" />}
              />

              <KpiCard
                label={
                  ships.length > 0
                    ? `Ships on the Singapore Registry, ${latestOf(ships).label}`
                    : "Ships on the Singapore Registry"
                }
                value={
                  ships.length > 0 ? formatNumber(latestOf(ships).value, 0) : "—"
                }
                unit="ships"
                change={
                  ships.length > 1
                    ? changePercent(
                        latestOf(ships).value,
                        previousOf(ships).value
                      )
                    : undefined
                }
                changeNote={
                  ships.length > 1 ? `vs ${previousOf(ships).label}` : ""
                }
                icon={<MdDirectionsBoat className="h-6 w-6" />}
              />

              <KpiCard
                label={
                  tonnage.length > 0
                    ? `Registry tonnage, ${latestOf(tonnage).label}`
                    : "Registry tonnage"
                }
                value={
                  tonnage.length > 0
                    ? formatMillions(latestOf(tonnage).value)
                    : "—"
                }
                unit="M GT"
                change={
                  tonnage.length > 1
                    ? changePercent(
                        latestOf(tonnage).value,
                        previousOf(tonnage).value
                      )
                    : undefined
                }
                changeNote={
                  tonnage.length > 1 ? `vs ${previousOf(tonnage).label}` : ""
                }
                icon={<MdTrendingUp className="h-6 w-6" />}
              />
            </div>
          )}

          {/* ANNUAL CARGO */}

          {cargo.years.length > 0 && (
            <div className="mt-5">
              <ChartCard
                title="Yearly cargo throughput"
                subtitle={`${cargo.years[0]} – ${latestYear}, by cargo type`}
              >
                <AnnualCargoChart
                  years={cargo.years}
                  series={cargo.series}
                  valueOf={cargo.valueOf}
                  label="Yearly cargo throughput by cargo type"
                />
              </ChartCard>
            </div>
          )}

          {/* MONTHLY CONTAINERS */}

          {container.months.length > 0 && (
            <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
              <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                    Monthly container throughput
                  </h2>

                  <p className="mt-1 text-sm text-gray-400">
                    {monthLabel(shownMonths[0])} –{" "}
                    {monthLabel(shownMonths[shownMonths.length - 1])}
                  </p>
                </div>

                <div className="flex gap-1 rounded-xl bg-lightPrimary p-1 dark:bg-navy-700">
                  {[
                    { label: "5 years", value: 5 },
                    { label: "10 years", value: 10 },
                    { label: "All", value: 0 },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRangeYears(option.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        rangeYears === option.value
                          ? "bg-brand-500 text-white"
                          : "text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-navy-600"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <MonthlyContainerChart
                months={shownMonths}
                valueByMonth={container.valueByMonth}
              />
            </div>
          )}

          {/* MONTHLY CARGO */}

          {cargoMonthly.months.length > 0 && (
            <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
              <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                    Monthly cargo throughput
                  </h2>

                  <p className="mt-1 text-sm text-gray-400">
                    {monthLabel(cargoShownMonths[0])} –{" "}
                    {monthLabel(cargoShownMonths[cargoShownMonths.length - 1])}
                    {data.cargoMonthly ? "" : ", sum of the cargo types"}
                  </p>
                </div>

                <div className="flex gap-1 rounded-xl bg-lightPrimary p-1 dark:bg-navy-700">
                  {[
                    { label: "5 years", value: 5 },
                    { label: "10 years", value: 10 },
                    { label: "All", value: 0 },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRangeYears(option.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        rangeYears === option.value
                          ? "bg-brand-500 text-white"
                          : "text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-navy-600"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <MonthlyContainerChart
                months={cargoShownMonths}
                valueByMonth={cargoMonthly.valueByMonth}
                axisUnit="million tonnes"
                valueUnit="thousand tonnes"
                label="Monthly cargo throughput"
                color="#05CD99"
              />
            </div>
          )}

          {/* CARGO MIX TABLE */}

          {mixRows.length > 0 && (
            <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Cargo mix, {latestYear}
              </h2>

              <p className="mb-4 mt-1 text-sm text-gray-400">
                Million tonnes, with the change on last year
                {cargo.years.includes(BASELINE_YEAR)
                  ? ` and on ${BASELINE_YEAR}, before the pandemic`
                  : ""}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-white/10">
                      {[
                        "Cargo type",
                        "Group",
                        "Million tonnes",
                        "Share",
                        `vs ${previousYear || "last year"}`,
                        `vs ${BASELINE_YEAR}`,
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {mixRows.map((row, index) => (
                      <tr
                        key={row.name}
                        className="border-b border-gray-100 last:border-0 dark:border-white/5"
                      >
                        <td className="px-4 py-4">
                          <span className="flex items-center gap-2 font-bold text-navy-700 dark:text-white">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                background:
                                  SERIES_COLORS[index % SERIES_COLORS.length],
                              }}
                            />

                            {row.name}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                          {row.primary}
                        </td>

                        <td className="px-4 py-4 text-sm font-medium text-navy-700 dark:text-white">
                          {formatMillions(row.value)}
                        </td>

                        <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                          {formatNumber(row.share, 1)}%
                        </td>

                        <td
                          className={`px-4 py-4 text-sm font-bold ${changeClass(
                            row.yearChange
                          )}`}
                        >
                          {formatPercent(row.yearChange)}
                        </td>

                        <td
                          className={`px-4 py-4 text-sm font-bold ${changeClass(
                            row.baselineChange
                          )}`}
                        >
                          {formatPercent(row.baselineChange)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SEA CARGO AND SHIPPING STATISTICS */}

          {sea && (
            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
              {generalBulkYears.length > 1 && (
                <ChartCard
                  title="General and bulk cargo"
                  subtitle={`${generalBulkYears[0]} – ${
                    generalBulkYears[generalBulkYears.length - 1]
                  }, Sea Cargo and Shipping Statistics`}
                >
                  <AnnualCargoChart
                    years={generalBulkYears}
                    series={["General cargo", "Bulk cargo"]}
                    valueOf={(year, name) =>
                      (name === "General cargo" ? generalSeries : bulkSeries)
                        .values[year]
                    }
                    label="Yearly general and bulk cargo"
                    width={SMALL_WIDTH}
                  />
                </ChartCard>
              )}

              {seaContainers.length > 1 && (
                <ChartCard
                  title="Yearly container throughput"
                  subtitle={`${seaContainers[0].label} – ${
                    latestOf(seaContainers).label
                  }, million TEU`}
                >
                  <TrendChart
                    points={seaContainers}
                    divisor={1000}
                    unitLabel="million TEU"
                    formatValue={(value) =>
                      `${formatNumber(value, 1)} thousand TEU`
                    }
                    label="Yearly container throughput"
                    width={SMALL_WIDTH}
                  />
                </ChartCard>
              )}

              {bunker.length > 1 && (
                <ChartCard
                  title="Bunker sales"
                  subtitle={`${bunker[0].label} – ${
                    latestOf(bunker).label
                  }, million tonnes of marine fuel sold`}
                >
                  <TrendChart
                    points={bunker}
                    divisor={1000}
                    unitLabel="million tonnes"
                    color="#FFB547"
                    formatValue={(value) =>
                      `${formatNumber(value, 1)} thousand tonnes`
                    }
                    label="Yearly bunker sales"
                    width={SMALL_WIDTH}
                  />
                </ChartCard>
              )}

              {ships.length > 1 && (
                <ChartCard
                  title="Ships on the Singapore Registry"
                  subtitle={`${ships[0].label} – ${
                    latestOf(ships).label
                  }, number of ships at the end of the year`}
                >
                  <TrendChart
                    points={ships}
                    divisor={1}
                    unitLabel="ships"
                    color="#05CD99"
                    formatValue={(value) => `${formatNumber(value, 0)} ships`}
                    label="Ships on the Singapore Registry"
                    width={SMALL_WIDTH}
                  />
                </ChartCard>
              )}

              {tonnage.length > 1 && (
                <ChartCard
                  title="Singapore Registry tonnage"
                  subtitle={`${tonnage[0].label} – ${
                    latestOf(tonnage).label
                  }, million gross tonnes at the end of the year`}
                >
                  <TrendChart
                    points={tonnage}
                    divisor={1000}
                    unitLabel="million GT"
                    color="#6AD2FF"
                    formatValue={(value) =>
                      `${formatNumber(value, 0)} thousand GT`
                    }
                    label="Singapore Registry tonnage"
                    width={SMALL_WIDTH}
                  />
                </ChartCard>
              )}
            </div>
          )}

          {/* OTHER IMPORTED FIGURES */}

          {otherSeries.length > 0 && (
            <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Other imported figures
              </h2>

              <p className="mb-4 mt-1 text-sm text-gray-400">
                Other Singapore port and cargo CSV files, as published (units
                as in each file). They are forecast on the Delay Prediction
                page, Predict Cargo Throughput tab.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-white/10">
                      {["Figure", "Every", "From", "To", "Latest"].map((heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {otherSeries.map((item) => {
                      const first = item.rows[0];
                      const last = item.rows[item.rows.length - 1];
                      const show = (period) =>
                        item.frequency === "monthly" ? monthLabel(period) : period;

                      return (
                        <tr
                          key={item.key}
                          className="border-b border-gray-100 last:border-0 dark:border-white/5"
                        >
                          <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-300">
                            {item.frequency === "monthly" ? "Month" : "Year"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-300">
                            {show(first.period)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-300">
                            {show(last.period)}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-navy-700 dark:text-white">
                            {formatNumber(last.value, Number.isInteger(last.value) ? 0 : 1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CHECKS BETWEEN THE FILES */}

          {checks.length > 0 && (
            <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Data checks
              </h2>

              <p className="mb-4 mt-1 text-sm text-gray-400">
                The imported files compared with each other.
              </p>

              <ul className="space-y-3">
                {checks.map((check) => (
                  <li
                    key={check.text}
                    className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300"
                  >
                    {check.ok ? (
                      <MdCheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
                    ) : (
                      <MdErrorOutline className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-500" />
                    )}

                    <span>{check.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="mt-4 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
        Sources: Maritime and Port Authority of Singapore and SingStat, through
        data.gov.sg (Singapore Open Data Licence). Cargo is in thousand tonnes
        and containers in thousand TEU, shown here in millions. These are
        published totals, not live port activity.
      </p>
    </div>
  );
};

export default CargoThroughput;