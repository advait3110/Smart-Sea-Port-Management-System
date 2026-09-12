import React from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  ZoomControl,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  MdDirectionsBoat,
  MdAnchor,
  MdLocalShipping,
  MdWarning,
  MdSearch,
  MdRefresh,
  MdLayers,
  MdMap,
  MdSatellite,
  MdSpeed,
  MdAccessTime,
  MdNavigation,
  MdInfoOutline,
  MdClose,
} from "react-icons/md";

/*
=========================================================
KARWAR PORT SMART SEA PORT MANAGEMENT & MONITORING SYSTEM
=========================================================

Live operational map prototype.

IMPORTANT:
The vessel / berth / gate coordinates below are
DEMONSTRATION coordinates.

They are positioned to visually represent the
Karwar Port / Baithkol harbour layout.

They are NOT verified berth-level survey coordinates.

Future production architecture:

AIS
 ↓
FastAPI
 ↓
PostgreSQL
 ↓
React / Leaflet

=========================================================
*/


// =========================================================
// KARWAR PORT MAP CENTER
// =========================================================

const KARWAR_PORT = [14.80048, 74.11536];


// =========================================================
// CUSTOM MAP ICON
// =========================================================

const createIcon = (
  backgroundColor,
  content,
  contentType = "text"
) => {
  return L.divIcon({
    className: "port-map-marker",

    html: `
      <div
        style="
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: ${backgroundColor};
          border: 3px solid white;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: ${
            contentType === "text"
              ? "17px"
              : "19px"
          };
          font-weight: 700;
          line-height: 1;
        "
      >
        ${content}
      </div>
    `,

    iconSize: [42, 42],

    iconAnchor: [21, 21],

    popupAnchor: [0, -22],
  });
};


// =========================================================
// MAP ICONS
// =========================================================

const vesselIcon = createIcon(
  "#2563eb",
  "🚢",
  "emoji"
);

const berthOccupiedIcon = createIcon(
  "#ef4444",
  "⚓",
  "emoji"
);

const berthAvailableIcon = createIcon(
  "#22c55e",
  "⚓",
  "emoji"
);

const berthMaintenanceIcon = createIcon(
  "#f97316",
  "⚓",
  "emoji"
);

const gateIcon = createIcon(
  "#7c3aed",
  "🚚",
  "emoji"
);

const alertIcon = createIcon(
  "#dc2626",
  "!"
);

const anchorageIcon = createIcon(
  "#0891b2",
  "⚓",
  "emoji"
);


// =========================================================
// DEMONSTRATION VESSEL DATA
// =========================================================
//
// IMPORTANT:
// Berth vessels are placed immediately beside the
// water-side berth positions.
//
// The vessels are NOT placed deep inside the water.
//
// The third vessel represents an approaching vessel.
//

const vessels = [
  {
    id: "V001",

    name: "MV Karwar Star",

    status: "At Berth",

    berth: "Berth 01",

    cargo: "Bulk Cargo",

    speed: "0 knots",

    destination: "Karwar Port",

    eta: "09:30 AM",

    heading: "180°",

    /*
    Vessel is positioned on the water side
    immediately alongside Berth 01.
    */
    position: [14.80005, 74.11472],
  },

  {
    id: "V002",

    name: "MV Ocean Pearl",

    status: "At Berth",

    berth: "Berth 02",

    cargo: "General Cargo",

    speed: "0 knots",

    destination: "Karwar Port",

    eta: "11:15 AM",

    heading: "90°",

    /*
    Vessel is positioned alongside Berth 02.
    */
    position: [14.79972, 74.11488],
  },

  {
    id: "V003",

    name: "MV Coastal Trader",

    status: "Approaching",

    berth: "Pending",

    cargo: "Bulk Cargo",

    speed: "3.2 knots",

    destination: "Karwar Port",

    eta: "02:30 PM",

    heading: "225°",

    /*
    Approaching the harbour / port entrance.
    */
    position: [14.80118, 74.11372],
  },
];


// =========================================================
// DEMONSTRATION BERTH DATA
// =========================================================
//
// A berth is NOT placed inside the land.
//
// These berth markers represent the water-side positions
// immediately adjacent to the quay/wharf where vessels
// are moored.
//
// Karwar Port has an existing two-berth wharf.
//
// B03/B04 are retained as demonstration infrastructure
// for the capstone UI.
//
// Exact berth coordinates should later be replaced with
// verified port GIS data.
//

