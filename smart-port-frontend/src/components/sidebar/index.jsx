/* eslint-disable */

import { HiX } from "react-icons/hi";
import Links from "./components/Links";
import karwarPortLogo from "assets/img/port/karwar-port-logo.png";
import SidebarCard from "components/sidebar/componentsrtl/SidebarCard";
import routes from "routes.js";

const Sidebar = ({ open, onClose }) => {
  return (
    <div
      className={`fixed left-0 top-0 z-50 flex h-screen w-[300px] flex-col overflow-y-auto bg-white pb-10 shadow-2xl shadow-white/5 transition-all duration-175 dark:bg-navy-800 dark:text-white xl:z-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Close button for mobile */}
      <span
        className="absolute right-4 top-4 z-10 block cursor-pointer xl:hidden"
        onClick={onClose}
      >
        <HiX className="h-6 w-6" />
      </span>

      {/* =====================================================
          KARWAR PORT BRANDING
          ===================================================== */}

      <a
        href="/auth/login"
        target="_blank"
        rel="noopener noreferrer"
        className="mx-[12px] mt-[20px] block h-[145px] flex-shrink-0 cursor-pointer"
        title="Open Karwar Port Login"
      >
        <div className="flex h-full items-center">

          <img
            src={karwarPortLogo}
            alt="Karwar Port"
            className="h-[155px] w-[155px] flex-shrink-0 -ml-[25px] object-contain"
          />

          <div className="ml-4 min-w-0 flex-1">
            <div className="whitespace-nowrap font-poppins text-[18px] font-bold uppercase leading-tight text-navy-700 dark:text-white">
              <b>KARWAR PORT</b>
            </div>

            <div className="mt-1 whitespace-nowrap font-poppins text-[9px] font-medium uppercase tracking-wide text-gray-400">
              SEA PORT MANAGEMENT
            </div>
          </div>

        </div>
      </a>

      {/* Divider */}
      <div className="mx-0 mt-[58px] mb-7 h-px flex-shrink-0 bg-gray-300 dark:bg-white/30" />

      {/* =====================================================
          NAVIGATION
          ===================================================== */}

      <ul className="mb-auto flex-shrink-0 pt-1">
        <Links routes={routes} />
      </ul>

      {/* =====================================================
          SIDEBAR CARD
          ===================================================== */}

      <div className="mt-6 flex flex-shrink-0 justify-center">
        <SidebarCard />
      </div>
    </div>
  );
};

export default Sidebar;