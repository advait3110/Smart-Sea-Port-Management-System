/* eslint-disable */
import React from "react";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="z-[5] mx-auto flex w-full max-w-screen-sm flex-col items-center justify-between px-5 pb-4 lg:mb-6 lg:max-w-full lg:flex-row xl:mb-2 xl:w-[1310px] xl:pb-6">
      
      {/* Copyright */}
      <p className="mb-4 text-center text-sm text-gray-500 md:text-base lg:mb-0 lg:text-left lg:text-white">
        ©{year} Karwar Sea Port. All Rights Reserved by Govt. of Karnataka.
      </p>

      {/* Footer Links */}
      <nav>
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          
          <li>
            <a
              href="mailto:karwarport@karnataka.gov.in"
              className="text-sm text-gray-500 transition hover:text-indigo-400 md:text-base lg:text-white lg:hover:text-indigo-300"
            >
              Support
            </a>
          </li>

          <li>
            <button
              type="button"
              className="text-sm text-gray-500 transition hover:text-indigo-400 md:text-base lg:text-white lg:hover:text-indigo-300"
            >
              License
            </button>
          </li>

          <li>
            <button
              type="button"
              className="text-sm text-gray-500 transition hover:text-indigo-400 md:text-base lg:text-white lg:hover:text-indigo-300"
            >
              Terms of Use
            </button>
          </li>

        </ul>
      </nav>
    </footer>
  );
}