const berths = [
  {
    id: "B01",

    name: "Berth 01",

    status: "Occupied",

    vessel: "MV Karwar Star",

    /*
    Water-side position immediately adjacent to quay.
    */
    position: [14.80335, 74.11345],
  },

  {
    id: "B02",

    name: "Berth 02",

    status: "Occupied",

    vessel: "MV Ocean Pearl",

    /*
    Water-side position immediately adjacent to quay.
    */
    position: [14.80400, 74.11405],
  },

  {
    id: "B03",

    name: "Berth 03",

    status: "Available",

    vessel: "None",

    position: [14.79934, 74.11502],
  },

  {
    id: "B04",

    name: "Berth 04",

    status: "Maintenance",

    vessel: "None",

    position: [14.79902, 74.11518],
  },
];


// =========================================================
// DEMONSTRATION GATE DATA
// =========================================================
//
// Gates remain on the land-side operational area.
//

const gates = [
  {
    id: "G01",

    name: "Main Port Gate",

    status: "Open",

    vehicles: 124,

    queue: 8,

    position: [14.79892, 74.11608],
  },

  {
    id: "G02",

    name: "Cargo Gate",

    status: "Open",

    vehicles: 86,

    queue: 4,

    position: [14.79910, 74.11642],
  },
];


// =========================================================
// DEMONSTRATION ALERT DATA
// =========================================================

const alerts = [
  {
    id: "A01",

    title: "Berth Maintenance",

    severity: "Critical",

    description:
      "Berth 04 is currently unavailable.",

    position: [14.79902, 74.11518],
  },

  {
    id: "A02",

    title: "Vessel Operation Delay",

    severity: "Attention",

    description:
      "Operational review required for vessel movement.",

    position: [14.80118, 74.11372],
  },
];


// =========================================================
// MAP RECENTER COMPONENT
// =========================================================

const RecenterMap = ({ position }) => {
  const map = useMap();

  React.useEffect(() => {
    if (!position) {
      return;
    }

    /*
    Keep the operational map visible.

    We intentionally use zoom 15.8 rather than zooming
    extremely close to the selected vessel.
    */

    map.flyTo(position, 15.8, {
      duration: 0.8,
    });
  }, [position, map]);

  return null;
};


// =========================================================
// BERTH ICON HELPER
// =========================================================

const getBerthIcon = (status) => {
  if (status === "Occupied") {
    return berthOccupiedIcon;
  }

  if (status === "Maintenance") {
    return berthMaintenanceIcon;
  }

  return berthAvailableIcon;
};


// =========================================================
// BERTH STATUS COLOR
// =========================================================

const getBerthStatusClass = (status) => {
  if (status === "Occupied") {
    return "text-red-500";
  }

  if (status === "Maintenance") {
    return "text-orange-500";
  }

  return "text-green-500";
};


// =========================================================
// VESSEL STATUS COLOR
// =========================================================

const getVesselStatusClass = (status) => {
  if (status === "At Berth") {
    return "text-green-500";
  }

  if (
    status === "Approaching" ||
    status === "At Anchorage"
  ) {
    return "text-blue-500";
  }

  return "text-orange-500";
};


// =========================================================
// MAIN PORT MAP
// =========================================================

