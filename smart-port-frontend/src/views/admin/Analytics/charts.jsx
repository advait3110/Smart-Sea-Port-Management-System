import React from "react";

import {
  MdCalendarMonth,
  MdChevronLeft,
  MdChevronRight,
  MdLock,
} from "react-icons/md";

import {
  MONTHS_LONG,
  toDayNumber,
  dayParts,
  daysInMonth,
  formatDay,
  formatDayInput,
  dayKey,
  fmt,
  percent,
  sum,
  niceScale,
  axisNumber,
} from "./figures";

// =========================================================
// GRAPHS, CARDS AND THE DATE PICKER (Port Statistics page)
// =========================================================
//
// Plain SVG graphs (no chart library), the small cards used on
// the page, and the Singapore-date calendar. They show whatever
// the page hands them; the figures are worked out in figures.js.

// Colours of the graphs. Light and dark versions come from one
// validated palette; the page switches with the app's dark mode.
export const CHART_CSS = `
.an-root {
  --an-s1: #2a78d6;
  --an-s2: #eb6834;
  --an-s3: #1baf7a;
  --an-s4: #eda100;
  --an-s5: #e87ba4;
  --an-s6: #008300;
  --an-s7: #6250d6;
  --an-s8: #e34948;
  --an-crit: #d03b3b;
  --an-high: #ec835a;
  --an-med: #fab219;
  --an-low: #94a3b8;
  --an-good: #0ca30c;
  --an-other: #9ca3af;
  --an-grid: #e5e7eb;
  --an-surface: #ffffff;
  --an-cross: #cbd5e1;
}
.dark .an-root {
  --an-s1: #3987e5;
  --an-s2: #d95926;
  --an-s3: #199e70;
  --an-s4: #c98500;
  --an-s5: #d55181;
  --an-s6: #008300;
  --an-s7: #9085e9;
  --an-s8: #e66767;
  --an-grid: rgba(255, 255, 255, 0.12);
  --an-surface: #111c44;
  --an-cross: rgba(255, 255, 255, 0.35);
}
.an-root .an-hit:focus-visible {
  outline: 2px solid var(--an-s1);
  outline-offset: 2px;
}
`;

// =========================================================
// SMALL SCREEN PIECES
// =========================================================

export const Panel = ({ title, subtitle, action, children, testId }) => (
  <section
    data-testid={testId}
    className="min-w-0 rounded-[20px] bg-white p-5 shadow-sm transition-colors dark:bg-navy-800 sm:p-6"
  >
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-navy-700 dark:text-white">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>

      {action}
    </div>

    {children}
  </section>
);

export const SectionTitle = ({ children, note }) => (
  <div className="mb-3 mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
      {children}
    </h3>

    {note && (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {note}
      </span>
    )}
  </div>
);

export const Empty = ({ children, testId }) => (
  <p
    data-testid={testId}
    className="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
  >
    {children}
  </p>
);

export const StateNote = ({ state, what }) => {
  if (!state || state.status === "loading") {
    return (
      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        Loading {what}...
      </p>
    );
  }

  if (state.status === "denied") {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        <MdLock className="h-4 w-4 shrink-0" />
        Your account is not allowed to view {what}.
      </p>
    );
  }

  return (
    <p className="py-8 text-center text-sm text-red-500">
      {what.charAt(0).toUpperCase() + what.slice(1)} could not be loaded.{" "}
      {state.message}
    </p>
  );
};

export const Warning = ({ children, testId }) => (
  <p
    data-testid={testId}
    className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
  >
    {children}
  </p>
);

export const InfoNote = ({ children, testId }) => (
  <p
    data-testid={testId}
    className="mb-4 rounded-xl bg-lightPrimary px-4 py-3 text-sm text-gray-600 dark:bg-navy-900 dark:text-gray-300"
  >
    {children}
  </p>
);

export const StatTile = ({ label, value, note, testId }) => (
  <div
    data-testid={testId}
    className="min-w-0 rounded-[20px] bg-white p-5 shadow-sm transition-colors dark:bg-navy-800"
  >
    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
      {label}
    </p>

    <p
      data-testid={`${testId}-value`}
      className="mt-2 text-3xl font-bold text-navy-700 dark:text-white"
    >
      {value}
    </p>

    <p
      data-testid={`${testId}-note`}
      className="mt-1 text-xs text-gray-500 dark:text-gray-400"
    >
      {note}
    </p>
  </div>
);

export const Swatch = ({ color }) => (
  <span
    className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
    style={{ backgroundColor: color }}
  />
);

