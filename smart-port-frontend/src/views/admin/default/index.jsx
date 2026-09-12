import Widget from "components/widget/Widget";

import {
  MdDirectionsBoat,
  MdAnchor,
  MdInventory2,
  MdLocalShipping,
  MdAssignment,
  MdWarning,
} from "react-icons/md";

const Dashboard = () => {
  return (
    <div>
      {/* =====================================================
          PORT KPI CARDS
          ===================================================== */}
      <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">

        {/* Vessels */}
        <Widget
          icon={
            <MdDirectionsBoat className="h-7 w-7 text-blue-500 dark:text-blue-400" />
          }
          title={"Vessels in Port"}
          subtitle={"12"}
        />

        {/* Berth */}
        <Widget
          icon={
            <MdAnchor className="h-7 w-7 text-cyan-500 dark:text-cyan-400" />
          }
          title={"Berth Occupancy"}
          subtitle={"68%"}
        />

        {/* Cargo */}
        <Widget
          icon={
            <MdInventory2 className="h-7 w-7 text-orange-500 dark:text-orange-400" />
          }
          title={"Cargo Handled Today"}
          subtitle={"4,280 MT"}
        />

        {/* Trucks */}
        <Widget
          icon={
            <MdLocalShipping className="h-7 w-7 text-purple-500 dark:text-purple-400" />
          }
          title={"Trucks Inside Port"}
          subtitle={"37"}
        />

        {/* Pending Operations */}
        <Widget
          icon={
            <MdAssignment className="h-7 w-7 text-teal-500 dark:text-teal-400" />
          }
          title={"Pending Operations"}
          subtitle={"18"}
        />

        {/* Active Alerts */}
        <Widget
          icon={
            <MdWarning className="h-7 w-7 text-red-500 dark:text-red-400" />
          }
          title={"Active Alerts"}
          subtitle={"4"}
        />

      </div>

      {/* =====================================================
          OPERATIONAL OVERVIEW
          ===================================================== */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">

        {/* Vessel Operations */}
        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                Vessel Operations
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Current vessel activity at Karwar Port
              </p>
            </div>

            <MdDirectionsBoat className="h-7 w-7 text-brand-500" />
          </div>

          <div className="space-y-4">

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                At Berth
              </span>

              <span className="font-bold text-green-500">
                7
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                At Anchorage
              </span>

              <span className="font-bold text-orange-500">
                3
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Expected Today
              </span>

              <span className="font-bold text-brand-500">
                2
              </span>
            </div>

          </div>
        </div>

        {/* Berth Status */}
        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                Berth Status
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Current berth availability
              </p>
            </div>

            <MdAnchor className="h-7 w-7 text-brand-500" />
          </div>

          <div className="space-y-4">

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Occupied
              </span>

              <span className="font-bold text-red-500">
                5
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Available
              </span>

              <span className="font-bold text-green-500">
                2
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Maintenance
              </span>

              <span className="font-bold text-orange-500">
                1
              </span>
            </div>

          </div>
        </div>

      </div>

      {/* =====================================================
          CARGO & GATE OVERVIEW
          ===================================================== */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">

        {/* Cargo Operations */}
        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                Cargo Operations
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Today's cargo activity
              </p>
            </div>

            <MdInventory2 className="h-7 w-7 text-brand-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">

            <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Import
              </p>

              <p className="mt-2 text-xl font-bold text-navy-700 dark:text-white">
                2,540 MT
              </p>
            </div>

            <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Export
              </p>

              <p className="mt-2 text-xl font-bold text-navy-700 dark:text-white">
                1,740 MT
              </p>
            </div>

          </div>
        </div>

        {/* Gate Activity */}
        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                Gate Activity
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Today's vehicle movement
              </p>
            </div>

            <MdLocalShipping className="h-7 w-7 text-brand-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">

            <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Entries
              </p>

              <p className="mt-2 text-xl font-bold text-navy-700 dark:text-white">
                124
              </p>
            </div>

            <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Exits
              </p>

              <p className="mt-2 text-xl font-bold text-navy-700 dark:text-white">
                87
              </p>
            </div>

          </div>
        </div>

      </div>

      {/* =====================================================
          ALERTS
          ===================================================== */}
      <div className="mt-5 rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex items-center justify-between">

          <div>
            <h2 className="text-lg font-bold text-navy-700 dark:text-white">
              Port Alerts
            </h2>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Operational issues requiring attention
            </p>
          </div>

          <MdWarning className="h-7 w-7 text-red-500 dark:text-red-400" />

        </div>

        <div className="space-y-3">

          <div className="flex items-center justify-between rounded-xl bg-orange-50 p-4 dark:bg-navy-900">
            <div>
              <p className="font-medium text-navy-700 dark:text-white">
                Vessel operation delay
              </p>

              <p className="text-sm text-gray-500 dark:text-gray-400">
                Operational review required
              </p>
            </div>

            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-600">
              Attention
            </span>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-red-50 p-4 dark:bg-navy-900">
            <div>
              <p className="font-medium text-navy-700 dark:text-white">
                Berth maintenance
              </p>

              <p className="text-sm text-gray-500 dark:text-gray-400">
                Berth currently unavailable
              </p>
            </div>

            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
              Critical
            </span>
          </div>

        </div>

      </div>

    </div>
  );
};

export default Dashboard;