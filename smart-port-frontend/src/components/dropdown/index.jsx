import React from "react";

// =========================================================
// OUTSIDE CLICK HANDLER
// =========================================================

function useOutsideAlerter(ref, setOpen) {
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        ref.current &&
        !ref.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, [ref, setOpen]);
}

// =========================================================
// DROPDOWN
// =========================================================

const Dropdown = (props) => {
  const {
    button,
    children,
    classNames = "",
    animation = "",
  } = props;

  const wrapperRef = React.useRef(null);

  const [openWrapper, setOpenWrapper] =
    React.useState(false);

  // =======================================================
  // CLOSE WHEN CLICKING OUTSIDE
  // =======================================================

  useOutsideAlerter(
    wrapperRef,
    setOpenWrapper
  );

  // =======================================================
  // TOGGLE DROPDOWN
  // =======================================================

  const handleToggle = () => {
    setOpenWrapper(
      (previous) => !previous
    );
  };

  // =======================================================
  // CLOSE DROPDOWN
  // =======================================================

  const handleContentClick = () => {
    setOpenWrapper(false);
  };

  // =======================================================
  // KEYBOARD HANDLING
  // =======================================================

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      handleToggle();
    }

    if (event.key === "Escape") {
      setOpenWrapper(false);
    }
  };

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div
      ref={wrapperRef}
      className="relative flex"
    >

      {/* =================================================
          DROPDOWN TRIGGER
          ================================================= */}

      <div
        className="flex cursor-pointer"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={openWrapper}
      >
        {button}
      </div>

      {/* =================================================
          DROPDOWN CONTENT
          ================================================= */}

      <div
        className={`${classNames} absolute z-50 ${
          animation ||
          "origin-top-right transition-all duration-300 ease-in-out"
        } ${
          openWrapper
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-0 opacity-0"
        }`}
        onClick={handleContentClick}
      >
        {children}
      </div>

    </div>
  );
};

export default Dropdown;