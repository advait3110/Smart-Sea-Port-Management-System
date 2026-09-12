import React from "react";
import {
  MdDirectionsBoat,
  MdSearch,
  MdAdd,
  MdRefresh,
} from "react-icons/md";

const vesselData = [
  {
    id: 1,
    name: "Cheng X",
    imo: "—",
    type: "Bitumen Tanker",
    eta: "10:30 AM",
    berth: "B-01",
    status: "At Berth",
  },
  {
    id: 2,
    name: "MT Padmanabh",
    imo: "—",
    type: "Bitumen Tanker",
    eta: "12:45 PM",
    berth: "B-02",
    status: "Expected",
  },
  {
    id: 3,
    name: "MT R Ocean",
    imo: "—",
    type: "Cargo Vessel / Tanker",
    eta: "03:20 PM",
    berth: "B-03",
    status: "Anchorage",
  },
  {
    id: 4,
    name: "MT Clayton II",
    imo: "—",
    type: "Bitumen Tanker",
    eta: "05:10 PM",
    berth: "B-04",
    status: "Expected",
  },
  {
    id: 5,
    name: "MT Stellar Ruby",
    imo: "—",
    type: "Bitumen Tanker",
    eta: "06:30 PM",
    berth: "B-05",
    status: "Anchorage",
  },
  {
    id: 6,
    name: "Bitumen Princess 2",
    imo: "9440289",
    type: "Asphalt / Bitumen Tanker",
    eta: "07:15 PM",
    berth: "B-06",
    status: "Expected",
  },
  {
    id: 7,
    name: "African Avocet",
    imo: "—",
    type: "Bulk Carrier",
    eta: "08:00 AM",
    berth: "B-07",
    status: "At Berth",
  },
  {
    id: 8,
    name: "JW Liberty",
    imo: "—",
    type: "Bulk Carrier",
    eta: "09:45 AM",
    berth: "—",
    status: "Expected",
  },
  {
    id: 9,
    name: "MARIVEX",
    imo: "—",
    type: "Oil-Products Tanker",
    eta: "11:30 AM",
    berth: "—",
    status: "Anchorage",
  },
  {
    id: 10,
    name: "M S G",
    imo: "—",
    type: "Bitumen Tanker",
    eta: "01:15 PM",
    berth: "—",
    status: "Expected",
  },
  {
    id: 11,
    name: "Northern Star",
    imo: "—",
    type: "Bitumen Tanker",
    eta: "02:45 PM",
    berth: "—",
    status: "Expected",
  },
  {
    id: 12,
    name: "MISSION",
    imo: "—",
    type: "Crude-Oil Tanker",
    eta: "04:30 PM",
    berth: "—",
    status: "Anchorage",
  },
  {
    id: 13,
    name: "SCI Yamuna",
    imo: "—",
    type: "Offshore Tug / Supply Vessel",
    eta: "06:00 PM",
    berth: "—",
    status: "Expected",
  },
  {
    id: 14,
    name: "SCI Sabarmati",
    imo: "—",
    type: "Offshore Tug / Supply Vessel",
    eta: "08:30 PM",
    berth: "—",
    status: "Expected",
  },
  {
    id: 15,
    name: "Bhagavati",
    imo: "—",
    type: "Tug",
    eta: "09:00 AM",
    berth: "—",
    status: "At Berth",
  },
];

const statusStyles = {
  "At Berth":
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",

  Expected:
    "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",

  Anchorage:
    "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
};

const VesselManagement = () => {
  return (
    <div className="mt-5">

      {/* =====================================================
          PAGE HEADER
          ===================================================== */}

      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">

        <div className="flex items-center gap-3">

          {/* Vessel Icon */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
            <MdDirectionsBoat className="h-7 w-7" />
          </div>

          {/* Subtitle only - duplicate H1 removed */}
          <p className="text-sm text-black dark:text-white">
            Manage vessel arrivals, departures and port operations.
          </p>

        </div>

        <button className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600">
          <MdAdd className="h-5 w-5" />
          Add Vessel
        </button>

      </div>



      {/* =====================================================
          VESSEL SUMMARY
          ===================================================== */}

      <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">

        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">
          <p className="text-sm font-medium text-gray-500">
            Total Vessels
          </p>

          <p className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
            15
          </p>
        </div>


        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">
          <p className="text-sm font-medium text-gray-500">
            At Berth
          </p>

          <p className="mt-2 text-2xl font-bold text-green-500">
            3
          </p>
        </div>


        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">
          <p className="text-sm font-medium text-gray-500">
            At Anchorage
          </p>

          <p className="mt-2 text-2xl font-bold text-orange-500">
            4
          </p>
        </div>


        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">
          <p className="text-sm font-medium text-gray-500">
            Expected Today
          </p>

          <p className="mt-2 text-2xl font-bold text-brand-500">
            8
          </p>
        </div>

      </div>


      {/* =====================================================
          VESSEL TABLE
          ===================================================== */}

      <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Vessel Schedule
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Current and expected vessel activity
            </p>
          </div>


          <div className="flex gap-2">

            {/* Search */}

            <div className="flex h-11 items-center rounded-xl bg-lightPrimary px-3 dark:bg-navy-900">

              <MdSearch className="mr-2 h-5 w-5 text-gray-400" />

              <input
                type="text"
                placeholder="Search vessel..."
                className="w-40 bg-transparent text-sm text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
              />

            </div>


            {/* Refresh */}

            <button className="flex h-11 w-11 items-center justify-center rounded-xl bg-lightPrimary text-gray-600 dark:bg-navy-900 dark:text-white">
              <MdRefresh className="h-5 w-5" />
            </button>

          </div>

        </div>


        {/* =================================================
            TABLE
            ================================================= */}

        <div className="overflow-x-auto">

          <table className="w-full min-w-[850px]">

            <thead>

              <tr className="border-b border-gray-200 dark:border-white/10">

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Vessel
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  IMO Number
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Vessel Type
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  ETA
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Berth
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Status
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  Action
                </th>

              </tr>

            </thead>


            <tbody>

              {vesselData.map((vessel) => (

                <tr
                  key={vessel.id}
                  className="border-b border-gray-100 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700"
                >

                  {/* Vessel */}

                  <td className="px-4 py-4">

                    <div className="flex items-center gap-3">

                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-900">
                        <MdDirectionsBoat className="h-5 w-5" />
                      </div>

                      <div>

                        <p className="font-bold text-navy-700 dark:text-white">
                          {vessel.name}
                        </p>

                        <p className="text-xs text-gray-500">
                          Vessel ID: VP-{String(vessel.id).padStart(3, "0")}
                        </p>

                      </div>

                    </div>

                  </td>


                  {/* IMO */}

                  <td className="px-4 py-4 text-sm font-medium text-gray-600 dark:text-gray-300">
                    {vessel.imo}
                  </td>


                  {/* Type */}

                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {vessel.type}
                  </td>


                  {/* ETA */}

                  <td className="px-4 py-4 text-sm font-medium text-navy-700 dark:text-white">
                    {vessel.eta}
                  </td>


                  {/* Berth */}

                  <td className="px-4 py-4 text-sm font-bold text-navy-700 dark:text-white">
                    {vessel.berth}
                  </td>


                  {/* Status */}

                  <td className="px-4 py-4">

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        statusStyles[vessel.status]
                      }`}
                    >
                      {vessel.status}
                    </span>

                  </td>


                  {/* Action */}

                  <td className="px-4 py-4">

                    <button className="text-sm font-bold text-brand-500 hover:text-brand-600">
                      View Details
                    </button>

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

export default VesselManagement;