// One bar split into parts, with the numbers listed under it.
export const ShareBar = ({ items, emptyText, testId }) => {
  const total = sum(items.map((item) => item.value));

  if (total === 0) {
    return <Empty testId={testId}>{emptyText}</Empty>;
  }

  return (
    <div data-testid={testId}>
      <div
        className="flex h-3 gap-[2px]"
        role="img"
        aria-label={items
          .filter((item) => item.value > 0)
          .map((item) => `${item.label} ${item.value}`)
          .join(", ")}
      >
        {items
          .filter((item) => item.value > 0)
          .map((item) => (
            <div
              key={item.label}
              title={`${item.label}: ${fmt(item.value)}`}
              className="min-w-[4px] rounded-[3px]"
              style={{
                flex: `${item.value} 1 0%`,
                backgroundColor: item.color,
              }}
            />
          ))}
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-gray-300">
              <Swatch color={item.color} />

              <span className="truncate">{item.label}</span>
            </span>

            <span className="shrink-0 text-gray-500 dark:text-gray-400">
              <span className="font-bold text-navy-700 dark:text-white">
                {fmt(item.value)}
              </span>{" "}
              {percent(item.value, total)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Horizontal bars, one colour for one kind of thing.
export const BarList = ({
  items,
  emptyText,
  color = "var(--an-s1)",
  max,
  keepZero,
  testId,
}) => {
  const shown = items.filter((item) => keepZero || item.value > 0);

  if (!shown.length) {
    return <Empty testId={testId}>{emptyText}</Empty>;
  }

  const top = max || Math.max(...shown.map((item) => item.value)) || 1;

  return (
    <ul data-testid={testId} className="space-y-3">
      {shown.map((item) => (
        <li key={`${item.label}-${item.sub || ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-gray-600 dark:text-gray-300">
              {item.label}

              {item.sub && (
                <span className="ml-1.5 text-xs text-gray-400">
                  {item.sub}
                </span>
              )}
            </span>

            <span className="shrink-0 font-bold text-navy-700 dark:text-white">
              {item.text || fmt(item.value)}
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (item.value / top) * 100)}%`,
                backgroundColor: item.color || color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

// =========================================================
// GRAPHS (plain SVG, no chart library)
// =========================================================

// The width of a box, kept up to date when the page or the side
// panel is resized, so that the text of a graph stays readable.
export const useWidth = () => {
  const ref = React.useRef(null);

  const [width, setWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return undefined;
    }

    const measure = () =>
      setWidth(Math.round(element.getBoundingClientRect().width));

    measure();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);

      observer.observe(element);

      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);

    return () => window.removeEventListener("resize", measure);
  }, []);

  return [ref, width];
};

export const GAP = 2;

export const roundedTop = (x, y, width, height, radius) => {
  const r = Math.max(0, Math.min(radius, width / 2, height));

  return [
    `M${x},${y + height}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height}`,
    "Z",
  ].join(" ");
};

export const ChartTable = ({ buckets, series, mode, digits }) => (
  <details className="mt-3 text-sm">
    <summary className="cursor-pointer select-none text-xs font-semibold text-brand-500 dark:text-brand-400">
      Show as table
    </summary>

    <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-gray-100 dark:border-white/10">
      <table className="w-full min-w-[280px] text-left text-xs">
        <thead className="bg-lightPrimary text-gray-500 dark:bg-navy-900 dark:text-gray-400">
          <tr>
            <th className="px-3 py-2 font-semibold">Period</th>

            {series.map((entry) => (
              <th key={entry.key} className="px-3 py-2 text-right font-semibold">
                {entry.name}
              </th>
            ))}

            {mode === "stacked" && series.length > 1 && (
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            )}
          </tr>
        </thead>

        <tbody>
          {buckets.map((bucket, index) => (
            <tr
              key={bucket.title}
              className="border-t border-gray-100 text-navy-700 dark:border-white/10 dark:text-white"
            >
              <td className="px-3 py-1.5">{bucket.title}</td>

              {series.map((entry) => (
                <td key={entry.key} className="px-3 py-1.5 text-right">
                  {entry.values[index] === null
                    ? "—"
                    : fmt(entry.values[index] || 0, digits)}
                </td>
              ))}

              {mode === "stacked" && series.length > 1 && (
                <td className="px-3 py-1.5 text-right font-bold">
                  {fmt(
                    sum(series.map((entry) => entry.values[index] || 0)),
                    digits
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </details>
);

// Columns over time. mode "stacked" piles the series up
// (incidents by seriousness); "grouped" puts them side by side
// (gate entries beside exits).
export const ColumnChart = ({
  buckets,
  series,
  mode = "stacked",
  whole = true,
  digits = 0,
  unitWord,
  label,
  emptyText,
  testId,
}) => {
  const [boxRef, width] = useWidth();

  const [pointed, setHover] = React.useState(null);

  const svgRef = React.useRef(null);

  const count = buckets.length;

  // The bar being read (never beyond the last bar, even when the
  // period changes while the pointer is still on a graph).
  const hover = pointed !== null && pointed < count ? pointed : null;

  const totals = buckets.map((_, index) =>
    mode === "grouped"
      ? Math.max(0, ...series.map((entry) => entry.values[index] || 0))
      : sum(series.map((entry) => entry.values[index] || 0))
  );

  const maxValue = Math.max(0, ...totals);

  const hasData = maxValue > 0;

  const height = 240;

  const left = 46;

  const right = 10;

  const top = 20;

  const hasSub = buckets.some((bucket) => bucket.sub);

  const bottom = hasSub ? 46 : 32;

  const plotWidth = Math.max(width - left - right, 20);

  const plotHeight = height - top - bottom;

  const scale = niceScale(maxValue, whole);

  const slot = plotWidth / Math.max(count, 1);

  const longest = Math.max(
    ...buckets.map((bucket) => bucket.label.length),
    1
  );

  const labelStep = Math.max(1, Math.ceil((longest * 7 + 10) / slot));

  const baseY = top + plotHeight;

  const yOf = (value) => baseY - (value / scale.top) * plotHeight;

  const peak = totals.indexOf(maxValue);

  const indexAt = (event) => {
    const box = svgRef.current?.getBoundingClientRect();

    if (!box) {
      return null;
    }

    const x = event.clientX - box.left - left;

    if (x < 0 || x > plotWidth) {
      return null;
    }

    return Math.min(count - 1, Math.max(0, Math.floor(x / slot)));
  };

  const handleKey = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();

      setHover((current) => (current === null ? 0 : Math.min(count - 1, current + 1)));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();

      setHover((current) =>
        current === null ? count - 1 : Math.max(0, current - 1)
      );
    } else if (event.key === "Escape") {
      setHover(null);
    }
  };

  const tipWidth = 190;

  const tipLeft =
    hover === null
      ? 0
      : Math.min(
          Math.max(left + (hover + 0.5) * slot - tipWidth / 2, 0),
          Math.max(width - tipWidth, 0)
        );

  return (
    <div data-testid={testId}>
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((entry) => (
            <li
              key={entry.key}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
            >
              <Swatch color={entry.color} />

              {entry.name}
            </li>
          ))}
        </ul>
      )}

      <div ref={boxRef} className="relative w-full">
        {!hasData && <Empty testId={`${testId}-empty`}>{emptyText}</Empty>}

        {hasData && width > 0 && (
          <div
            tabIndex={0}
            role="group"
            aria-label={`${label}. Use the left and right arrow keys to read each bar.`}
            className="an-hit rounded-lg outline-none"
            onKeyDown={handleKey}
            onBlur={() => setHover(null)}
          >
            <svg
              ref={svgRef}
              width={width}
              height={height}
              role="img"
              aria-label={label}
              className="block"
              onPointerMove={(event) => setHover(indexAt(event))}
              onPointerDown={(event) => setHover(indexAt(event))}
              onPointerLeave={() => setHover(null)}
            >
              {scale.ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={yOf(tick)}
                    y2={yOf(tick)}
                    stroke="var(--an-grid)"
                    strokeWidth="1"
                  />

                  <text
                    x={left - 8}
                    y={yOf(tick) + 4}
                    textAnchor="end"
                    className="fill-gray-500 dark:fill-gray-400"
                    style={{ fontSize: 11 }}
                  >
                    {axisNumber(tick)}
                  </text>
                </g>
              ))}

              {hover !== null && (
                <rect
                  x={left + hover * slot}
                  y={top}
                  width={slot}
                  height={plotHeight}
                  className="fill-gray-900/[0.05] dark:fill-white/[0.07]"
                />
              )}

              {buckets.map((bucket, index) => {
                const centre = left + (index + 0.5) * slot;

                const dim = hover !== null && hover !== index ? 0.55 : 1;

                const marks = [];

                if (mode === "grouped") {
                  const groupWidth = Math.min(
                    slot * 0.78,
                    series.length * 16 + (series.length - 1) * GAP
                  );

                  const barWidth = Math.max(
                    2,
                    (groupWidth - (series.length - 1) * GAP) / series.length
                  );

                  series.forEach((entry, seriesIndex) => {
                    const value = entry.values[index] || 0;

                    if (value <= 0) {
                      return;
                    }

                    const barHeight = Math.max(
                      1,
                      (value / scale.top) * plotHeight
                    );

                    marks.push(
                      <path
                        key={entry.key}
                        d={roundedTop(
                          centre -
                            groupWidth / 2 +
                            seriesIndex * (barWidth + GAP),
                          baseY - barHeight,
                          barWidth,
                          barHeight,
                          4
                        )}
                        style={{ fill: entry.color }}
                      />
                    );
                  });
                } else {
                  const barWidth = Math.max(3, Math.min(24, slot * 0.7));

                  const lastIndex = series.reduce(
                    (found, entry, seriesIndex) =>
                      (entry.values[index] || 0) > 0 ? seriesIndex : found,
                    -1
                  );

                  let used = 0;

                  series.forEach((entry, seriesIndex) => {
                    const value = entry.values[index] || 0;

                    if (value <= 0) {
                      return;
                    }

                    const full = (value / scale.top) * plotHeight;

                    const isTop = seriesIndex === lastIndex;

                    const drawn = Math.max(1, isTop ? full : full - GAP);

                    marks.push(
                      <path
                        key={entry.key}
                        d={roundedTop(
                          centre - barWidth / 2,
                          baseY - used - drawn,
                          barWidth,
                          drawn,
                          isTop ? 4 : 0
                        )}
                        style={{ fill: entry.color }}
                      />
                    );

                    used += full;
                  });
                }

                return (
                  <g
                    key={bucket.title}
                    data-testid={`${testId}-bar-${index}`}
                    opacity={dim}
                  >
                    {marks}

                    {index % labelStep === 0 && (
                      <>
                        <text
                          x={centre}
                          y={baseY + 16}
                          textAnchor="middle"
                          className="fill-gray-500 dark:fill-gray-400"
                          style={{ fontSize: 11 }}
                        >
                          {bucket.label}
                        </text>

                        {bucket.sub && (
                          <text
                            x={centre}
                            y={baseY + 30}
                            textAnchor="middle"
                            className="fill-gray-400 dark:fill-gray-500"
                            style={{ fontSize: 10 }}
                          >
                            {bucket.sub}
                          </text>
                        )}
                      </>
                    )}
                  </g>
                );
              })}

              {peak >= 0 && (
                <text
                  x={Math.min(
                    Math.max(left + (peak + 0.5) * slot, left + 12),
                    width - right - 12
                  )}
                  y={yOf(totals[peak]) - 6}
                  textAnchor="middle"
                  className="fill-navy-700 dark:fill-white"
                  style={{ fontSize: 11, fontWeight: 700 }}
                >
                  {fmt(totals[peak], digits)}
                </text>
              )}
            </svg>

            {hover !== null && (
              <div
                data-testid={`${testId}-tooltip`}
                className="pointer-events-none absolute z-10 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-navy-900"
                style={{ left: tipLeft, top: 0, width: tipWidth }}
              >
                <p className="mb-1 font-semibold text-navy-700 dark:text-white">
                  {buckets[hover].title}
                </p>

                {series.map((entry) => (
                  <p
                    key={entry.key}
                    className="flex items-center justify-between gap-2 text-gray-500 dark:text-gray-400"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="inline-block h-0.5 w-3 shrink-0 rounded"
                        style={{ backgroundColor: entry.color }}
                      />

                      <span className="truncate">{entry.name}</span>
                    </span>

                    <span className="font-bold text-navy-700 dark:text-white">
                      {entry.values[hover] === null
                        ? "—"
                        : `${fmt(entry.values[hover] || 0, digits)}${
                            unitWord ? ` ${unitWord}` : ""
                          }`}
                    </span>
                  </p>
                ))}

                {mode === "stacked" && series.length > 1 && (
                  <p className="mt-1 flex justify-between border-t border-gray-100 pt-1 text-gray-500 dark:border-white/10 dark:text-gray-400">
                    <span>Total</span>

                    <span className="font-bold text-navy-700 dark:text-white">
                      {fmt(totals[hover], digits)}
                      {unitWord ? ` ${unitWord}` : ""}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {hasData && (
        <ChartTable
          buckets={buckets}
          series={series}
          mode={mode}
          digits={digits}
        />
      )}
    </div>
  );
};

// =========================================================
// MORE GRAPHS: LINE / AREA, HORIZONTAL BARS, PIE AND RADAR
// =========================================================

// The small box that follows the pointer (or the keyboard).
export const TipBox = ({ testId, left, top, title, rows, footer, wide }) => (
  <div
    data-testid={testId}
    className="pointer-events-none absolute z-10 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-navy-900"
    style={{ left, top, width: wide ? 230 : 190 }}
  >
    <p className="mb-1 font-semibold text-navy-700 dark:text-white">{title}</p>

    {rows.map((row) => (
      <p
        key={row.key}
        className="flex items-center justify-between gap-2 text-gray-500 dark:text-gray-400"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {row.color && (
            <span
              className="inline-block h-0.5 w-3 shrink-0 rounded"
              style={{ backgroundColor: row.color }}
            />
          )}

          <span className="truncate">{row.name}</span>
        </span>

        <span className="font-bold text-navy-700 dark:text-white">
          {row.value}
        </span>
      </p>
    ))}

    {footer && (
      <p className="mt-1 border-t border-gray-100 pt-1 text-gray-500 dark:border-white/10 dark:text-gray-400">
        {footer}
      </p>
    )}
  </div>
);

// Runs of neighbouring points that have a value (a gap in the
// numbers is a gap in the line).
const runsOf = (values) => {
  const runs = [];

  let current = [];

  values.forEach((value, index) => {
    if (value === null || value === undefined) {
      if (current.length) {
        runs.push(current);
      }

      current = [];
    } else {
      current.push(index);
    }
  });

  if (current.length) {
    runs.push(current);
  }

  return runs;
};

// A line over time. With area set, the space under the line is
// softly filled. A null value is a gap, not a zero.
export const LineChart = ({
  buckets,
  series,
  area = false,
  whole = true,
  digits = 0,
  unitWord,
  label,
  emptyText,
  testId,
}) => {
  const [boxRef, width] = useWidth();

  const [pointed, setHover] = React.useState(null);

  const svgRef = React.useRef(null);

  const count = buckets.length;

  const hover = pointed !== null && pointed < count ? pointed : null;

  const known = series.flatMap((entry) =>
    entry.values.filter((value) => value !== null && value !== undefined)
  );

  const hasData = known.length > 0;

  const maxValue = Math.max(0, ...known);

  const height = 240;

  const left = 46;

  const right = 14;

  const top = 22;

  const hasSub = buckets.some((bucket) => bucket.sub);

  const bottom = hasSub ? 46 : 32;

  const plotWidth = Math.max(width - left - right, 20);

  const plotHeight = height - top - bottom;

  const scale = niceScale(maxValue, whole);

  const slot = plotWidth / Math.max(count, 1);

  const longest = Math.max(
    ...buckets.map((bucket) => bucket.label.length),
    1
  );

  const labelStep = Math.max(1, Math.ceil((longest * 7 + 10) / slot));

  const baseY = top + plotHeight;

  // Many days close together: smaller dots, so they do not hide the line.
  const dotRadius = count <= 14 ? 4 : 2.5;

  const dotRing = count <= 14 ? 2 : 1;

  const xOf = (index) => left + (index + 0.5) * slot;

  const yOf = (value) => baseY - (value / scale.top) * plotHeight;

  const indexAt = (event) => {
    const box = svgRef.current?.getBoundingClientRect();

    if (!box) {
      return null;
    }

    const x = event.clientX - box.left - left;

    if (x < 0 || x > plotWidth) {
      return null;
    }

    return Math.min(count - 1, Math.max(0, Math.floor(x / slot)));
  };

  const handleKey = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();

      setHover((current) =>
        current === null ? 0 : Math.min(count - 1, current + 1)
      );
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();

      setHover((current) =>
        current === null ? count - 1 : Math.max(0, current - 1)
      );
    } else if (event.key === "Escape") {
      setHover(null);
    }
  };

  const tipWidth = 190;

  const tipLeft =
    hover === null
      ? 0
      : Math.min(
          Math.max(xOf(hover) - tipWidth / 2, 0),
          Math.max(width - tipWidth, 0)
        );

  // The highest point of a single line gets its number written on it.
  let peakIndex = -1;

  if (series.length === 1) {
    series[0].values.forEach((value, index) => {
      if (
        value !== null &&
        value !== undefined &&
        value === maxValue &&
        peakIndex < 0
      ) {
        peakIndex = index;
      }
    });
  }

  return (
    <div data-testid={testId}>
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((entry) => (
            <li
              key={entry.key}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
            >
              <Swatch color={entry.color} />

              {entry.name}
            </li>
          ))}
        </ul>
      )}

      <div ref={boxRef} className="relative w-full">
        {!hasData && <Empty testId={`${testId}-empty`}>{emptyText}</Empty>}

        {hasData && width > 0 && (
          <div
            tabIndex={0}
            role="group"
            aria-label={`${label}. Use the left and right arrow keys to read each point.`}
            className="an-hit rounded-lg outline-none"
            onKeyDown={handleKey}
            onBlur={() => setHover(null)}
          >
            <svg
              ref={svgRef}
              width={width}
              height={height}
              role="img"
              aria-label={label}
              className="block"
              onPointerMove={(event) => setHover(indexAt(event))}
              onPointerDown={(event) => setHover(indexAt(event))}
              onPointerLeave={() => setHover(null)}
            >
              {scale.ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={yOf(tick)}
                    y2={yOf(tick)}
                    stroke="var(--an-grid)"
                    strokeWidth="1"
                  />

                  <text
                    x={left - 8}
                    y={yOf(tick) + 4}
                    textAnchor="end"
                    className="fill-gray-500 dark:fill-gray-400"
                    style={{ fontSize: 11 }}
                  >
                    {axisNumber(tick)}
                  </text>
                </g>
              ))}

              {buckets.map((bucket, index) =>
                index % labelStep === 0 ? (
                  <g key={bucket.title}>
                    <text
                      x={xOf(index)}
                      y={baseY + 16}
                      textAnchor="middle"
                      className="fill-gray-500 dark:fill-gray-400"
                      style={{ fontSize: 11 }}
                    >
                      {bucket.label}
                    </text>

                    {bucket.sub && (
                      <text
                        x={xOf(index)}
                        y={baseY + 30}
                        textAnchor="middle"
                        className="fill-gray-400 dark:fill-gray-500"
                        style={{ fontSize: 10 }}
                      >
                        {bucket.sub}
                      </text>
                    )}
                  </g>
                ) : null
              )}

              {hover !== null && (
                <line
                  x1={xOf(hover)}
                  x2={xOf(hover)}
                  y1={top}
                  y2={baseY}
                  style={{ stroke: "var(--an-cross)" }}
                  strokeWidth="1"
                />
              )}

              {series.map((entry) => {
                const runs = runsOf(entry.values);

                return (
                  <g key={entry.key} data-testid={`${testId}-line-${entry.key}`}>
                    {runs.map((run) => {
                      const points = run.map(
                        (index) => `${xOf(index)},${yOf(entry.values[index])}`
                      );

                      return (
                        <g key={run[0]}>
                          {area && run.length > 1 && (
                            <path
                              d={`M${points.join(" L")} L${xOf(
                                run[run.length - 1]
                              )},${baseY} L${xOf(run[0])},${baseY} Z`}
                              style={{ fill: entry.color }}
                              opacity="0.18"
                            />
                          )}

                          {run.length > 1 && (
                            <path
                              d={`M${points.join(" L")}`}
                              fill="none"
                              strokeWidth="2"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              style={{ stroke: entry.color }}
                            />
                          )}
                        </g>
                      );
                    })}

                    {entry.values.map((value, index) =>
                      value === null || value === undefined ? null : (count <= 45 ||
                        hover === index) ? (
                        <circle
                          key={index}
                          cx={xOf(index)}
                          cy={yOf(value)}
                          r={hover === index ? 6 : dotRadius}
                          strokeWidth={dotRing}
                          style={{
                            fill: entry.color,
                            stroke: "var(--an-surface)",
                          }}
                        />
                      ) : null
                    )}
                  </g>
                );
              })}

              {peakIndex >= 0 && (
                <text
                  x={Math.min(
                    Math.max(xOf(peakIndex), left + 12),
                    width - right - 12
                  )}
                  y={yOf(maxValue) - 10}
                  textAnchor="middle"
                  className="fill-navy-700 dark:fill-white"
                  style={{ fontSize: 11, fontWeight: 700 }}
                >
                  {fmt(maxValue, digits)}
                </text>
              )}
            </svg>

            {hover !== null && (
              <TipBox
                testId={`${testId}-tooltip`}
                left={tipLeft}
                top={0}
                title={buckets[hover].title}
                rows={series.map((entry) => ({
                  key: entry.key,
                  name: entry.name,
                  color: entry.color,
                  value:
                    entry.values[hover] === null ||
                    entry.values[hover] === undefined
                      ? "No data"
                      : `${fmt(entry.values[hover], digits)}${
                          unitWord ? ` ${unitWord}` : ""
                        }`,
                }))}
              />
            )}
          </div>
        )}
      </div>

      {hasData && (
        <ChartTable
          buckets={buckets}
          series={series}
          mode="line"
          digits={digits}
        />
      )}
    </div>
  );
};

const roundedRight = (x, y, width, height, radius) => {
  const r = Math.max(0, Math.min(radius, height / 2, width));

  return [
    `M${x},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height - r}`,
    `Q${x + width},${y + height} ${x + width - r},${y + height}`,
    `L${x},${y + height}`,
    "Z",
  ].join(" ");
};

// Horizontal bars, one row for each name (ship types, for example).
export const HBarChart = ({
  items,
  whole = true,
  digits = 0,
  unitWord,
  label,
  emptyText,
  color = "var(--an-s1)",
  testId,
}) => {
  const [boxRef, width] = useWidth();

  const [pointed, setHover] = React.useState(null);

  const svgRef = React.useRef(null);

  const shown = items.filter((item) => item.value > 0);

  const count = shown.length;

  const hover = pointed !== null && pointed < count ? pointed : null;

  const maxValue = Math.max(0, ...shown.map((item) => item.value));

  const scale = niceScale(maxValue, whole);

  const rowHeight = 34;

  const barHeight = 20;

  const top = 8;

  const axisHeight = 28;

  const labelWidth = Math.min(150, Math.max(90, Math.round(width * 0.34)));

  const right = 56;

  const plotWidth = Math.max(width - labelWidth - right, 20);

  const height = top + count * rowHeight + axisHeight;

  const maxChars = Math.max(6, Math.floor((labelWidth - 12) / 6.4));

  const xOf = (value) => labelWidth + (value / scale.top) * plotWidth;

  const rowAt = (event) => {
    const box = svgRef.current?.getBoundingClientRect();

    if (!box) {
      return null;
    }

    const y = event.clientY - box.top - top;

    if (y < 0 || y > count * rowHeight) {
      return null;
    }

    return Math.min(count - 1, Math.floor(y / rowHeight));
  };

  const handleKey = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();

      setHover((current) =>
        current === null ? 0 : Math.min(count - 1, current + 1)
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();

      setHover((current) =>
        current === null ? count - 1 : Math.max(0, current - 1)
      );
    } else if (event.key === "Escape") {
      setHover(null);
    }
  };

  const tipWidth = 190;

  return (
    <div data-testid={testId}>
      <div ref={boxRef} className="relative w-full">
        {count === 0 && <Empty testId={`${testId}-empty`}>{emptyText}</Empty>}

        {count > 0 && width > 0 && (
          <div
            tabIndex={0}
            role="group"
            aria-label={`${label}. Use the up and down arrow keys to read each bar.`}
            className="an-hit rounded-lg outline-none"
            onKeyDown={handleKey}
            onBlur={() => setHover(null)}
          >
            <svg
              ref={svgRef}
              width={width}
              height={height}
              role="img"
              aria-label={label}
              className="block"
              onPointerMove={(event) => setHover(rowAt(event))}
              onPointerDown={(event) => setHover(rowAt(event))}
              onPointerLeave={() => setHover(null)}
            >
              {scale.ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={xOf(tick)}
                    x2={xOf(tick)}
                    y1={top}
                    y2={top + count * rowHeight}
                    stroke="var(--an-grid)"
                    strokeWidth="1"
                  />

                  <text
                    x={xOf(tick)}
                    y={top + count * rowHeight + 18}
                    textAnchor="middle"
                    className="fill-gray-500 dark:fill-gray-400"
                    style={{ fontSize: 11 }}
                  >
                    {axisNumber(tick)}
                  </text>
                </g>
              ))}

              {hover !== null && (
                <rect
                  x={0}
                  y={top + hover * rowHeight}
                  width={width}
                  height={rowHeight}
                  className="fill-gray-900/[0.05] dark:fill-white/[0.07]"
                />
              )}

              {shown.map((item, index) => {
                const y = top + index * rowHeight;

                const barWidth = Math.max(2, xOf(item.value) - labelWidth);

                const name =
                  item.label.length > maxChars
                    ? `${item.label.slice(0, maxChars - 1)}…`
                    : item.label;

                return (
                  <g
                    key={`${item.label}-${index}`}
                    data-testid={`${testId}-bar-${index}`}
                    opacity={hover !== null && hover !== index ? 0.55 : 1}
                  >
                    <title>{item.label}</title>

                    <text
                      x={labelWidth - 10}
                      y={y + rowHeight / 2 + 4}
                      textAnchor="end"
                      className="fill-gray-600 dark:fill-gray-300"
                      style={{ fontSize: 12 }}
                    >
                      {name}
                    </text>

                    <path
                      d={roundedRight(
                        labelWidth,
                        y + (rowHeight - barHeight) / 2,
                        barWidth,
                        barHeight,
                        4
                      )}
                      style={{ fill: item.color || color }}
                    />

                    <text
                      x={labelWidth + barWidth + 6}
                      y={y + rowHeight / 2 + 4}
                      className="fill-navy-700 dark:fill-white"
                      style={{ fontSize: 11, fontWeight: 700 }}
                    >
                      {fmt(item.value, digits)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hover !== null && (
              <TipBox
                testId={`${testId}-tooltip`}
                left={Math.min(
                  Math.max(labelWidth, 0),
                  Math.max(width - tipWidth, 0)
                )}
                top={Math.max(0, top + hover * rowHeight - 62)}
                title={shown[hover].label}
                rows={[
                  {
                    key: "value",
                    name: unitWord || "Count",
                    color: shown[hover].color || color,
                    value: fmt(shown[hover].value, digits),
                  },
                ]}
              />
            )}
          </div>
        )}
      </div>

      {count > 0 && (
        <ChartTable
          buckets={shown.map((item) => ({ title: item.label }))}
          series={[
            {
              key: "value",
              name: unitWord || "Count",
              values: shown.map((item) => item.value),
            },
          ]}
          mode="bars"
          digits={digits}
        />
      )}
    </div>
  );
};

const polar = (cx, cy, radius, angle) => ({
  x: cx + radius * Math.cos(angle),
  y: cy + radius * Math.sin(angle),
});

const slicePath = (cx, cy, radius, from, to) => {
  const start = polar(cx, cy, radius, from);

  const end = polar(cx, cy, radius, to);

  return `M${cx},${cy} L${start.x},${start.y} A${radius},${radius} 0 ${
    to - from > Math.PI ? 1 : 0
  } 1 ${end.x},${end.y} Z`;
};

// A pie with its list of numbers beside it.
export const PieChart = ({
  items,
  unitWord,
  label,
  emptyText,
  testId,
}) => {
  const shown = items.filter((item) => item.value > 0);

  const total = sum(shown.map((item) => item.value));

  const [active, setActive] = React.useState(null);

  const [tip, setTip] = React.useState(null);

  const wrapRef = React.useRef(null);

  const count = shown.length;

  const current = active !== null && active < count ? active : null;

  if (total === 0) {
    return <Empty testId={testId}>{emptyText}</Empty>;
  }

  const size = 220;

  const centre = size / 2;

  const radius = 104;

  let angle = -Math.PI / 2;

  const slices = shown.map((item) => {
    const sweep = (item.value / total) * Math.PI * 2;

    const slice = { item, from: angle, to: angle + sweep, mid: angle + sweep / 2 };

    angle += sweep;

    return slice;
  });

  const showTip = (index, event) => {
    const box = wrapRef.current?.getBoundingClientRect();

    setActive(index);

    if (box && event) {
      setTip({ x: event.clientX - box.left, y: event.clientY - box.top });
    }
  };

  const clearTip = () => {
    setActive(null);

    setTip(null);
  };

  const handleKey = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();

      setActive((now) => (now === null ? 0 : Math.min(count - 1, now + 1)));

      setTip({ x: 12, y: 12 });
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();

      setActive((now) => (now === null ? count - 1 : Math.max(0, now - 1)));

      setTip({ x: 12, y: 12 });
    } else if (event.key === "Escape") {
      clearTip();
    }
  };

  const tipLeft = tip ? Math.max(0, Math.min(tip.x + 14, 320)) : 0;

  return (
    <div data-testid={testId}>
      <div
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use the arrow keys to read each part.`}
        className="an-hit relative flex flex-wrap items-center justify-center gap-6 rounded-lg outline-none"
        onKeyDown={handleKey}
        onBlur={clearTip}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${label}: ${shown
            .map((item) => `${item.label} ${item.value}`)
            .join(", ")}`}
          className="block shrink-0"
          onPointerLeave={clearTip}
        >
          {slices.length === 1 ? (
            <circle
              data-testid={`${testId}-slice-0`}
              cx={centre}
              cy={centre}
              r={radius}
              style={{
                fill: slices[0].item.color,
                stroke: "var(--an-surface)",
              }}
              strokeWidth="2"
              onPointerMove={(event) => showTip(0, event)}
              onPointerDown={(event) => showTip(0, event)}
            />
          ) : (
            slices.map((slice, index) => {
              const lift = current === index ? 5 : 0;

              return (
                <path
                  key={slice.item.label}
                  data-testid={`${testId}-slice-${index}`}
                  d={slicePath(centre, centre, radius, slice.from, slice.to)}
                  transform={`translate(${Math.cos(slice.mid) * lift} ${
                    Math.sin(slice.mid) * lift
                  })`}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  opacity={current !== null && current !== index ? 0.6 : 1}
                  style={{
                    fill: slice.item.color,
                    stroke: "var(--an-surface)",
                  }}
                  onPointerMove={(event) => showTip(index, event)}
                  onPointerDown={(event) => showTip(index, event)}
                />
              );
            })
          )}
        </svg>

        <ul className="min-w-[170px] flex-1 space-y-2">
          {shown.map((item, index) => (
            <li
              key={item.label}
              data-testid={`${testId}-row-${index}`}
              onPointerEnter={() => setActive(index)}
              onPointerLeave={() => setActive(null)}
              className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-sm ${
                current === index ? "bg-lightPrimary dark:bg-navy-700" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-gray-300">
                <Swatch color={item.color} />

                <span className="truncate">{item.label}</span>
              </span>

              <span className="shrink-0 text-gray-500 dark:text-gray-400">
                <span className="font-bold text-navy-700 dark:text-white">
                  {fmt(item.value, item.value % 1 ? 1 : 0)}
                </span>{" "}
                {percent(item.value, total)}%
              </span>
            </li>
          ))}
        </ul>

        {current !== null && tip && (
          <TipBox
            testId={`${testId}-tooltip`}
            left={tipLeft}
            top={Math.max(0, tip.y + 14)}
            title={shown[current].label}
            rows={[
              {
                key: "value",
                name: unitWord || "Count",
                color: shown[current].color,
                value: `${fmt(shown[current].value, shown[current].value % 1 ? 1 : 0)} (${percent(
                  shown[current].value,
                  total
                )}%)`,
              },
            ]}
          />
        )}
      </div>
    </div>
  );
};

// A long name is written on two lines (split at the space that
// makes the two lines most alike).
const wrapLabel = (text) => {
  const words = String(text).split(" ");

  if (text.length <= 10 || words.length < 2) {
    return [text];
  }

  let split = 1;

  let gap = Infinity;

  for (let index = 1; index < words.length; index += 1) {
    const difference = Math.abs(
      words.slice(0, index).join(" ").length -
        words.slice(index).join(" ").length
    );

    if (difference < gap) {
      gap = difference;

      split = index;
    }
  }

  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
};

// A radar (spider) graph of scores from 0 to 100. Scores that are
// null are left out, and listed underneath with the reason.
export const RadarChart = ({ axes, label, emptyText, testId }) => {
  const [boxRef, width] = useWidth();

  const [active, setActive] = React.useState(null);

  const svgRef = React.useRef(null);

  const usable = axes.filter((axis) => axis.value !== null);

  const count = usable.length;

  const current = active !== null && active < count ? active : null;

  const boxWidth = Math.max(Math.min(width, 520), 240);

  const boxHeight = Math.max(Math.min(boxWidth, 340), 240);

  const cx = boxWidth / 2;

  const cy = boxHeight / 2;

  const angleOf = (index) => -Math.PI / 2 + (index / Math.max(count, 1)) * Math.PI * 2;

  // Each name is written on one or two lines, with the score under
  // it. The graph is made as large as it can be while every name
  // still fits inside the picture (nothing is cut off at the edges).
  const labelBlocks = usable.map((axis, index) => {
    const angle = angleOf(index);

    const lines = wrapLabel(axis.label);

    const cos = Math.cos(angle);

    return {
      axis,
      lines,
      cos,
      sin: Math.sin(angle),
      anchor: cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle",
      textWidth: Math.max(
        ...lines.map((line) => line.length * 6.4),
        String(axis.value).length * 7.6 + 10
      ),
    };
  });

  const labelSpot = (block, ring) => {
    const x = cx + block.cos * (ring + 16);

    const y = cy + block.sin * (ring + 16);

    const rows = block.lines.length + 1;

    // y of the first line of text
    const first =
      block.sin < -0.5
        ? y - 4 - (rows - 1) * 13
        : block.sin > 0.5
        ? y + 12
        : y - ((rows - 1) * 13) / 2 + 4;

    return { x, y, first, rows };
  };

  const labelsFit = (ring) =>
    labelBlocks.every((block) => {
      const spot = labelSpot(block, ring);

      const leftEdge =
        block.anchor === "start"
          ? spot.x
          : block.anchor === "end"
          ? spot.x - block.textWidth
          : spot.x - block.textWidth / 2;

      return (
        leftEdge >= 2 &&
        leftEdge + block.textWidth <= boxWidth - 2 &&
        spot.first - 10 >= 2 &&
        spot.first + (spot.rows - 1) * 13 + 4 <= boxHeight - 2
      );
    });

  let radius = Math.min(boxWidth, boxHeight) / 2 - 20;

  while (radius > 44 && !labelsFit(radius)) {
    radius -= 2;
  }

  radius = Math.max(radius, 44);

  const rings = [20, 40, 60, 80, 100];

  const points = usable.map((axis, index) =>
    polar(cx, cy, (radius * axis.value) / 100, angleOf(index))
  );

  const nearest = (event) => {
    const box = svgRef.current?.getBoundingClientRect();

    if (!box) {
      return null;
    }

    const x = event.clientX - box.left;

    const y = event.clientY - box.top;

    let best = null;

    let bestDistance = 48;

    points.forEach((point, index) => {
      const distance = Math.hypot(point.x - x, point.y - y);

      if (distance < bestDistance) {
        best = index;

        bestDistance = distance;
      }
    });

    return best;
  };

  const handleKey = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();

      setActive((now) => (now === null ? 0 : (now + 1) % count));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();

      setActive((now) => (now === null ? count - 1 : (now - 1 + count) % count));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const tipWidth = 230;

  const tipPoint = current === null ? null : points[current];

  return (
    <div data-testid={testId}>
      <div ref={boxRef} className="relative w-full">
        {count < 3 && (
          <Empty testId={`${testId}-empty`}>{emptyText}</Empty>
        )}

        {count >= 3 && width > 0 && (
          <div
            tabIndex={0}
            role="group"
            aria-label={`${label}. Use the arrow keys to read each score.`}
            className="an-hit mx-auto rounded-lg outline-none"
            style={{ width: boxWidth }}
            onKeyDown={handleKey}
            onBlur={() => setActive(null)}
          >
            <svg
              ref={svgRef}
              width={boxWidth}
              height={boxHeight}
              role="img"
              aria-label={`${label}: ${usable
                .map((axis) => `${axis.label} ${axis.value}%`)
                .join(", ")}`}
              className="block"
              onPointerMove={(event) => setActive(nearest(event))}
              onPointerDown={(event) => setActive(nearest(event))}
              onPointerLeave={() => setActive(null)}
            >
              {rings.map((ring) => (
                <polygon
                  key={ring}
                  points={usable
                    .map((_, index) => {
                      const point = polar(cx, cy, (radius * ring) / 100, angleOf(index));

                      return `${point.x},${point.y}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke="var(--an-grid)"
                  strokeWidth="1"
                />
              ))}

              {usable.map((axis, index) => {
                const end = polar(cx, cy, radius, angleOf(index));

                return (
                  <line
                    key={axis.key}
                    x1={cx}
                    y1={cy}
                    x2={end.x}
                    y2={end.y}
                    stroke="var(--an-grid)"
                    strokeWidth="1"
                  />
                );
              })}

              {rings.map((ring) => (
                <text
                  key={`tick-${ring}`}
                  x={cx + 4}
                  y={cy - (radius * ring) / 100 - 2}
                  className="fill-gray-400 dark:fill-gray-500"
                  style={{ fontSize: 9 }}
                >
                  {ring}
                </text>
              ))}

              <polygon
                data-testid={`${testId}-shape`}
                points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                strokeWidth="2"
                strokeLinejoin="round"
                opacity="1"
                style={{
                  fill: "color-mix(in srgb, var(--an-s1) 22%, transparent)",
                  stroke: "var(--an-s1)",
                }}
              />

              {points.map((point, index) => (
                <circle
                  key={usable[index].key}
                  data-testid={`${testId}-point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={current === index ? 7 : 4.5}
                  strokeWidth="2"
                  style={{ fill: "var(--an-s1)", stroke: "var(--an-surface)" }}
                />
              ))}

              {labelBlocks.map((block) => {
                const spot = labelSpot(block, radius);

                return (
                  <g key={`label-${block.axis.key}`}>
                    {block.lines.map((line, row) => (
                      <text
                        key={line}
                        x={spot.x}
                        y={spot.first + row * 13}
                        textAnchor={block.anchor}
                        className="fill-gray-600 dark:fill-gray-300"
                        style={{ fontSize: 11 }}
                      >
                        {line}
                      </text>
                    ))}

                    <text
                      x={spot.x}
                      y={spot.first + block.lines.length * 13}
                      textAnchor={block.anchor}
                      className="fill-navy-700 dark:fill-white"
                      style={{ fontSize: 12, fontWeight: 700 }}
                    >
                      {block.axis.value}%
                    </text>
                  </g>
                );
              })}
            </svg>

            {current !== null && tipPoint && (
              <TipBox
                testId={`${testId}-tooltip`}
                wide
                left={Math.min(
                  Math.max(tipPoint.x - tipWidth / 2, 0),
                  Math.max(boxWidth - tipWidth, 0)
                )}
                top={Math.max(0, tipPoint.y + 12)}
                title={usable[current].label}
                rows={[
                  {
                    key: "score",
                    name: "Score",
                    color: "var(--an-s1)",
                    value: `${usable[current].value} / 100`,
                  },
                ]}
                footer={usable[current].detail}
              />
            )}
          </div>
        )}
      </div>

      <ul data-testid={`${testId}-list`} className="mt-4 space-y-2">
        {axes.map((axis) => (
          <li
            key={axis.key}
            className="rounded-xl bg-lightPrimary px-4 py-2.5 text-sm dark:bg-navy-900"
          >
            <p className="flex items-center justify-between gap-3 font-semibold text-navy-700 dark:text-white">
              <span>{axis.label}</span>

              <span>{axis.value === null ? "—" : `${axis.value}%`}</span>
            </p>

            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {axis.detail}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
};

// =========================================================
// CALENDAR AND DATE PICKER (Singapore dates)
// =========================================================

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DateCalendar = ({
  value,
  minDay,
  maxDay,
  today,
  onPick,
  selectingLabel,
  alignRight,
  testId,
}) => {
  const start = dayParts(value ?? today);

  const [view, setView] = React.useState({ y: start.y, m: start.m });

  const maxYear = dayParts(maxDay).y;

  const minYear = dayParts(minDay).y;

  const firstOfMonth = toDayNumber(view.y, view.m, 1);

  const gridStart = firstOfMonth - dayParts(firstOfMonth).dow;

  const cells = Array.from({ length: 42 }, (_, index) => gridStart + index);

  const canGoBack = firstOfMonth - 1 >= minDay;

  const canGoForward = toDayNumber(view.y, view.m + 1, 1) <= maxDay;

  const move = (step) => {
    const absolute = view.y * 12 + (view.m - 1) + step;

    setView({ y: Math.floor(absolute / 12), m: (absolute % 12) + 1 });
  };

  const changeYear = (year) => {
    let m = view.m;

    if (toDayNumber(year, m, 1) > maxDay) {
      m = dayParts(maxDay).m;
    }

    if (toDayNumber(year, m, daysInMonth(year, m)) < minDay) {
      m = dayParts(minDay).m;
    }

    setView({ y: year, m });
  };

  const years = [];

  for (let year = minYear; year <= maxYear; year += 1) {
    years.push(year);
  }

  return (
    <div
      data-testid={testId}
      className={`z-[100] mt-3 w-full rounded-[20px] border border-gray-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-navy-800 sm:absolute sm:top-full sm:w-[350px] ${
        alignRight ? "sm:right-0" : "sm:left-0"
      }`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          data-testid={`${testId}-prev`}
          disabled={!canGoBack}
          onClick={() => move(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition hover:bg-lightPrimary hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-navy-700"
        >
          <MdChevronLeft className="h-6 w-6" />
        </button>

        <div className="text-center">
          <p className="text-lg font-bold text-navy-700 dark:text-white">
            {MONTHS_LONG[view.m - 1]}
          </p>

          <select
            aria-label="Year"
            data-testid={`${testId}-year`}
            value={view.y}
            onChange={(event) => changeYear(Number(event.target.value))}
            className="cursor-pointer rounded-md bg-transparent text-sm text-gray-500 outline-none hover:text-brand-500 dark:bg-navy-800 dark:text-gray-400"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          aria-label="Next month"
          data-testid={`${testId}-next`}
          disabled={!canGoForward}
          onClick={() => move(1)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition hover:bg-lightPrimary hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-navy-700"
        >
          <MdChevronRight className="h-6 w-6" />
        </button>
      </div>

      <div className="mt-4 rounded-xl bg-lightPrimary p-4 dark:bg-navy-700">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {selectingLabel}
        </p>

        <p className="mt-1 text-sm font-bold text-navy-700 dark:text-white">
          {value === null || value === undefined
            ? "Select a date"
            : formatDay(value)}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className={`py-2 text-center text-xs font-bold ${
              day === "Sun" ? "text-red-400" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((dayNumber) => {
          const parts = dayParts(dayNumber);

          const selected = dayNumber === value;

          const disabled = dayNumber < minDay || dayNumber > maxDay;

          const currentMonth = parts.m === view.m;

          const sunday = parts.dow === 0;

          return (
            <button
              type="button"
              key={dayNumber}
              data-testid={`day-${dayKey(dayNumber)}`}
              aria-label={formatDay(dayNumber)}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onPick(dayNumber)}
              className={`flex h-9 items-center justify-center rounded-lg text-sm font-medium transition ${
                selected
                  ? "bg-brand-500 text-white"
                  : currentMonth
                  ? sunday
                    ? "text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    : "text-navy-700 hover:bg-lightPrimary dark:text-white dark:hover:bg-navy-700"
                  : "text-gray-300 dark:text-gray-600"
              } ${dayNumber === today && !selected ? "ring-1 ring-brand-500" : ""} ${
                disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer"
              }`}
            >
              {parts.d}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const DatePicker = ({
  value,
  onChange,
  label,
  minDay,
  maxDay,
  today,
  selectingLabel,
  alignRight,
  testId,
}) => {
  const [open, setOpen] = React.useState(false);

  const boxRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }

    const close = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const escape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    // Close on a finished click (not on the press), so that the page
    // does not jump under the finger before the click lands. This
    // matters on a phone, where the calendar sits in the page.
    document.addEventListener("click", close);

    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("click", close);

      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <MdCalendarMonth className="h-5 w-5 text-brand-500" />

        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {label}
        </span>
      </div>

      <button
        type="button"
        data-testid={testId}
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className={`flex h-16 w-full items-center justify-between rounded-2xl border bg-white px-5 text-left transition dark:bg-navy-800 ${
          open
            ? "border-brand-500 ring-2 ring-brand-500/20"
            : "border-gray-200 hover:border-brand-300 dark:border-white/10"
        }`}
      >
        <span className="text-base font-medium text-navy-700 dark:text-white">
          {formatDayInput(value)}
        </span>

        <MdCalendarMonth className="h-6 w-6 text-gray-400" />
      </button>

      {open && (
        <DateCalendar
          testId={`${testId}-calendar`}
          value={value}
          minDay={minDay}
          maxDay={maxDay}
          today={today}
          selectingLabel={selectingLabel}
          alignRight={alignRight}
          onPick={(dayNumber) => {
            onChange(dayNumber);

            setOpen(false);
          }}
        />
      )}
    </div>
  );
};