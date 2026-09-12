import React from "react";
import {
  MdAnchor,
  MdDirectionsBoat,
  MdBuild,
  MdCheckCircle,
  MdAccessTime,
} from "react-icons/md";

// =========================================================
// DEMONSTRATION BERTH DATA
// =========================================================

const berthData = [
  {
    berth: "B-01",
    vessel: "Cheng X",
    type: "Bitumen Tanker",
    status: "Occupied",
    operation: "Cargo Loading",
    eta: "10:30 AM",
    etd: "04:30 PM",
  },
  {
    berth: "B-02",
    vessel: "MT Padmanabh",
    type: "Bitumen Tanker",
    status: "Occupied",
    operation: "Cargo Unloading",
    eta: "12:45 PM",
    etd: "06:00 PM",
  },
  {
    berth: "B-03",
    vessel: "MT R Ocean",
    type: "Cargo Vessel / Tanker",
    status: "Occupied",
    operation: "Cargo Handling",
    eta: "03:20 PM",
    etd: "08:00 PM",
  },
  {
    berth: "B-04",
    vessel: "MT Clayton II",
    type: "Bitumen Tanker",
    status: "Occupied",
    operation: "Cargo Loading",
    eta: "05:10 PM",
    etd: "10:00 PM",
  },
  {
    berth: "B-05",
    vessel: "MT Stellar Ruby",
    type: "Bitumen Tanker",
    status: "Occupied",
    operation: "Cargo Discharge",
    eta: "06:30 PM",
    etd: "11:00 PM",
  },
  {
    berth: "B-06",
    vessel: "—",
    type: "—",
    status: "Maintenance",
    operation: "Berth Maintenance",
    eta: "—",
    etd: "—",
  },
  {
    berth: "B-07",
    vessel: "African Avocet",
    type: "Bulk Carrier",
    status: "Occupied",
    operation: "Cargo Handling",
    eta: "08:00 AM",
    etd: "03:00 PM",
  },
];

// =========================================================
// STATUS STYLES
// =========================================================

const getStatusStyle = (status) => {
  switch (status) {
    case "Occupied":
      return "bg-red-100 text-red-500 dark:bg-red-500/10 dark:text-red-400";

    case "Available":
      return "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400";

    case "Maintenance":
      return "bg-orange-100 text-orange-500 dark:bg-orange-500/10 dark:text-orange-400";

    default:
      return "bg-gray-100 text-gray-500 dark:bg-gray-500/10 dark:text-gray-400";
  }
};

// =========================================================
// BERTH MANAGEMENT
// =========================================================

