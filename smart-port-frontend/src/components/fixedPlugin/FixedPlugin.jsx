/* eslint-disable */

import React from "react";

import { RiMoonFill, RiSunFill } from "react-icons/ri";

export default function FixedPlugin(props) {
  const { ...rest } = props;

  // =========================================================
  // GET SAVED THEME
  // =========================================================
  //
  // If the user has previously selected a theme:
  //   "dark"  -> Dark Mode
  //   "light" -> Light Mode
  //
  // If nothing has been saved yet, Dark Mode is used.
  //
  const getInitialTheme = () => {
    const savedTheme = localStorage.getItem("karwar-port-theme");

    if (savedTheme === "light") {
      return false;
    }

    return true;
  };

  const [darkmode, setDarkmode] = React.useState(getInitialTheme);


  // =========================================================
  // APPLY THEME
  // =========================================================

  React.useEffect(() => {
    if (darkmode) {
      // Dark mode
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");

      // Remember user's choice
      localStorage.setItem("karwar-port-theme", "dark");
    } else {
      // Light mode
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");

      // Remember user's choice
      localStorage.setItem("karwar-port-theme", "light");
    }
  }, [darkmode]);


  // =========================================================
  // THEME TOGGLE
  // =========================================================

  const toggleTheme = () => {
    setDarkmode((previousTheme) => !previousTheme);
  };


  // =========================================================
  // BUTTON
  // =========================================================

  return (
    <button
      {...rest}
      type="button"
      onClick={toggleTheme}
      className="fixed bottom-8 right-8 z-[999] flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-500 shadow-lg transition-all duration-200 hover:scale-105 dark:bg-navy-800 dark:text-white"
      aria-label="Toggle theme"
      title={darkmode ? "Switch to light mode" : "Switch to dark mode"}
    >
      {darkmode ? (
        <RiSunFill className="h-6 w-6" />
      ) : (
        <RiMoonFill className="h-6 w-6" />
      )}
    </button>
  );
}