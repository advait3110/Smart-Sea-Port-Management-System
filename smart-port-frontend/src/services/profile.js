// =========================================================
// MY PROFILE (profile picture, phone number)
// =========================================================
//
// Shared by the top bar, My Profile, Account Settings and
// Security. The picture and the phone number are saved by the
// FastAPI backend (GET/PUT /users/me/profile, PUT/DELETE
// /users/me/avatar), so they follow the employee to every
// computer.
//
// When the profile changes, the page sends the
// "singapore-profile-changed" event, so the top bar shows the
// new picture and name at once.

import { apiGet } from "services/api";

export const PROFILE_EVENT = "singapore-profile-changed";

// The picture is shrunk to a small square before it is sent.
export const AVATAR_SIZE = 256;

// The biggest file the person can choose (before it is shrunk).
export const MAX_PICTURE_FILE_BYTES = 10 * 1024 * 1024;

export const PICTURE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

// The backend answer -> what the pages use.
export const normalizeProfile = (data) => ({
  id: data?.id ?? null,
  name: data?.name || "",
  adminId: data?.admin_id || "",
  role: data?.role || "",
  isActive: data?.is_active !== false,
  phone: data?.phone || "",
  avatar: data?.avatar || "",
});

export const loadMyProfile = async () =>
  normalizeProfile(await apiGet("/users/me/profile"));

// Tells the other parts of the page (the top bar) that the
// profile has changed.
export const announceProfile = (profile) => {
  try {
    window.dispatchEvent(
      new CustomEvent(PROFILE_EVENT, { detail: profile })
    );
  } catch {
    // Not important.
  }
};

// "John Doe" -> "JD", "Aisha" -> "AI", nothing -> "PU".
export const initialsOf = (name) => {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "PU";
  }

  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }

  return (
    words[0][0] + words[words.length - 1][0]
  ).toUpperCase();
};

// Reads a chosen picture file and returns it as a small square
// JPEG "data:image/jpeg;base64,..." text, ready to be sent.
// A problem is an Error with a readable message.
export const pictureToAvatar = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Please choose a picture."));
      return;
    }

    if (!PICTURE_TYPES.includes(file.type)) {
      reject(
        new Error(
          "Please choose a JPG, PNG or WebP picture."
        )
      );
      return;
    }

    if (file.size > MAX_PICTURE_FILE_BYTES) {
      reject(
        new Error(
          "This picture is too big. Please choose one smaller than 10 MB."
        )
      );
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      try {
        const width = image.naturalWidth;
        const height = image.naturalHeight;

        if (!width || !height) {
          throw new Error("empty picture");
        }

        // The biggest centred square of the picture.
        const side = Math.min(width, height);
        const left = (width - side) / 2;
        const top = (height - side) / 2;

        const canvas = document.createElement("canvas");

        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;

        const context = canvas.getContext("2d");

        // A see-through PNG gets a white background in a JPEG.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);

        context.drawImage(
          image,
          left,
          top,
          side,
          side,
          0,
          0,
          AVATAR_SIZE,
          AVATAR_SIZE
        );

        resolve(canvas.toDataURL("image/jpeg", 0.86));
      } catch {
        reject(
          new Error(
            "This picture could not be read. Please choose another one."
          )
        );
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);

      reject(
        new Error(
          "This picture could not be read. Please choose another one."
        )
      );
    };

    image.src = url;
  });