const Berths = () => {
  // =======================================================
  // CALCULATE BERTH STATISTICS
  // =======================================================

  const occupied = berthData.filter(
    (berth) => berth.status === "Occupied"
  ).length;

  const available = berthData.filter(
    (berth) => berth.status === "Available"
  ).length;

  const maintenance = berthData.filter(
    (berth) => berth.status === "Maintenance"
  ).length;

  const total = berthData.length;

  const utilization =
    total > 0 ? Math.round((occupied / total) * 100) : 0;

  return (
    <div className="mt-3">

      {/* =====================================================
          PAGE HEADER
          ===================================================== */}

      {/* 
        The main layout already displays:
        "Berth Management"

        Therefore we intentionally do NOT repeat the H1 here.
      */}

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">

        <div className="flex items-center gap-4">

          {/* Icon */}

          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">

            <MdAnchor className="h-8 w-8" />

          </div>

          {/* Description */}

          <p className="text-sm text-navy-700 dark:text-white">
            Monitor berth occupancy, availability and vessel assignments.
          </p>

        </div>

      </div>


      {/* =====================================================
          DEMONSTRATION DATA NOTICE
          ===================================================== */}

      <div className="mb-6 rounded-[20px] border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-navy-800">

        <p className="font-medium text-blue-600 dark:text-blue-300">
          Demonstration data
        </p>

        <p className="mt-1 text-sm text-blue-500 dark:text-blue-200">
          The berth information displayed here is prototype data for
          demonstrating the Smart Port Management interface. It does not
          represent confidential or live Karwar Port operational data.
        </p>

      </div>


      {/* =====================================================
          SUMMARY CARDS
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">

        {/* ===================================================
            TOTAL BERTHS
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Total Berths
              </p>

              <h2 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                {total}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

              <MdAnchor className="h-6 w-6" />

            </div>

          </div>

        </div>


        {/* ===================================================
            OCCUPIED
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Occupied
              </p>

              <h2 className="mt-2 text-3xl font-bold text-red-500">
                {occupied}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">

              <MdDirectionsBoat className="h-6 w-6" />

            </div>

          </div>

        </div>


        {/* ===================================================
            AVAILABLE
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Available
              </p>

              <h2 className="mt-2 text-3xl font-bold text-green-500">
                {available}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500 dark:bg-green-500/10">

              <MdCheckCircle className="h-6 w-6" />

            </div>

          </div>

        </div>


        {/* ===================================================
            MAINTENANCE
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Maintenance
              </p>

              <h2 className="mt-2 text-3xl font-bold text-orange-500">
                {maintenance}
              </h2>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-500/10">

              <MdBuild className="h-6 w-6" />

            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          BERTH UTILIZATION + OPERATIONS
          ===================================================== */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* ===================================================
            BERTH UTILIZATION
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Berth Utilization
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Current berth occupancy
              </p>

            </div>

            <MdAnchor className="h-8 w-8 text-brand-500" />

          </div>


          <div className="mt-8 flex items-center gap-8">

            {/* Utilization Circle */}

            <div
              className="relative flex h-36 w-36 items-center justify-center rounded-full border-[18px] border-brand-500"
            >

              <div className="text-center">

                <p className="text-3xl font-bold text-navy-700 dark:text-white">
                  {utilization}%
                </p>

                <p className="text-xs text-gray-400">
                  Utilized
                </p>

              </div>

            </div>


            {/* Legend */}

            <div className="flex flex-col gap-4">

              <div className="flex items-center gap-3">

                <span className="h-3 w-3 rounded-full bg-red-500" />

                <span className="text-sm text-gray-500 dark:text-gray-300">
                  Occupied: {occupied}
                </span>

              </div>


              <div className="flex items-center gap-3">

                <span className="h-3 w-3 rounded-full bg-green-500" />

                <span className="text-sm text-gray-500 dark:text-gray-300">
                  Available: {available}
                </span>

              </div>


              <div className="flex items-center gap-3">

                <span className="h-3 w-3 rounded-full bg-orange-500" />

                <span className="text-sm text-gray-500 dark:text-gray-300">
                  Maintenance: {maintenance}
                </span>

              </div>

            </div>

          </div>

        </div>


        {/* ===================================================
            BERTH OPERATIONS
            =================================================== */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Berth Operations
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Current operational overview
              </p>

            </div>

            <MdAccessTime className="h-8 w-8 text-brand-500" />

          </div>


          <div className="mt-6 space-y-5">

            {/* Alongside */}

            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Vessels currently alongside
              </span>

              <span className="font-bold text-navy-700 dark:text-white">
                {occupied}
              </span>

            </div>


            {/* Available */}

            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Berths ready for assignment
              </span>

              <span className="font-bold text-green-500">
                {available}
              </span>

            </div>


            {/* Maintenance */}

            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Berths under maintenance
              </span>

              <span className="font-bold text-orange-500">
                {maintenance}
              </span>

            </div>


            {/* Utilization */}

            <div className="flex items-center justify-between">

              <span className="text-sm text-gray-400">
                Current utilization
              </span>

              <span className="font-bold text-brand-500">
                {utilization}%
              </span>

            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          BERTH STATUS TABLE
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">

          <div>

            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Berth Status
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Current berth assignments and operational status
            </p>

          </div>


          <button className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600">
            Assign Vessel
          </button>

        </div>


        {/* ===================================================
            TABLE
            =================================================== */}

        <div className="overflow-x-auto">

          <table className="w-full min-w-[900px]">

            <thead>

              <tr className="border-b border-gray-200 dark:border-white/10">

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Berth
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Vessel
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Vessel Type
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Operation
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  ETA
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  ETD
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Status
                </th>

              </tr>

            </thead>


            <tbody>

              {berthData.map((item, index) => (

                <tr
                  key={index}
                  className="border-b border-gray-100 last:border-0 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700"
                >

                  {/* =================================================
                      BERTH
                      ================================================= */}

                  <td className="px-4 py-5">

                    <div className="flex items-center gap-3">

                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-900">

                        <MdAnchor className="h-5 w-5" />

                      </div>

                      <span className="font-bold text-navy-700 dark:text-white">
                        {item.berth}
                      </span>

                    </div>

                  </td>


                  {/* =================================================
                      VESSEL
                      ================================================= */}

                  <td className="px-4 py-5">

                    <span className="font-medium text-navy-700 dark:text-white">
                      {item.vessel}
                    </span>

                  </td>


                  {/* =================================================
                      VESSEL TYPE
                      ================================================= */}

                  <td className="px-4 py-5 text-sm text-gray-400">
                    {item.type}
                  </td>


                  {/* =================================================
                      OPERATION
                      ================================================= */}

                  <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                    {item.operation}
                  </td>


                  {/* =================================================
                      ETA
                      ================================================= */}

                  <td className="px-4 py-5 text-sm font-medium text-navy-700 dark:text-white">
                    {item.eta}
                  </td>


                  {/* =================================================
                      ETD
                      ================================================= */}

                  <td className="px-4 py-5 text-sm font-medium text-navy-700 dark:text-white">
                    {item.etd}
                  </td>


                  {/* =================================================
                      STATUS
                      ================================================= */}

                  <td className="px-4 py-5">

                    <span
                      className={`rounded-full px-4 py-2 text-xs font-bold ${getStatusStyle(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </span>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>


      {/* =====================================================
          MAINTENANCE SECTION
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex items-center gap-3">

          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-500/10">

            <MdBuild className="h-6 w-6" />

          </div>

          <div>

            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Maintenance Schedule
            </h2>

            <p className="mt-1 text-sm text-navy-700 dark:text-white">
              Berths currently unavailable for vessel operations.
            </p>

          </div>

        </div>


        {/* Maintenance Card */}

        {maintenance > 0 && (
          <div className="mt-6 rounded-xl bg-orange-50 p-5 dark:bg-orange-500/10">

            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">

              <div>

                <p className="font-bold text-navy-700 dark:text-white">
                  B-06 — Berth Maintenance
                </p>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                  Scheduled maintenance currently in progress.
                </p>

              </div>

              <span className="w-fit rounded-full bg-orange-100 px-4 py-2 text-xs font-bold text-orange-500 dark:bg-orange-500/10 dark:text-orange-400">
                Under Maintenance
              </span>

            </div>

          </div>
        )}

      </div>

    </div>
  );
};

export default Berths;