const PortMap = () => {

  const [search, setSearch] =
    React.useState("");

  const [showVessels, setShowVessels] =
    React.useState(true);

  const [showBerths, setShowBerths] =
    React.useState(true);

  const [showGates, setShowGates] =
    React.useState(true);

  const [showAlerts, setShowAlerts] =
    React.useState(true);

  const [showAnchorage, setShowAnchorage] =
    React.useState(true);

  const [mapType, setMapType] =
    React.useState("satellite");

  const [selectedPosition, setSelectedPosition] =
    React.useState(KARWAR_PORT);

  const [selectedVessel, setSelectedVessel] =
    React.useState(null);


  // =======================================================
  // SEARCH
  // =======================================================

  const handleSearch = (event) => {

    const value =
      event.target.value;

    setSearch(value);

    const searchValue =
      value.toLowerCase().trim();


    if (!searchValue) {

      setSelectedPosition(
        KARWAR_PORT
      );

      setSelectedVessel(null);

      return;
    }


    // -----------------------------------------------------
    // SEARCH VESSELS
    // -----------------------------------------------------

    const vessel =
      vessels.find(
        (item) =>
          item.name
            .toLowerCase()
            .includes(searchValue) ||

          item.id
            .toLowerCase()
            .includes(searchValue) ||

          item.status
            .toLowerCase()
            .includes(searchValue)
      );


    if (vessel) {

      setSelectedPosition(
        vessel.position
      );

      setSelectedVessel(vessel);

      return;
    }


    // -----------------------------------------------------
    // SEARCH BERTHS
    // -----------------------------------------------------

    const berth =
      berths.find(
        (item) =>
          item.name
            .toLowerCase()
            .includes(searchValue) ||

          item.id
            .toLowerCase()
            .includes(searchValue) ||

          item.status
            .toLowerCase()
            .includes(searchValue)
      );


    if (berth) {

      setSelectedPosition(
        berth.position
      );

      setSelectedVessel(null);

      return;
    }


    // -----------------------------------------------------
    // SEARCH GATES
    // -----------------------------------------------------

    const gate =
      gates.find(
        (item) =>
          item.name
            .toLowerCase()
            .includes(searchValue) ||

          item.id
            .toLowerCase()
            .includes(searchValue) ||

          item.status
            .toLowerCase()
            .includes(searchValue)
      );


    if (gate) {

      setSelectedPosition(
        gate.position
      );

      setSelectedVessel(null);

      return;
    }


    // -----------------------------------------------------
    // SEARCH ALERTS
    // -----------------------------------------------------

    const alert =
      alerts.find(
        (item) =>
          item.title
            .toLowerCase()
            .includes(searchValue) ||

          item.severity
            .toLowerCase()
            .includes(searchValue)
      );


    if (alert) {

      setSelectedPosition(
        alert.position
      );

      setSelectedVessel(null);
    }
  };


  // =======================================================
  // RESET MAP
  // =======================================================

  const handleReset = () => {

    setSearch("");

    setSelectedPosition(
      KARWAR_PORT
    );

    setSelectedVessel(null);
  };


  // =======================================================
  // SELECT VESSEL
  // =======================================================

  const handleVesselSelect = (
    vessel
  ) => {

    setSelectedVessel(vessel);

    setSelectedPosition(
      vessel.position
    );
  };


  // =======================================================
  // OPERATIONAL VALUES
  // =======================================================

  const occupiedBerths =
    berths.filter(
      (berth) =>
        berth.status ===
        "Occupied"
    ).length;


  const availableBerths =
    berths.filter(
      (berth) =>
        berth.status ===
        "Available"
    ).length;


  const maintenanceBerths =
    berths.filter(
      (berth) =>
        berth.status ===
        "Maintenance"
    ).length;


  const totalGateQueue =
    gates.reduce(
      (total, gate) =>
        total + gate.queue,
      0
    );


  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div className="mt-3">

      {/* =================================================
          CUSTOM STYLES
          ================================================= */}

      <style>
        {`
          .port-map-scrollbar::-webkit-scrollbar {
            width: 7px;
            height: 7px;
          }

          .port-map-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }

          .port-map-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(99, 102, 241, 0.35);
            border-radius: 999px;
          }

          .port-map-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(99, 102, 241, 0.65);
          }

          .port-map-scrollbar {
            scrollbar-width: thin;
            scrollbar-color:
              rgba(99, 102, 241, 0.45)
              transparent;
          }

          .leaflet-popup-content-wrapper {
            border-radius: 12px;
          }

          .leaflet-popup-content {
            margin: 0;
          }

          .leaflet-container {
            font-family: inherit;
          }

          .port-vessel-popup .leaflet-popup-content-wrapper {
            border-radius: 12px;
            overflow: hidden;
          }

          .port-vessel-popup .leaflet-popup-tip {
            background: white;
          }
        `}
      </style>


      {/* =================================================
          SEARCH BAR ONLY
          =================================================

          IMPORTANT:

          The parent Horizon layout already displays:

              Live Port Map

          Therefore the duplicate internal:

              Live Port Map

          heading has been completely removed.
          ================================================= */}

      <div className="mb-5 flex justify-end">

        <div className="flex w-full gap-2 lg:w-[430px]">

          <div className="flex flex-1 items-center rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-navy-800">

            <MdSearch className="mr-2 h-5 w-5 text-gray-400" />

            <input
              type="text"
              value={search}
              onChange={handleSearch}
              placeholder="Search vessel, berth or gate..."
              className="w-full bg-transparent text-sm font-medium text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
            />


            {search && (

              <button
                type="button"
                onClick={() => {

                  setSearch("");

                  setSelectedPosition(
                    KARWAR_PORT
                  );

                  setSelectedVessel(
                    null
                  );
                }}
                className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-navy-700"
              >

                <MdClose className="h-4 w-4" />

              </button>

            )}

          </div>


          <button
            type="button"
            onClick={handleReset}
            title="Reset map"
            className="flex items-center justify-center rounded-xl bg-white px-4 text-navy-700 shadow-sm transition hover:bg-gray-100 dark:bg-navy-800 dark:text-white dark:hover:bg-navy-700"
          >

            <MdRefresh className="h-5 w-5" />

          </button>

        </div>

      </div>


      {/* =================================================
          OPERATIONAL SUMMARY
          ================================================= */}

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">

        {/* VESSELS */}

        <div className="rounded-[20px] bg-white p-4 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-500/10">

              <MdDirectionsBoat className="h-5 w-5" />

            </div>


            <div>

              <p className="text-xs text-gray-400">
                Vessels
              </p>

              <p className="text-xl font-bold text-navy-700 dark:text-white">
                {vessels.length}
              </p>

            </div>

          </div>

        </div>


        {/* OCCUPIED BERTHS */}

        <div className="rounded-[20px] bg-white p-4 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">

              <MdAnchor className="h-5 w-5" />

            </div>


            <div>

              <p className="text-xs text-gray-400">
                Occupied Berths
              </p>

              <p className="text-xl font-bold text-navy-700 dark:text-white">
                {occupiedBerths}
              </p>

            </div>

          </div>

        </div>


        {/* GATE QUEUE */}

        <div className="rounded-[20px] bg-white p-4 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-500 dark:bg-purple-500/10">

              <MdLocalShipping className="h-5 w-5" />

            </div>


            <div>

              <p className="text-xs text-gray-400">
                Gate Queue
              </p>

              <p className="text-xl font-bold text-navy-700 dark:text-white">
                {totalGateQueue}
              </p>

            </div>

          </div>

        </div>


        {/* ALERTS */}

        <div className="rounded-[20px] bg-white p-4 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-500/10">

              <MdWarning className="h-5 w-5" />

            </div>


            <div>

              <p className="text-xs text-gray-400">
                Map Alerts
              </p>

              <p className="text-xl font-bold text-navy-700 dark:text-white">
                {alerts.length}
              </p>

            </div>

          </div>

        </div>

      </div>


      {/* =================================================
          COMPACT SELECTED VESSEL PANEL
          =================================================

          IMPORTANT:

          Previously this was:

              w-full

          which created the very long horizontal panel.

          Now it is:

              max-w-[560px]

          and remains compact.
          ================================================= */}

      {selectedVessel && (

        <div className="mb-5 w-full max-w-[560px] rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 shadow-sm dark:border-blue-500/20 dark:bg-navy-800">

          <div className="flex items-center gap-4">

            {/* VESSEL */}

            <div className="flex min-w-0 flex-1 items-center gap-3">

              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">

                <MdDirectionsBoat className="h-5 w-5" />

              </div>


              <div className="min-w-0">

                <p className="text-[9px] font-medium uppercase tracking-wide text-blue-400">
                  Selected Vessel
                </p>

                <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                  {selectedVessel.name}
                </p>

              </div>

            </div>


            {/* STATUS */}

            <div className="hidden sm:block">

              <p className="text-[8px] uppercase text-gray-400">
                Status
              </p>

              <p
                className={`text-[11px] font-bold ${getVesselStatusClass(
                  selectedVessel.status
                )}`}
              >
                {selectedVessel.status}
              </p>

            </div>


            {/* SPEED */}

            <div className="hidden sm:block">

              <p className="text-[8px] uppercase text-gray-400">
                Speed
              </p>

              <p className="text-[11px] font-bold text-navy-700 dark:text-white">
                {selectedVessel.speed}
              </p>

            </div>


            {/* ETA */}

            <div>

              <p className="text-[8px] uppercase text-gray-400">
                ETA
              </p>

              <p className="text-[11px] font-bold text-navy-700 dark:text-white">
                {selectedVessel.eta}
              </p>

            </div>

          </div>

        </div>

      )}


      {/* =================================================
          MAP
          ================================================= */}

      <div className="relative overflow-hidden rounded-[20px] bg-white shadow-sm dark:bg-navy-800">


        {/* =================================================
            MAP LAYERS
            ================================================= */}

        <div className="absolute left-4 top-4 z-[1000] w-[230px] rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur dark:bg-navy-800/95">

          <div className="mb-3 flex items-center gap-2">

            <MdLayers className="h-5 w-5 text-brand-500" />

            <p className="font-bold text-navy-700 dark:text-white">
              Map Layers
            </p>

          </div>


          {/* VESSELS */}

          <label className="mb-3 flex cursor-pointer items-center justify-between">

            <div className="flex items-center gap-2">

              <span className="text-lg">
                🚢
              </span>

              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Vessels
              </span>

            </div>


            <input
              type="checkbox"
              checked={showVessels}
              onChange={(e) =>
                setShowVessels(
                  e.target.checked
                )
              }
              className="h-4 w-4 accent-indigo-600"
            />

          </label>


          {/* BERTHS */}

          <label className="mb-3 flex cursor-pointer items-center justify-between">

            <div className="flex items-center gap-2">

              <span className="text-lg">
                ⚓
              </span>

              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Berths
              </span>

            </div>


            <input
              type="checkbox"
              checked={showBerths}
              onChange={(e) =>
                setShowBerths(
                  e.target.checked
                )
              }
              className="h-4 w-4 accent-indigo-600"
            />

          </label>


          {/* GATES */}

          <label className="mb-3 flex cursor-pointer items-center justify-between">

            <div className="flex items-center gap-2">

              <span className="text-lg">
                🚚
              </span>

              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Gates
              </span>

            </div>


            <input
              type="checkbox"
              checked={showGates}
              onChange={(e) =>
                setShowGates(
                  e.target.checked
                )
              }
              className="h-4 w-4 accent-indigo-600"
            />

          </label>


          {/* ALERTS */}

          <label className="mb-3 flex cursor-pointer items-center justify-between">

            <div className="flex items-center gap-2">

              <span className="text-lg">
                ⚠️
              </span>

              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Alerts
              </span>

            </div>


            <input
              type="checkbox"
              checked={showAlerts}
              onChange={(e) =>
                setShowAlerts(
                  e.target.checked
                )
              }
              className="h-4 w-4 accent-indigo-600"
            />

          </label>


          {/* ANCHORAGE */}

          <label className="flex cursor-pointer items-center justify-between">

            <div className="flex items-center gap-2">

              <span className="text-lg">
                ⚓
              </span>

              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Anchorage
              </span>

            </div>


            <input
              type="checkbox"
              checked={showAnchorage}
              onChange={(e) =>
                setShowAnchorage(
                  e.target.checked
                )
              }
              className="h-4 w-4 accent-indigo-600"
            />

          </label>

        </div>


        {/* =================================================
            MAP TYPE
            ================================================= */}

        <div className="absolute right-4 top-4 z-[1000] overflow-hidden rounded-xl bg-white/95 p-1 shadow-xl backdrop-blur dark:bg-navy-800/95">

          <div className="flex items-center gap-1">

            <button
              type="button"
              onClick={() =>
                setMapType("default")
              }
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
                mapType === "default"
                  ? "bg-brand-500 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-navy-700"
              }`}
            >

              <MdMap className="h-4 w-4" />

              Default

            </button>


            <button
              type="button"
              onClick={() =>
                setMapType("satellite")
              }
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
                mapType === "satellite"
                  ? "bg-brand-500 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-navy-700"
              }`}
            >

              <MdSatellite className="h-4 w-4" />

              Satellite

            </button>

          </div>

        </div>


        {/* =================================================
            LEAFLET MAP
            ================================================= */}

        <MapContainer
          center={KARWAR_PORT}
          zoom={16}
          scrollWheelZoom={true}
          zoomControl={false}
          className="h-[650px] w-full"
        >

          <ZoomControl
            position="bottomright"
          />


          {/* DEFAULT MAP */}

          {mapType === "default" && (

            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

          )}


          {/* SATELLITE MAP */}

          {mapType === "satellite" && (

            <TileLayer
              attribution="&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />

          )}


          {/* RECENTER */}

          <RecenterMap
            position={selectedPosition}
          />


          {/* =================================================
              OPERATIONAL AREA
              ================================================= */}

          <Circle
            center={KARWAR_PORT}
            radius={300}
            pathOptions={{
              color: "#6366f1",
              fillColor: "#6366f1",
              fillOpacity: 0.04,
              weight: 2,
            }}
          />


          {/* =================================================
              VESSELS
              ================================================= */}

          {showVessels &&
            vessels.map(
              (vessel) => (

                <Marker
                  key={vessel.id}
                  position={vessel.position}
                  icon={vesselIcon}
                  eventHandlers={{
                    click: () =>
                      handleVesselSelect(
                        vessel
                      ),
                  }}
                >

                  {/* -----------------------------------------
                      COMPACT VESSEL POPUP
                      ----------------------------------------- */}

                  <Popup
                    className="port-vessel-popup"
                    maxWidth={210}
                    minWidth={190}
                    autoPan={true}
                    autoPanPadding={[
                      20,
                      20,
                    ]}
                  >

                    <div className="w-[190px] p-3">

                      {/* HEADER */}

                      <div className="flex items-center gap-2">

                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">

                          <MdDirectionsBoat className="h-4 w-4" />

                        </div>


                        <div className="min-w-0">

                          <h3 className="truncate text-sm font-bold text-gray-800">
                            {vessel.name}
                          </h3>

                          <p className="text-[9px] text-gray-400">
                            Vessel ID: {vessel.id}
                          </p>

                        </div>

                      </div>


                      {/* BASIC INFORMATION */}

                      <div className="mt-3 grid grid-cols-2 gap-2">

                        <div className="rounded-md bg-gray-50 p-2">

                          <p className="text-[8px] uppercase text-gray-400">
                            Status
                          </p>

                          <p
                            className={`mt-1 text-[10px] font-bold ${getVesselStatusClass(
                              vessel.status
                            )}`}
                          >
                            {vessel.status}
                          </p>

                        </div>


                        <div className="rounded-md bg-gray-50 p-2">

                          <p className="text-[8px] uppercase text-gray-400">
                            Berth
                          </p>

                          <p className="mt-1 truncate text-[10px] font-bold text-gray-700">
                            {vessel.berth}
                          </p>

                        </div>


                        <div className="rounded-md bg-gray-50 p-2">

                          <p className="text-[8px] uppercase text-gray-400">
                            Speed
                          </p>

                          <p className="mt-1 text-[10px] font-bold text-gray-700">
                            {vessel.speed}
                          </p>

                        </div>


                        <div className="rounded-md bg-gray-50 p-2">

                          <p className="text-[8px] uppercase text-gray-400">
                            Heading
                          </p>

                          <p className="mt-1 text-[10px] font-bold text-gray-700">
                            {vessel.heading}
                          </p>

                        </div>

                      </div>


                      {/* ADDITIONAL INFORMATION */}

                      <div className="mt-3 space-y-1 text-[10px] text-gray-500">

                        <p>
                          <strong>Cargo:</strong>{" "}
                          {vessel.cargo}
                        </p>

                        <p>
                          <strong>ETA:</strong>{" "}
                          {vessel.eta}
                        </p>

                      </div>


                      {/* BUTTON */}

                      <button
                        type="button"
                        onClick={() =>
                          handleVesselSelect(
                            vessel
                          )
                        }
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-2 py-2 text-[10px] font-bold text-white transition hover:bg-indigo-700"
                      >

                        <MdInfoOutline className="h-3.5 w-3.5" />

                        Vessel Details

                      </button>

                    </div>

                  </Popup>

                </Marker>

              )
            )}


          {/* =================================================
              BERTHS
              ================================================= */}

          {showBerths &&
            berths.map(
              (berth) => (

                <Marker
                  key={berth.id}
                  position={berth.position}
                  icon={getBerthIcon(
                    berth.status
                  )}
                >

                  <Popup
                    maxWidth={210}
                    minWidth={190}
                  >

                    <div className="w-[190px] p-3">

                      <div className="flex items-center gap-2">

                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">

                          <MdAnchor className="h-4 w-4 text-gray-600" />

                        </div>


                        <div>

                          <h3 className="text-sm font-bold text-gray-800">
                            {berth.name}
                          </h3>

                          <p className="text-[9px] text-gray-400">
                            Berth ID: {berth.id}
                          </p>

                        </div>

                      </div>


                      <p
                        className={`mt-3 text-xs font-bold ${getBerthStatusClass(
                          berth.status
                        )}`}
                      >
                        {berth.status}
                      </p>


                      <div className="mt-2 rounded-md bg-gray-50 p-2 text-[10px] text-gray-600">

                        <p>
                          <strong>Vessel:</strong>{" "}
                          {berth.vessel}
                        </p>

                      </div>


                      <button
                        type="button"
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-2 py-2 text-[10px] font-bold text-white transition hover:bg-indigo-700"
                      >

                        <MdAnchor className="h-3.5 w-3.5" />

                        Berth Details

                      </button>

                    </div>

                  </Popup>

                </Marker>

              )
            )}


          {/* =================================================
              GATES
              ================================================= */}

          {showGates &&
            gates.map(
              (gate) => (

                <Marker
                  key={gate.id}
                  position={gate.position}
                  icon={gateIcon}
                >

                  <Popup
                    maxWidth={210}
                    minWidth={190}
                  >

                    <div className="w-[190px] p-3">

                      <div className="flex items-center gap-2">

                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-50 text-purple-600">

                          <MdLocalShipping className="h-4 w-4" />

                        </div>


                        <div>

                          <h3 className="text-sm font-bold text-gray-800">
                            {gate.name}
                          </h3>

                          <p className="text-[9px] text-gray-400">
                            Gate ID: {gate.id}
                          </p>

                        </div>

                      </div>


                      <p className="mt-3 text-xs font-bold text-green-500">
                        {gate.status}
                      </p>


                      <div className="mt-2 grid grid-cols-2 gap-2">

                        <div className="rounded-md bg-gray-50 p-2">

                          <p className="text-[8px] uppercase text-gray-400">
                            Vehicles
                          </p>

                          <p className="mt-1 text-sm font-bold text-gray-700">
                            {gate.vehicles}
                          </p>

                        </div>


                        <div className="rounded-md bg-gray-50 p-2">

                          <p className="text-[8px] uppercase text-gray-400">
                            Queue
                          </p>

                          <p className="mt-1 text-sm font-bold text-purple-600">
                            {gate.queue}
                          </p>

                        </div>

                      </div>


                      <button
                        type="button"
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-2 py-2 text-[10px] font-bold text-white transition hover:bg-indigo-700"
                      >

                        <MdLocalShipping className="h-3.5 w-3.5" />

                        Gate Details

                      </button>

                    </div>

                  </Popup>

                </Marker>

              )
            )}


          {/* =================================================
              PORT APPROACH
              ================================================= */}

          {showAnchorage && (

            <Marker
              position={[
                14.80118,
                74.11372,
              ]}
              icon={anchorageIcon}
            >

              <Popup
                maxWidth={210}
                minWidth={190}
              >

                <div className="w-[190px] p-3">

                  <div className="flex items-center gap-2">

                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">

                      <MdAnchor className="h-4 w-4" />

                    </div>


                    <div>

                      <h3 className="text-sm font-bold text-gray-800">
                        Port Approach
                      </h3>

                      <p className="text-[9px] text-gray-400">
                        Vessel approach area
                      </p>

                    </div>

                  </div>


                  <p className="mt-3 text-[10px] leading-4 text-gray-600">

                    Vessel approaching Karwar
                    Port for berth allocation.

                  </p>


                  <p className="mt-2 text-[10px] font-bold text-blue-500">

                    1 vessel approaching

                  </p>

                </div>

              </Popup>

            </Marker>

          )}


          {/* =================================================
              ALERTS
              ================================================= */}

          {showAlerts &&
            alerts.map(
              (alert) => (

                <Marker
                  key={alert.id}
                  position={alert.position}
                  icon={alertIcon}
                >

                  <Popup
                    maxWidth={210}
                    minWidth={190}
                  >

                    <div className="w-[190px] p-3">

                      <div className="flex items-center gap-2">

                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600">

                          <MdWarning className="h-4 w-4" />

                        </div>


                        <div>

                          <h3 className="text-sm font-bold text-gray-800">
                            {alert.title}
                          </h3>

                          <p className="text-[9px] text-gray-400">
                            Operational alert
                          </p>

                        </div>

                      </div>


                      <p className="mt-3 text-xs font-bold text-red-500">
                        {alert.severity}
                      </p>


                      <p className="mt-2 text-[10px] leading-4 text-gray-600">
                        {alert.description}
                      </p>

                    </div>

                  </Popup>

                </Marker>

              )
            )}

        </MapContainer>


        {/* =================================================
            OPERATIONAL LEGEND
            ================================================= */}

        <div className="absolute bottom-5 left-5 z-[1000] rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur dark:bg-navy-800/95">

          <p className="mb-3 text-sm font-bold text-navy-700 dark:text-white">
            Operational Legend
          </p>


          <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs text-gray-600 dark:text-gray-300">

            <div className="flex items-center gap-2">

              <span className="h-3 w-3 rounded-full bg-green-500" />

              Available

            </div>


            <div className="flex items-center gap-2">

              <span className="h-3 w-3 rounded-full bg-red-500" />

              Occupied

            </div>


            <div className="flex items-center gap-2">

              <span className="h-3 w-3 rounded-full bg-orange-500" />

              Maintenance

            </div>


            <div className="flex items-center gap-2">

              <span className="h-3 w-3 rounded-full bg-blue-500" />

              Vessel

            </div>


            <div className="flex items-center gap-2">

              <span className="h-3 w-3 rounded-full bg-purple-500" />

              Gate

            </div>


            <div className="flex items-center gap-2">

              <span className="h-3 w-3 rounded-full bg-red-600" />

              Alert

            </div>

          </div>

        </div>


        {/* =================================================
            MAP STATUS
            ================================================= */}

        <div className="absolute bottom-5 right-5 z-[1000] hidden rounded-xl bg-white/95 px-4 py-3 shadow-xl backdrop-blur dark:bg-navy-800/95 md:block">

          <div className="flex items-center gap-2">

            <span className="relative flex h-3 w-3">

              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />

              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />

            </span>


            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              Map system active
            </span>

          </div>

        </div>

      </div>


      {/* =================================================
          BERTH STATUS SUMMARY
          ================================================= */}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* OCCUPIED */}

        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">

              <MdAnchor className="h-5 w-5" />

            </div>


            <div>

              <p className="text-xs text-gray-400">
                Occupied
              </p>

              <p className="text-xl font-bold text-navy-700 dark:text-white">
                {occupiedBerths}
              </p>

            </div>

          </div>

        </div>


        {/* AVAILABLE */}

        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-500 dark:bg-green-500/10">

              <MdAnchor className="h-5 w-5" />

            </div>


            <div>

              <p className="text-xs text-gray-400">
                Available
              </p>

              <p className="text-xl font-bold text-navy-700 dark:text-white">
                {availableBerths}
              </p>

            </div>

          </div>

        </div>


        {/* MAINTENANCE */}

        <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-500/10">

              <MdWarning className="h-5 w-5" />

            </div>


            <div>

              <p className="text-xs text-gray-400">
                Maintenance
              </p>

              <p className="text-xl font-bold text-navy-700 dark:text-white">
                {maintenanceBerths}
              </p>

            </div>

          </div>

        </div>

      </div>


      {/* =================================================
          VESSEL TRACKING
          ================================================= */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">

          <div>

            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Vessel Tracking
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Demonstration vessel movement information.
            </p>

          </div>


          <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 dark:bg-green-500/10">

            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />

            <span className="text-xs font-semibold text-green-600 dark:text-green-400">
              Tracking Active
            </span>

          </div>

        </div>


        <div className="port-map-scrollbar mt-5 overflow-x-auto">

          <table className="w-full min-w-[850px]">

            <thead>

              <tr className="border-b border-gray-200 dark:border-white/10">

                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Vessel
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Status
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Berth
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Speed
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Heading
                </th>

                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  ETA
                </th>

                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">
                  Action
                </th>

              </tr>

            </thead>


            <tbody>

              {vessels.map(
                (vessel) => (

                  <tr
                    key={vessel.id}
                    className="border-b border-gray-100 last:border-0 dark:border-white/5"
                  >

                    <td className="px-4 py-4">

                      <div className="flex items-center gap-3">

                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-500/10">

                          <MdDirectionsBoat className="h-5 w-5" />

                        </div>


                        <div>

                          <p className="font-bold text-navy-700 dark:text-white">
                            {vessel.name}
                          </p>

                          <p className="text-xs text-gray-400">
                            {vessel.id}
                          </p>

                        </div>

                      </div>

                    </td>


                    <td className="px-4 py-4">

                      <span
                        className={`text-sm font-semibold ${getVesselStatusClass(
                          vessel.status
                        )}`}
                      >
                        {vessel.status}
                      </span>

                    </td>


                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {vessel.berth}
                    </td>


                    <td className="px-4 py-4">

                      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-300">

                        <MdSpeed className="h-4 w-4" />

                        {vessel.speed}

                      </div>

                    </td>


                    <td className="px-4 py-4">

                      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-300">

                        <MdNavigation className="h-4 w-4" />

                        {vessel.heading}

                      </div>

                    </td>


                    <td className="px-4 py-4">

                      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-300">

                        <MdAccessTime className="h-4 w-4" />

                        {vessel.eta}

                      </div>

                    </td>


                    <td className="px-4 py-4 text-right">

                      <button
                        type="button"
                        onClick={() =>
                          handleVesselSelect(
                            vessel
                          )
                        }
                        className="rounded-lg bg-lightPrimary px-3 py-2 text-xs font-bold text-brand-500 transition hover:bg-brand-500 hover:text-white dark:bg-navy-700"
                      >

                        Locate

                      </button>

                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
};

export default PortMap;