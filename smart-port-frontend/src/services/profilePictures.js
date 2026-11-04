// =========================================================
// PROFILE PICTURES OF OTHER EMPLOYEES
// =========================================================
//
// The top bar shows only MY picture. The pages that list other
// employees (Port Communication, User & Role Management) use this
// file to show everyone's picture instead of only their initials.
//
// The pictures come from the FastAPI backend:
//
//     GET /profile-pictures  ->  {"pictures": {"3": "data:...", ...}}
//
// They are loaded once and shared by every page. They are loaded
// again:
// - when someone changes their own picture in this browser
//   (the "singapore-profile-changed" event), and
// - every 5 minutes while a page that uses them is open, so a
//   new picture uploaded by a colleague appears by itself. (Not
//   more often: every picture is downloaded each time, which is
//   slow on weak college Wi-Fi or mobile data.)
//
// Usage inside a component:
//
//     const pictures = useProfilePictures();
//     const src = pictures[String(userId)];   // "" when none
// =========================================================

import React from "react";

import { apiGet } from "./api";
import { PROFILE_EVENT } from "./profile";

const REFRESH_MS = 5 * 60 * 1000;

let pictures = {};
let loadedAt = 0;
let loading = null;
const listeners = new Set();

const tellListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener(pictures);
    } catch {
      // Not important.
    }
  });
};

const loadPictures = (force = false) => {
  if (!force && loadedAt && Date.now() - loadedAt < REFRESH_MS) {
    return Promise.resolve(pictures);
  }

  if (loading) {
    return loading;
  }

  loading = apiGet("/profile-pictures")
    .then((data) => {
      const next = data && typeof data.pictures === "object" && data.pictures
        ? data.pictures
        : {};

      pictures = next;
      loadedAt = Date.now();

      tellListeners();

      return pictures;
    })
    .catch(() => {
      // Keep the old pictures (or initials) when the server cannot
      // answer; it is tried again at the next refresh.
      return pictures;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
};

// My own picture changed in this browser: reload at once.
if (typeof window !== "undefined") {
  try {
    window.addEventListener(PROFILE_EVENT, () => {
      loadPictures(true);
    });
  } catch {
    // Not important.
  }
}

export const useProfilePictures = () => {
  const [current, setCurrent] = React.useState(pictures);

  React.useEffect(() => {
    listeners.add(setCurrent);

    loadPictures();

    const timer = window.setInterval(() => {
      loadPictures(true);
    }, REFRESH_MS);

    return () => {
      listeners.delete(setCurrent);
      window.clearInterval(timer);
    };
  }, []);

  return current;
};

// The picture of one employee, or "" when they have none.
export const pictureOf = (allPictures, userId) => {
  if (userId === null || userId === undefined || userId === "") {
    return "";
  }

  return (allPictures && allPictures[String(userId)]) || "";
};