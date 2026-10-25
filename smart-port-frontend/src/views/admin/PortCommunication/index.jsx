import React from "react";

import { createPortal } from "react-dom";

import {
  MdSearch,
  MdSend,
  MdAttachFile,
  MdArrowBack,
  MdDoneAll,
  MdCheck,
  MdClose,
  MdInsertEmoticon,
  MdForum,
  MdGroup,
  MdAccessTime,
  MdErrorOutline,
  MdRefresh,
  MdKeyboardArrowDown,
  MdFileDownload,
  MdInsertDriveFile,
  MdPictureAsPdf,
  MdDescription,
  MdImage,
  MdArchive,
  MdGridOn,
  MdSlideshow,
  MdInfoOutline,
  MdDeleteOutline,
  MdRestoreFromTrash,
  MdMoreVert,
  MdBlock,
  MdDeleteSweep,
} from "react-icons/md";

import { apiGet, apiPost, apiDelete } from "../../../services/api";

import {
  playMessageBeep,
  setChatPageActive,
} from "../../../services/messageSound";

import { startPollTimer } from "../../../services/pollTimer";

// =========================================================
// PORT COMMUNICATION
// =========================================================
//
// A WhatsApp-style chat between the real port accounts.
//
// - One-to-one chats with every active employee
// - Channels (group chats) when the backend provides them
// - Documents and images (the paper-clip button)
// - Emoji picker
// - Unread counters that go down ONLY after the receiving
//   account opens the conversation
// - Sent / read ticks
// - Online / last seen
// - Delete a chat (only for me, the other person keeps it) and
//   restore it later from "Deleted & archived chats"
// - Delete one message (hover a message, click the arrow): "Delete for
//   me" or, for your own messages, "Delete for everyone" (the message
//   becomes "This message was deleted" for everybody)
// - "Delete all chats" (the three dots above the chat list)
// - Chats whose newest message is older than 6 months are moved to
//   "Deleted & archived chats" when the person logs in (the server
//   does this when the chat list loads); Restore brings them back
//
// The page talks to the backend with normal REST calls and
// refreshes itself every few seconds (no WebSocket needed).
//
// Backend endpoints used:
//   GET    /chat/conversations
//   POST   /chat/conversations                  { user_id }
//   GET    /chat/conversations/{id}/messages    ?after_id=
//   POST   /chat/conversations/{id}/messages    { text, attachment? }
//   POST   /chat/conversations/{id}/read        { last_message_id }
//   DELETE /chat/conversations                  delete ALL chats (for me)
//   DELETE /chat/conversations/{id}             delete for me only
//   DELETE /chat/conversations/{id}/messages/{message_id}?scope=me|everyone
//   POST   /chat/conversations/{id}/restore     bring it back
//   GET    /chat/archive                        deleted & archived chats
//   GET    /chat/attachments/{id}
//
// =========================================================

// =========================================================
// SETTINGS
// =========================================================

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const AUTO_PREVIEW_BYTES = 1.5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "zip",
];

const CONVERSATION_REFRESH_MS = 4000;

const MESSAGE_REFRESH_MS = 2500;

// The "Deleted & archived chats" list is checked now and then.
const ARCHIVE_REFRESH_MS = 30000;

// Width and height (pixels) of the little menu next to a message.
const MENU_WIDTH = 176;
const MENU_HEIGHT = 52;

const RECENT_EMOJI_KEY = "singaporePortRecentEmojis";

// Used by the navbar bell to open a specific chat.
const OPEN_CHAT_STORAGE_KEY = "singaporePortOpenChat";

const OPEN_CHAT_EVENT = "singapore-open-chat";

// Tells the navbar bell to re-read the unread count now.
const UNREAD_EVENT = "singapore-unread-refresh";

// =========================================================
// EMOJI
// =========================================================

const EMOJI_GROUPS = [
  {
    id: "smileys",
    label: "Smileys",
    icon: "😀",
    items:
      "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 😢 😭 😤 😠 😡 🤬 🤯 😳 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 😴 🤤 😪 😵 🤐 🤢 🤮 🤧 😷 🤒 🤕",
  },
  {
    id: "gestures",
    label: "Gestures",
    icon: "👍",
    items:
      "👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 ✍️ 💪 👏 🙌 👐 🤲 🤜 🤛 ✊ 👊 🙋 🙆 🙅 🙇 🤷 🤦 👀 👂 👃 🧠",
  },
  {
    id: "symbols",
    label: "Symbols",
    icon: "❤️",
    items:
      "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ ⭐ 🌟 💫 🔥 💥 💯 ✅ ❌ ⭕ ❗ ❓ ‼️ ⚠️ 🚫 ⛔ 🔔 🔕 ✔️ ➕ ➖ ➡️ ⬅️ ⬆️ ⬇️ 🔄 🔁 ℹ️ 🆗 🆘",
  },
  {
    id: "port",
    label: "Port & work",
    icon: "⚓",
    items:
      "⚓ 🚢 ⛴️ 🛳️ 🚤 ⛵ 🛥️ 🏗️ 🏭 📦 🚛 🚚 🚜 🏢 🚧 🛠️ 🔧 🔩 ⚙️ 🧰 👷 🛂 🛃 🛄 🛅 ⛽ 🌊 🌧️ ⛈️ 🌬️ 🌫️ ☀️ ⛅ 🌅 🌙 🧭 🗺️ 📍 📡 🔦",
  },
  {
    id: "office",
    label: "Office",
    icon: "📄",
    items:
      "📄 📃 📑 📋 📝 📁 📂 🗂️ 📎 📌 🔗 📊 📈 📉 🕐 ⏰ ⏳ ⌛ 📅 📆 📞 📱 💻 🖥️ 🖨️ 🔒 🔓 🔑 📢 📣 📬 📧 ✉️ 🔍 💡 🔋 📷 🎥",
  },
  {
    id: "fun",
    label: "Fun",
    icon: "🎉",
    items:
      "🎉 🎊 🎁 🎂 🏆 🥇 🎯 🎵 🎶 ⚽ 🏏 ☕ 🍵 🍽️ 🍕 🍔 🍎 🍌 🌴 🌞 🌈 🍀 🐟 🦀 🐬 🐳",
  },
].map((group) => ({
  ...group,
  items: group.items.split(" "),
}));

// =========================================================
// SMALL HELPERS
// =========================================================

const getErrorMessage = (error, fallback) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error?.detail) {
    if (typeof error.detail === "string") {
      return error.detail;
    }

    try {
      return JSON.stringify(error.detail);
    } catch {
      return fallback;
    }
  }

  return fallback;
};

// The backend may send times without a time zone. Those
// times are UTC, so "Z" is added before reading them.
const parseDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  let text = String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text) &&
    !/(Z|[+-]\d{2}:?\d{2})$/i.test(text)
  ) {
    text = text.replace(" ", "T") + "Z";
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date;
};

const formatClock = (date) => {
  if (!date) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const startOfDay = (date) =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

const daysBetween = (date) =>
  Math.round(
    (startOfDay(new Date()) - startOfDay(date)) /
      86400000
  );

const formatDayLabel = (date) => {
  const diff = daysBetween(date);

  if (diff === 0) {
    return "Today";
  }

  if (diff === 1) {
    return "Yesterday";
  }

  if (diff > 1 && diff < 7) {
    return date.toLocaleDateString([], {
      weekday: "long",
    });
  }

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatListTime = (date) => {
  if (!date) {
    return "";
  }

  const diff = daysBetween(date);

  if (diff === 0) {
    return formatClock(date);
  }

  if (diff === 1) {
    return "Yesterday";
  }

  if (diff > 1 && diff < 7) {
    return date.toLocaleDateString([], {
      weekday: "short",
    });
  }

  return date.toLocaleDateString([], {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
};

const formatLastSeen = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "offline";
  }

  const diff = daysBetween(date);

  if (diff === 0) {
    return `last seen today at ${formatClock(date)}`;
  }

  if (diff === 1) {
    return `last seen yesterday at ${formatClock(date)}`;
  }

  return `last seen ${date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
  })} at ${formatClock(date)}`;
};

const formatBytes = (bytes) => {
  const size = Number(bytes) || 0;

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(0)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
};

const getInitials = (name) => {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }

  return (
    words[0][0] + words[words.length - 1][0]
  ).toUpperCase();
};

const SENDER_COLORS = [
  "text-indigo-500",
  "text-emerald-600",
  "text-rose-500",
  "text-amber-600",
  "text-sky-600",
  "text-fuchsia-600",
  "text-teal-600",
];

const getSenderColor = (name) => {
  let hash = 0;

  String(name || "").split("").forEach((character) => {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  });

  return SENDER_COLORS[hash % SENDER_COLORS.length];
};

const getFileExtension = (name) => {
  const parts = String(name || "").toLowerCase().split(".");

  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const getFileKind = (name, mime) => {
  const extension = getFileExtension(name);

  if (extension === "pdf" || mime === "application/pdf") {
    return { Icon: MdPictureAsPdf, color: "text-red-500 bg-red-50 dark:bg-red-500/10", label: "PDF" };
  }

  if (["doc", "docx"].includes(extension)) {
    return { Icon: MdDescription, color: "text-blue-500 bg-blue-50 dark:bg-blue-500/10", label: "Word" };
  }

  if (["xls", "xlsx", "csv"].includes(extension)) {
    return { Icon: MdGridOn, color: "text-green-600 bg-green-50 dark:bg-green-500/10", label: "Sheet" };
  }

  if (["ppt", "pptx"].includes(extension)) {
    return { Icon: MdSlideshow, color: "text-orange-500 bg-orange-50 dark:bg-orange-500/10", label: "Slides" };
  }

  if (
    String(mime || "").startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp"].includes(extension)
  ) {
    return { Icon: MdImage, color: "text-purple-500 bg-purple-50 dark:bg-purple-500/10", label: "Image" };
  }

  if (extension === "zip") {
    return { Icon: MdArchive, color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-500/10", label: "ZIP" };
  }

  return { Icon: MdInsertDriveFile, color: "text-gray-500 bg-gray-100 dark:bg-white/10", label: "File" };
};

const isImageFile = (name, mime) =>
  String(mime || "").startsWith("image/") ||
  ["png", "jpg", "jpeg", "gif", "webp"].includes(
    getFileExtension(name)
  );

// 1 to 3 emoji and nothing else are shown big.
const isEmojiOnly = (text) => {
  const value = String(text || "").trim();

  if (!value || value.length > 24) {
    return false;
  }

  try {
    return /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Variation_Selector}|\p{Join_Control}|\s)+$/u.test(
      value
    );
  } catch {
    return false;
  }
};

const renderTextWithLinks = (text) => {
  const parts = String(text || "").split(
    /(https?:\/\/[^\s<]+)/g
  );

  return parts.map((part, index) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all underline"
        >
          {part}
        </a>
      );
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
};

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");

      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };

    reader.onerror = () =>
      reject(new Error("The file could not be read."));

    reader.readAsDataURL(file);
  });

const base64ToBlob = (base64, mime) => {
  const binary = window.atob(base64);

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], {
    type: mime || "application/octet-stream",
  });
};

const notifyUnreadChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent(UNREAD_EVENT));
  } catch {
    // Not important.
  }
};

const isWindowActive = () => {
  if (typeof document === "undefined") {
    return true;
  }

  const visible = document.visibilityState !== "hidden";

  const focused =
    typeof document.hasFocus === "function"
      ? document.hasFocus()
      : true;

  return visible && focused;
};

const readRecentEmojis = () => {
  try {
    const raw = window.localStorage.getItem(RECENT_EMOJI_KEY);

    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed) ? parsed.slice(0, 16) : [];
  } catch {
    return [];
  }
};

const saveRecentEmojis = (list) => {
  try {
    window.localStorage.setItem(
      RECENT_EMOJI_KEY,
      JSON.stringify(list)
    );
  } catch {
    // Storage may be blocked. The picker still works.
  }
};

// =========================================================
// BACKEND DATA -> SCREEN DATA
// =========================================================

const normalizeConversation = (raw) => {
  const type = raw.type === "channel" ? "channel" : "direct";

  const id = raw.id === undefined ? null : raw.id;

  const participantId =
    raw.participant_id === undefined
      ? null
      : raw.participant_id;

  const last = raw.last_message;

  return {
    key:
      type === "channel"
        ? `c${id}`
        : `u${participantId}`,
    id,
    type,
    name: raw.name || "Unknown",
    subtitle: raw.subtitle || raw.role || "",
    role: raw.role || "",
    participantId,
    online: !!raw.online,
    lastSeen: raw.last_seen || null,
    memberCount: raw.member_count || 0,
    unread: Number(raw.unread_count) || 0,
    myLastReadId: Number(raw.my_last_read_id) || 0,
    peerLastReadId:
      raw.peer_last_read_id === undefined ||
      raw.peer_last_read_id === null
        ? null
        : Number(raw.peer_last_read_id),
    lastMessage: last
      ? {
          id: last.id,
          mine: !!last.mine,
          senderName: last.sender_name || "",
          text: last.text || "",
          attachmentName: last.attachment_name || "",
          createdAt: last.created_at,
          deleted: !!last.deleted,
        }
      : null,
  };
};

const normalizeConversationList = (data) => {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.conversations)
    ? data.conversations
    : [];

  return list.map(normalizeConversation);
};

// A message deleted for everyone arrives with deleted: true, no text
// and no document ("This message was deleted").
const normalizeMessage = (raw) => ({
  id: raw.id,
  senderId: raw.sender_id,
  senderName: raw.sender_name || "",
  mine: !!raw.mine,
  text: raw.deleted ? "" : raw.text || "",
  createdAt: raw.created_at,
  status: "sent",
  deleted: !!raw.deleted,
  deletedAt: raw.deleted_at || null,
  attachment: raw.attachment && !raw.deleted
    ? {
        id: raw.attachment.id,
        name: raw.attachment.name || "document",
        mime: raw.attachment.mime || "",
        size: Number(raw.attachment.size) || 0,
      }
    : null,
});

const normalizeMessageList = (data) => {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.messages)
    ? data.messages
    : [];

  return list.map(normalizeMessage);
};

// A chat that was deleted by this account, or archived because its
// newest message is older than 6 months. It can be restored.
const normalizeArchived = (raw) => {
  const type = raw.type === "channel" ? "channel" : "direct";

  const id = raw.id === undefined ? null : raw.id;

  const participantId =
    raw.participant_id === undefined ? null : raw.participant_id;

  const last = raw.last_message;

  return {
    key: type === "channel" ? `c${id}` : `u${participantId}`,
    id,
    type,
    name: raw.name || "Unknown",
    subtitle: raw.subtitle || "",
    reason: raw.reason === "archived" ? "archived" : "deleted",
    messageCount: Number(raw.message_count) || 0,
    lastMine: last ? !!last.mine : false,
    lastAt: last ? last.created_at : null,
    lastText: last
      ? last.attachment_name
        ? `📎 ${last.attachment_name}${last.text ? ` ${last.text}` : ""}`
        : last.text || ""
      : "",
  };
};

const sortConversations = (list) =>
  [...list].sort((first, second) => {
    const firstTime = parseDate(first.lastMessage?.createdAt);
    const secondTime = parseDate(second.lastMessage?.createdAt);

    if (firstTime && secondTime) {
      return secondTime - firstTime;
    }

    if (firstTime) {
      return -1;
    }

    if (secondTime) {
      return 1;
    }

    return first.name.localeCompare(second.name);
  });

// A message I just sent is shown at once as the latest message of its
// chat (so the chat jumps to the top, like WhatsApp), until the server
// list has caught up.
const LOCAL_LAST_MS = 8000;

const mergeLocalLast = (entry, local) => {
  if (!local || local.until < Date.now()) {
    return entry;
  }

  const server = entry.lastMessage;

  if (server) {
    if (server.id && local.message.id) {
      if (server.id >= local.message.id) {
        return entry;
      }
    } else {
      const serverTime = parseDate(server.createdAt);
      const localTime = parseDate(local.message.createdAt);

      if (serverTime && localTime && serverTime >= localTime) {
        return entry;
      }
    }
  }

  return { ...entry, lastMessage: local.message };
};

// Looks for chats whose newest message is from someone else and has
// not been heard yet. The very first list only learns what is already
// there, so opening the page never beeps for old messages.
const findNewArrivals = (list, seen, firstLoad) => {
  const arrived = [];

  list.forEach((entry) => {
    const last = entry.lastMessage;

    const lastId =
      last && !last.mine && !last.deleted && last.id
        ? Number(last.id)
        : 0;

    const known = seen[entry.key];

    if (firstLoad) {
      seen[entry.key] = Math.max(known || 0, lastId);

      return;
    }

    if (lastId > (known || 0)) {
      seen[entry.key] = lastId;
      arrived.push(entry.key);
    }
  });

  return arrived;
};

// =========================================================
// ATTACHMENT DOWNLOAD / PREVIEW
// =========================================================

// Keeps the already downloaded files for this browser tab.
const attachmentCache = new Map();

const fetchAttachment = (attachment) => {
  const cached = attachmentCache.get(attachment.id);

  if (cached) {
    return cached;
  }

  const promise = apiGet(`/chat/attachments/${attachment.id}`)
    .then((data) => {
      const mime =
        data?.mime || attachment.mime || "application/octet-stream";

      const blob = base64ToBlob(data?.data_base64 || "", mime);

      return {
        url: URL.createObjectURL(blob),
        name: data?.name || attachment.name,
      };
    })
    .catch((error) => {
      attachmentCache.delete(attachment.id);

      throw error;
    });

  attachmentCache.set(attachment.id, promise);

  return promise;
};

const downloadAttachment = async (attachment) => {
  const file = await fetchAttachment(attachment);

  const link = document.createElement("a");

  link.href = file.url;
  link.download = file.name || attachment.name;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// =========================================================
// SMALL COMPONENTS
// =========================================================

const Avatar = ({ name, channel, size = "h-12 w-12", online, text = "text-sm" }) => (
  <div className="relative flex-shrink-0">
    <div
      className={`flex items-center justify-center rounded-full font-bold ${size} ${text} ${
        channel
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
          : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
      }`}
    >
      {channel ? (
        <MdGroup className="h-1/2 w-1/2" />
      ) : (
        getInitials(name)
      )}
    </div>

    {online !== undefined && (
      <span
        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-navy-800 ${
          online ? "bg-green-500" : "bg-gray-300 dark:bg-gray-500"
        }`}
      />
    )}
  </div>
);

const Ticks = ({ message, read }) => {
  if (message.status === "sending") {
    return (
      <span title="Sending" data-tick="sending" className="flex">
        <MdAccessTime className="h-3.5 w-3.5 text-white/70" />
      </span>
    );
  }

  if (message.status === "failed") {
    return (
      <span title="Not sent" data-tick="failed" className="flex">
        <MdErrorOutline className="h-4 w-4 text-red-200" />
      </span>
    );
  }

  if (read) {
    return (
      <span title="Read" data-tick="read" className="flex">
        <MdDoneAll className="h-4 w-4 text-sky-300" />
      </span>
    );
  }

  return (
    <span title="Sent" data-tick="sent" className="flex">
      <MdCheck className="h-4 w-4 text-white/70" />
    </span>
  );
};

const AttachmentView = ({ attachment, mine, localUrl, onOpenImage }) => {
  const [previewUrl, setPreviewUrl] = React.useState(localUrl || "");
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState("");

  const image = isImageFile(attachment.name, attachment.mime);

  const canAutoPreview =
    image && attachment.size <= AUTO_PREVIEW_BYTES;

  React.useEffect(() => {
    if (localUrl) {
      setPreviewUrl(localUrl);

      return undefined;
    }

    if (!canAutoPreview || !attachment.id) {
      return undefined;
    }

    let cancelled = false;

    fetchAttachment(attachment)
      .then((file) => {
        if (!cancelled) {
          setPreviewUrl(file.url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed("Preview not available");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachment, canAutoPreview, localUrl]);

  const handleDownload = async () => {
    if (busy || !attachment.id) {
      return;
    }

    setBusy(true);
    setFailed("");

    try {
      await downloadAttachment(attachment);
    } catch (error) {
      setFailed(getErrorMessage(error, "Download failed"));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenImage = async () => {
    if (previewUrl) {
      onOpenImage({ url: previewUrl, attachment });

      return;
    }

    if (busy || !attachment.id) {
      return;
    }

    setBusy(true);
    setFailed("");

    try {
      const file = await fetchAttachment(attachment);

      setPreviewUrl(file.url);
      onOpenImage({ url: file.url, attachment });
    } catch (error) {
      setFailed(getErrorMessage(error, "Preview failed"));
    } finally {
      setBusy(false);
    }
  };

  const kind = getFileKind(attachment.name, attachment.mime);

  if (image && previewUrl) {
    return (
      <button
        type="button"
        onClick={handleOpenImage}
        className="mb-1 block overflow-hidden rounded-xl"
        title="Open image"
      >
        <img
          src={previewUrl}
          alt={attachment.name}
          className="max-h-64 max-w-full rounded-xl object-cover"
        />
      </button>
    );
  }

  return (
    <div
      className={`mb-1 flex min-w-[220px] max-w-full items-center gap-3 rounded-xl p-2.5 ${
        mine ? "bg-white/15" : "bg-gray-100 dark:bg-white/10"
      }`}
    >
      <div
        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${kind.color}`}
      >
        <kind.Icon className="h-6 w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" title={attachment.name}>
          {attachment.name}
        </p>

        <p
          className={`text-[11px] ${
            mine ? "text-white/70" : "text-gray-400"
          }`}
        >
          {failed || `${kind.label} • ${formatBytes(attachment.size)}`}
        </p>
      </div>

      <button
        type="button"
        onClick={image ? handleOpenImage : handleDownload}
        disabled={busy || !attachment.id}
        title={image ? "Open image" : "Download"}
        aria-label={image ? "Open image" : "Download document"}
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 ${
          mine
            ? "bg-white/20 text-white hover:bg-white/30"
            : "bg-white text-indigo-600 hover:bg-indigo-50 dark:bg-navy-600 dark:text-indigo-300"
        }`}
      >
        {busy ? (
          <MdRefresh className="h-5 w-5 animate-spin" />
        ) : (
          <MdFileDownload className="h-5 w-5" />
        )}
      </button>
    </div>
  );
};

const MessageBubble = ({
  message,
  showSender,
  isChannel,
  read,
  onOpenImage,
  onRetry,
  onDiscard,
  onOpenMenu,
}) => {
  const mine = message.mine;

  const deleted = !!message.deleted;

  const emojiOnly =
    !deleted && !message.attachment && isEmojiOnly(message.text);

  const time = formatClock(parseDate(message.createdAt));

  // The small arrow beside the bubble (like WhatsApp) is shown for
  // messages the server already has.
  const canOpenMenu =
    !!onOpenMenu &&
    !!message.id &&
    message.status !== "sending" &&
    message.status !== "failed";

  const menuButton = canOpenMenu ? (
    <button
      type="button"
      data-testid="message-menu-button"
      data-msg-menu-trigger="true"
      aria-label="Message options"
      title="Message options"
      onClick={(event) => onOpenMenu(message, event.currentTarget)}
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 opacity-100 transition hover:bg-gray-200 hover:text-gray-600 focus:opacity-100 dark:hover:bg-navy-600 dark:hover:text-gray-100 md:opacity-0 md:group-hover:opacity-100"
    >
      <MdKeyboardArrowDown className="h-5 w-5" />
    </button>
  ) : null;

  return (
    <div
      className={`group flex items-center gap-1 ${
        mine ? "justify-end" : "justify-start"
      }`}
      data-testid="message"
      data-mine={mine ? "true" : "false"}
      data-deleted={deleted ? "true" : "false"}
    >
      {mine && menuButton}

      <div
        className={`min-w-0 max-w-[82%] rounded-2xl px-3 py-2 shadow-sm md:max-w-[70%] ${
          deleted
            ? mine
              ? "rounded-br-md bg-indigo-50 text-gray-500 dark:bg-indigo-500/20 dark:text-gray-300"
              : "rounded-bl-md bg-white text-gray-400 dark:bg-navy-700 dark:text-gray-300"
            : emojiOnly
            ? "bg-transparent shadow-none"
            : mine
            ? "rounded-br-md bg-indigo-600 text-white"
            : "rounded-bl-md bg-white text-navy-700 dark:bg-navy-700 dark:text-white"
        }`}
      >
        {isChannel && !mine && showSender && (
          <p
            className={`mb-0.5 text-xs font-bold ${getSenderColor(
              message.senderName
            )}`}
          >
            {message.senderName}
          </p>
        )}

        {deleted && (
          <p
            data-testid="deleted-text"
            className="flex items-center gap-1.5 text-sm italic"
          >
            <MdBlock className="h-4 w-4 flex-shrink-0" />

            {mine
              ? "You deleted this message"
              : "This message was deleted"}
          </p>
        )}

        {!deleted && message.attachment && (
          <AttachmentView
            attachment={message.attachment}
            mine={mine}
            localUrl={message.localPreviewUrl}
            onOpenImage={onOpenImage}
          />
        )}

        {!deleted && message.text && (
          <p
            className={`whitespace-pre-wrap break-words ${
              emojiOnly
                ? "text-5xl leading-tight"
                : "text-sm leading-5"
            }`}
          >
            {renderTextWithLinks(message.text)}
          </p>
        )}

        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            deleted
              ? "text-gray-400"
              : emojiOnly
              ? "text-gray-400"
              : mine
              ? "text-white/70"
              : "text-gray-400"
          }`}
        >
          <span>{time}</span>

          {mine && !emojiOnly && !deleted && (
            <Ticks message={message} read={read} />
          )}
        </div>

        {message.status === "failed" && (
          <div className="mt-1 flex items-center justify-end gap-3 text-[11px] font-semibold">
            <span className="text-red-200">
              {message.error || "Not sent"}
            </span>

            <button
              type="button"
              onClick={() => onRetry(message)}
              className="underline"
            >
              Retry
            </button>

            <button
              type="button"
              onClick={() => onDiscard(message)}
              className="underline"
            >
              Discard
            </button>
          </div>
        )}
      </div>

      {!mine && menuButton}
    </div>
  );
};

const EmojiPicker = ({ recent, onPick, pickerRef }) => {
  const [activeGroup, setActiveGroup] = React.useState(
    recent.length > 0 ? "recent" : "smileys"
  );

  const groups = recent.length
    ? [
        {
          id: "recent",
          label: "Recently used",
          icon: "🕘",
          items: recent,
        },
        ...EMOJI_GROUPS,
      ]
    : EMOJI_GROUPS;

  const current =
    groups.find((group) => group.id === activeGroup) || groups[0];

  return (
    <div
      ref={pickerRef}
      data-testid="emoji-picker"
      className="absolute bottom-full left-0 z-30 mb-2 w-[330px] max-w-[92vw] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl dark:border-white/10 dark:bg-navy-700"
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-1 dark:border-white/10">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            title={group.label}
            aria-label={group.label}
            onClick={() => setActiveGroup(group.id)}
            className={`flex-1 border-b-2 py-2 text-lg transition ${
              current.id === group.id
                ? "border-indigo-600"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            {group.icon}
          </button>
        ))}
      </div>

      <p className="px-3 pt-2 text-[11px] font-semibold uppercase text-gray-400">
        {current.label}
      </p>

      <div className="port-scrollbar grid max-h-[220px] grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {current.items.map((emoji, index) => (
          <button
            key={`${emoji}-${index}`}
            type="button"
            onClick={() => onPick(emoji)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-2xl transition hover:bg-gray-100 dark:hover:bg-navy-600"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};

// =========================================================
// DRAW OUTSIDE THE PAGE FRAME
// =========================================================

// The message menu and the question box are drawn straight in <body>.
// A page frame (or top bar) with "transform", "filter" or "backdrop
// blur" turns "position: fixed" into "relative to that frame", which
// pushed the menu off the screen so that nothing seemed to happen.
// The dark colours and the font of the page are passed on.
const BodyPortal = ({ anchor, children }) => {
  if (typeof document === "undefined") {
    return null;
  }

  const root = anchor ? anchor.current : null;

  const dark = !!(root && root.closest && root.closest(".dark"));

  let font = "";

  try {
    font = root ? window.getComputedStyle(root).fontFamily : "";
  } catch {
    font = "";
  }

  return createPortal(
    <div
      className={dark ? "dark" : undefined}
      style={font ? { fontFamily: font } : undefined}
    >
      {children}
    </div>,
    document.body
  );
};

// =========================================================
// CONFIRM BOX (WhatsApp style: question, stacked buttons)
// =========================================================

const ConfirmDialog = ({ title, body, actions, busy, error, onClose }) => {
  const cancelRef = React.useRef(null);

  // Cancel has the focus, so a stray Enter never deletes anything.
  React.useEffect(() => {
    if (cancelRef.current) {
      cancelRef.current.focus();
    }
  }, []);

  React.useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKey);

    return () => document.removeEventListener("keydown", handleKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-[3100] flex items-center justify-center bg-black/50 p-4"
      data-testid="confirm-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="confirm-dialog"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-navy-800"
      >
        <h3
          className="text-base font-bold text-navy-700 dark:text-white"
          data-testid="confirm-title"
        >
          {title}
        </h3>

        {body && (
          <p
            className="mt-2 whitespace-pre-line text-sm text-gray-500 dark:text-gray-300"
            data-testid="confirm-body"
          >
            {body}
          </p>
        )}

        {error && (
          <div
            role="alert"
            data-testid="confirm-error"
            className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 dark:bg-red-500/10"
          >
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={busy}
              onClick={action.onClick}
              data-testid={action.testId}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
            >
              {busy && <MdRefresh className="h-4 w-4 animate-spin" />}
              {action.label}
            </button>
          ))}

          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onClose}
            data-testid="confirm-cancel"
            className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// A small menu next to a message (Delete). It is placed on the screen
// itself ("fixed"), so the message list can never cut it off.
const MessageMenu = ({ menu, menuRef, onDelete }) => (
  <div
    ref={menuRef}
    role="menu"
    data-testid="message-menu"
    style={{
      position: "fixed",
      left: `${menu.left}px`,
      top: `${menu.top}px`,
      width: `${MENU_WIDTH}px`,
    }}
    className="z-[2500] overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-navy-700"
  >
    <button
      type="button"
      role="menuitem"
      data-testid="message-menu-delete"
      onClick={onDelete}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-navy-700 hover:bg-gray-50 dark:text-white dark:hover:bg-navy-600"
    >
      <MdDeleteOutline className="h-5 w-5 text-gray-400" />
      Delete
    </button>
  </div>
);

// =========================================================
// DELETED & ARCHIVED CHATS
// =========================================================

const ArchivePanel = ({ items, restoringId, error, onBack, onRestore }) => (
  <div
    className="flex min-h-0 flex-1 flex-col"
    data-testid="archive-panel"
  >
    <div className="flex items-center gap-2 border-b border-gray-100 p-3 dark:border-white/10">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to conversations"
        data-testid="archive-back"
        className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-navy-700"
      >
        <MdArrowBack className="h-5 w-5" />
      </button>

      <div className="min-w-0">
        <p className="text-sm font-bold text-navy-700 dark:text-white">
          Deleted & archived chats
        </p>

        <p className="text-[11px] text-gray-400">
          Hidden only for you. Restore brings back every message.
        </p>
      </div>
    </div>

    {error && (
      <div
        role="alert"
        className="m-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 dark:bg-red-500/10"
      >
        {error}
      </div>
    )}

    <div className="port-scrollbar min-h-0 flex-1 overflow-y-auto">
      {items.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-400">
          No deleted or archived chats.
        </div>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          data-testid="archive-row"
          data-name={item.name}
          className="flex items-center gap-3 border-b border-gray-50 px-4 py-3.5 dark:border-white/5"
        >
          <Avatar name={item.name} channel={item.type === "channel"} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                {item.name}
              </p>

              <span className="flex-shrink-0 text-[10px] text-gray-400">
                {formatListTime(parseDate(item.lastAt))}
              </span>
            </div>

            <p className="mt-1 flex items-center text-[11px]">
              <span
                data-testid="archive-reason"
                className={`whitespace-nowrap rounded-full px-2 py-0.5 font-bold ${
                  item.reason === "archived"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                    : "bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-300"
                }`}
              >
                {item.reason === "archived"
                  ? "Archived • 6+ months"
                  : "Deleted"}
              </span>
            </p>

            <p className="mt-1 truncate text-xs text-gray-400">
              {item.messageCount}{" "}
              {item.messageCount === 1 ? "message" : "messages"} •{" "}
              {item.lastMine ? "You: " : ""}
              {item.lastText}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onRestore(item)}
            disabled={restoringId !== null}
            data-testid="restore-button"
            className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {restoringId === item.id ? (
              <MdRefresh className="h-4 w-4 animate-spin" />
            ) : (
              <MdRestoreFromTrash className="h-4 w-4" />
            )}
            Restore
          </button>
        </div>
      ))}
    </div>
  </div>
);

// =========================================================
// INTERVAL HOOK
// =========================================================

// Keeps running at its normal pace even when this browser tab is in
// the background, so new messages arrive without switching tabs.
const useInterval = (callback, delay) => {
  const saved = React.useRef(callback);

  saved.current = callback;

  React.useEffect(
    () => startPollTimer(() => saved.current(), delay),
    [delay]
  );
};

// =========================================================
// MAIN COMPONENT
// =========================================================

const PortCommunication = () => {
  const [conversations, setConversations] = React.useState([]);
  const [loadState, setLoadState] = React.useState("loading");
  const [loadError, setLoadError] = React.useState("");
  const [connectionLost, setConnectionLost] = React.useState(false);

  const [selectedKey, setSelectedKey] = React.useState(null);
  const [showMobileChat, setShowMobileChat] = React.useState(false);

  const [search, setSearch] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState("All");

  const [messagesByKey, setMessagesByKey] = React.useState({});
  const [messageError, setMessageError] = React.useState("");

  const [drafts, setDrafts] = React.useState({});
  const [pendingFiles, setPendingFiles] = React.useState({});
  const [attachError, setAttachError] = React.useState("");

  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [recentEmojis, setRecentEmojis] = React.useState(readRecentEmojis);

  const [lightbox, setLightbox] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const [windowActive, setWindowActive] = React.useState(isWindowActive);

  const [unreadAnchor, setUnreadAnchor] = React.useState(null);
  const [newBelow, setNewBelow] = React.useState(0);
  const [showScrollButton, setShowScrollButton] = React.useState(false);

  // Deleted chats and chats archived after 6 months (restorable).
  const [archived, setArchived] = React.useState([]);
  const [showArchive, setShowArchive] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState(null);
  const [archiveError, setArchiveError] = React.useState("");

  // The question boxes: delete one message, delete a chat, delete all.
  const [dialog, setDialog] = React.useState(null);
  const [dialogBusy, setDialogBusy] = React.useState(false);
  const [dialogError, setDialogError] = React.useState("");

  // The small menu next to a message, and the three-dot menu above
  // the chat list.
  const [msgMenu, setMsgMenu] = React.useState(null);
  const [listMenuOpen, setListMenuOpen] = React.useState(false);

  // -------------------------------------------------------
  // REFS (latest values for timers and event handlers)
  // -------------------------------------------------------

  const conversationsRef = React.useRef([]);
  const messagesRef = React.useRef({});
  const selectedKeyRef = React.useRef(null);
  const windowActiveRef = React.useRef(windowActive);

  const listBusyRef = React.useRef(false);
  const messageBusyRef = React.useRef({});
  const readPostedRef = React.useRef({});
  const tempCounterRef = React.useRef(0);
  const localLastRef = React.useRef({});
  const incomingSeenRef = React.useRef({});
  const listLoadedRef = React.useRef(false);
  const mountedRef = React.useRef(true);

  const scrollRef = React.useRef(null);
  const dividerRef = React.useRef(null);
  const textareaRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const emojiButtonRef = React.useRef(null);
  const emojiPickerRef = React.useRef(null);
  const msgMenuRef = React.useRef(null);
  const listMenuRef = React.useRef(null);
  const rootRef = React.useRef(null);

  const nearBottomRef = React.useRef(true);
  const initialScrollKeyRef = React.useRef(null);
  const pendingOpenRef = React.useRef(null);
  const attachTimerRef = React.useRef(null);

  const chatBoxRef = React.useRef(null);
  const [fitHeight, setFitHeight] = React.useState(null);

  conversationsRef.current = conversations;
  messagesRef.current = messagesByKey;
  selectedKeyRef.current = selectedKey;
  windowActiveRef.current = windowActive;

  React.useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // While this page is open it plays the message sound itself
  // (the bell in the top bar stays quiet, so nothing beeps twice).
  React.useEffect(() => {
    setChatPageActive(true);

    return () => setChatPageActive(false);
  }, []);

  // -------------------------------------------------------
  // FIT THE CHAT BOX TO THE SCREEN
  // -------------------------------------------------------
  //
  // The chat box gets all the height that is left below the
  // page heading, so the message list and the typing bar are
  // always visible without scrolling the page.
  //

  React.useLayoutEffect(() => {
    const measure = () => {
      const element = chatBoxRef.current;

      if (!element) {
        return;
      }

      const top =
        element.getBoundingClientRect().top + window.scrollY;

      const available = window.innerHeight - top - 24;

      setFitHeight(Math.max(Math.round(available), 360));
    };

    measure();

    // Measure again after the page has settled (fonts, sidebar).
    const timer = window.setTimeout(measure, 300);

    window.addEventListener("resize", measure);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, []);

  // -------------------------------------------------------
  // WINDOW ACTIVE (visible AND focused)
  // -------------------------------------------------------

  React.useEffect(() => {
    const update = () => setWindowActive(isWindowActive());

    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);

    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  // -------------------------------------------------------
  // LOAD CONVERSATIONS
  // -------------------------------------------------------

  const loadConversations = React.useCallback(async () => {
    if (listBusyRef.current) {
      return;
    }

    listBusyRef.current = true;

    try {
      const data = await apiGet("/chat/conversations");

      if (!mountedRef.current) {
        return;
      }

      const list = normalizeConversationList(data).map((entry) =>
        mergeLocalLast(entry, localLastRef.current[entry.key])
      );

      const arrived = findNewArrivals(
        list,
        incomingSeenRef.current,
        !listLoadedRef.current
      );

      listLoadedRef.current = true;

      setConversations(list);

      if (arrived.length > 0) {
        playMessageBeep();

        // The bell and the tab title show the new number at once, unless
        // the message arrived in the chat that is open and being read.
        if (
          arrived.some(
            (key) =>
              key !== selectedKeyRef.current ||
              !windowActiveRef.current
          )
        ) {
          notifyUnreadChanged();
        }
      }

      setLoadState("ready");
      setLoadError("");
      setConnectionLost(false);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      if (conversationsRef.current.length === 0) {
        setLoadState("error");
        setLoadError(
          getErrorMessage(
            error,
            "Port Communication could not be loaded."
          )
        );
      } else {
        setConnectionLost(true);
      }
    } finally {
      listBusyRef.current = false;
    }
  }, []);

  // The list of deleted / archived chats (for the "Restore" button).
  const loadArchived = React.useCallback(async () => {
    try {
      const data = await apiGet("/chat/archive");

      if (!mountedRef.current) {
        return;
      }

      setArchived(Array.isArray(data) ? data.map(normalizeArchived) : []);
    } catch {
      // The list keeps its last value.
    }
  }, []);

  // The server moves chats older than 6 months to the archive when the
  // chat list is loaded after a login, so the archive is read after it.
  React.useEffect(() => {
    loadConversations().then(() => loadArchived());
  }, [loadConversations, loadArchived]);

  useInterval(() => {
    loadConversations();
  }, CONVERSATION_REFRESH_MS);

  useInterval(() => {
    loadArchived();
  }, ARCHIVE_REFRESH_MS);

  // -------------------------------------------------------
  // LOAD MESSAGES OF ONE CONVERSATION
  // -------------------------------------------------------

  const loadMessages = React.useCallback(async (key, fullReload) => {
    const entry = conversationsRef.current.find(
      (item) => item.key === key
    );

    if (!entry || !entry.id) {
      // A chat that has no messages yet.
      setMessagesByKey((previous) =>
        previous[key] ? previous : { ...previous, [key]: [] }
      );

      return;
    }

    if (messageBusyRef.current[key]) {
      return;
    }

    messageBusyRef.current[key] = true;

    try {
      const existing = messagesRef.current[key] || [];

      const lastId = existing.reduce(
        (highest, item) =>
          item.id && item.id > highest ? item.id : highest,
        0
      );

      // The newest deletion time already known: the server then also
      // returns old messages that were deleted for everyone since, so
      // they change to "This message was deleted" on this screen too.
      const deletedSince = existing.reduce(
        (latest, item) =>
          item.deletedAt && item.deletedAt > latest
            ? item.deletedAt
            : latest,
        ""
      );

      const path =
        `/chat/conversations/${entry.id}/messages` +
        (!fullReload && lastId
          ? `?after_id=${lastId}` +
            (deletedSince
              ? `&deleted_since=${encodeURIComponent(deletedSince)}`
              : "")
          : "");

      const data = await apiGet(path);

      if (!mountedRef.current) {
        return;
      }

      const incoming = normalizeMessageList(data);

      const knownIds = new Set(
        existing.filter((item) => item.id).map((item) => item.id)
      );

      const fresh = incoming.filter((item) => !knownIds.has(item.id));

      // A new message from someone else beeps once, even though both
      // this refresh and the list refresh may see it.
      const newestIncoming = incoming.reduce(
        (highest, item) =>
          !item.mine && !item.deleted && item.id > highest
            ? item.id
            : highest,
        0
      );

      if (newestIncoming > (incomingSeenRef.current[key] || 0)) {
        incomingSeenRef.current[key] = newestIncoming;

        if (!fullReload && listLoadedRef.current) {
          playMessageBeep();

          if (
            selectedKeyRef.current !== key ||
            !windowActiveRef.current
          ) {
            notifyUnreadChanged();
          }
        }
      }

      setMessagesByKey((previous) => {
        const current = previous[key] || [];

        const temps = current.filter((item) => !item.id);

        // A message that was deleted for everyone replaces the one
        // already on the screen.
        const real = fullReload
          ? incoming
          : [
              ...current
                .filter((item) => item.id)
                .map(
                  (item) =>
                    incoming.find(
                      (other) =>
                        other.id === item.id &&
                        other.deleted &&
                        !item.deleted
                    ) || item
                ),
              ...incoming.filter(
                (item) =>
                  !current.some((other) => other.id === item.id)
              ),
            ];

        real.sort((first, second) => first.id - second.id);

        return { ...previous, [key]: [...real, ...temps] };
      });

      setMessageError("");

      if (
        !fullReload &&
        fresh.length > 0 &&
        selectedKeyRef.current === key &&
        !nearBottomRef.current
      ) {
        const received = fresh.filter((item) => !item.mine).length;

        if (received > 0) {
          setNewBelow((count) => count + received);
        }
      }
    } catch (error) {
      if (mountedRef.current && selectedKeyRef.current === key) {
        setMessageError(
          getErrorMessage(error, "Messages could not be loaded.")
        );
      }
    } finally {
      messageBusyRef.current[key] = false;
    }
  }, []);

  useInterval(() => {
    const key = selectedKeyRef.current;

    if (key) {
      loadMessages(key, false);
    }
  }, MESSAGE_REFRESH_MS);

  // When the window becomes active again, refresh at once.
  React.useEffect(() => {
    if (windowActive) {
      loadConversations();

      if (selectedKeyRef.current) {
        loadMessages(selectedKeyRef.current, false);
      }
    }
  }, [windowActive, loadConversations, loadMessages]);

  // -------------------------------------------------------
  // SELECTED CONVERSATION
  // -------------------------------------------------------

  const selectedEntry = React.useMemo(
    () => conversations.find((item) => item.key === selectedKey) || null,
    [conversations, selectedKey]
  );

  const selectedMessages = selectedKey
    ? messagesByKey[selectedKey]
    : undefined;

  const handleSelectConversation = React.useCallback(
    (entry) => {
      setSelectedKey(entry.key);
      setShowMobileChat(true);
      setShowArchive(false);
      setMsgMenu(null);
      setEmojiOpen(false);
      setNewBelow(0);
      setShowScrollButton(false);
      setMessageError("");
      setAttachError("");

      nearBottomRef.current = true;
      initialScrollKeyRef.current = entry.key;

      setUnreadAnchor(
        entry.unread > 0
          ? { key: entry.key, afterId: entry.myLastReadId }
          : null
      );

      // A chat with no messages (for example after it was deleted) is
      // loaded fresh, so nothing old can be shown from the memory.
      const hasMessages =
        !!messagesRef.current[entry.key] && !!entry.lastMessage;

      if (!hasMessages) {
        loadMessages(entry.key, true);
      } else {
        loadMessages(entry.key, false);
      }
    },
    [loadMessages]
  );

  // Open a chat requested by the navbar bell.
  const tryOpenPending = React.useCallback(() => {
    const wanted = pendingOpenRef.current;

    if (!wanted) {
      return;
    }

    const entry = conversationsRef.current.find(
      (item) =>
        String(item.id) === String(wanted) || item.key === wanted
    );

    if (entry) {
      pendingOpenRef.current = null;

      try {
        window.sessionStorage.removeItem(OPEN_CHAT_STORAGE_KEY);
      } catch {
        // Not important.
      }

      handleSelectConversation(entry);
    }
  }, [handleSelectConversation]);

  React.useEffect(() => {
    try {
      pendingOpenRef.current =
        window.sessionStorage.getItem(OPEN_CHAT_STORAGE_KEY) ||
        null;
    } catch {
      pendingOpenRef.current = null;
    }

    const handleOpen = (event) => {
      if (event.detail?.conversationId) {
        pendingOpenRef.current = String(event.detail.conversationId);

        tryOpenPending();
        loadConversations();
      }
    };

    window.addEventListener(OPEN_CHAT_EVENT, handleOpen);

    return () => {
      window.removeEventListener(OPEN_CHAT_EVENT, handleOpen);
    };
  }, [tryOpenPending, loadConversations]);

  React.useEffect(() => {
    tryOpenPending();
  }, [conversations, tryOpenPending]);

  // -------------------------------------------------------
  // DELETE A MESSAGE / A CHAT / ALL CHATS, RESTORE A CHAT
  // -------------------------------------------------------
  //
  // Deleting a chat hides it for THIS account only: the other person
  // keeps it and nothing is erased. Restore brings every message
  // back (the chat opens again, with its whole history).
  //

  // The boxes ask first. Nothing is deleted until a red button is used.
  const closeDialog = React.useCallback(() => {
    setDialog(null);
    setDialogBusy(false);
    setDialogError("");
  }, []);

  const openDeleteChat = () => {
    if (!selectedEntry || !selectedEntry.id) {
      return;
    }

    setDialogError("");
    setDialog({ kind: "chat", entry: selectedEntry });
  };

  const openDeleteAll = () => {
    setListMenuOpen(false);
    setDialogError("");
    setDialog({ kind: "all" });
  };

  const openMessageMenu = (message, button) => {
    if (msgMenu && msgMenu.message.id === message.id) {
      setMsgMenu(null);

      return;
    }

    const box = button.getBoundingClientRect();

    // Open downwards; if there is no room below, open upwards.
    const below = box.bottom + 4;

    const top =
      below + MENU_HEIGHT > window.innerHeight
        ? Math.max(8, box.top - MENU_HEIGHT - 4)
        : below;

    const left = Math.min(
      Math.max(8, box.right - MENU_WIDTH),
      Math.max(8, window.innerWidth - MENU_WIDTH - 8)
    );

    setMsgMenu({ message, left, top });
  };

  const openDeleteMessage = () => {
    if (!msgMenu || !selectedEntry) {
      return;
    }

    const message = msgMenu.message;

    setMsgMenu(null);
    setDialogError("");
    setDialog({ kind: "message", message, entry: selectedEntry });
  };

  // Runs one delete request while the box shows "busy"; an error
  // stays inside the box so it can be read.
  const runDialogAction = async (action) => {
    if (dialogBusy) {
      return;
    }

    setDialogBusy(true);
    setDialogError("");

    try {
      await action();

      if (mountedRef.current) {
        setDialog(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        setDialogError(
          getErrorMessage(error, "It could not be deleted.")
        );
      }
    } finally {
      if (mountedRef.current) {
        setDialogBusy(false);
      }
    }
  };

  // Deleting hides the chat for THIS account only: the other person
  // keeps it and nothing is erased. Restore brings every message
  // back (the chat opens again, with its whole history).
  const performDeleteChat = async (entry) => {
    await apiDelete(`/chat/conversations/${entry.id}`);

    if (!mountedRef.current) {
      return;
    }

    // Forget what was shown and close the chat, like WhatsApp.
    setMessagesByKey((previous) => {
      const next = { ...previous };

      delete next[entry.key];

      return next;
    });

    delete readPostedRef.current[entry.key];
    delete localLastRef.current[entry.key];

    setConversations((previous) =>
      previous.map((item) =>
        item.key === entry.key
          ? { ...item, lastMessage: null, unread: 0 }
          : item
      )
    );

    setSelectedKey(null);
    setShowMobileChat(false);
    setUnreadAnchor(null);
    setNewBelow(0);
    setShowScrollButton(false);
    setEmojiOpen(false);

    notifyUnreadChanged();
    loadConversations();
    loadArchived();
  };

  // "Delete all chats": every chat is hidden for this account at once.
  const performDeleteAll = async () => {
    await apiDelete("/chat/conversations");

    if (!mountedRef.current) {
      return;
    }

    setMessagesByKey({});

    readPostedRef.current = {};
    localLastRef.current = {};

    setConversations((previous) =>
      previous.map((item) => ({ ...item, lastMessage: null, unread: 0 }))
    );

    setSelectedKey(null);
    setShowMobileChat(false);
    setUnreadAnchor(null);
    setNewBelow(0);
    setShowScrollButton(false);
    setEmojiOpen(false);
    setMsgMenu(null);

    notifyUnreadChanged();
    loadConversations();
    loadArchived();
  };

  // One message: scope "me" (only my screen) or "everyone" (my own
  // message becomes "This message was deleted" for everybody).
  const performDeleteMessage = async (entry, message, scope) => {
    const result = await apiDelete(
      `/chat/conversations/${entry.id}/messages/${message.id}?scope=${scope}`
    );

    if (!mountedRef.current) {
      return;
    }

    const key = entry.key;

    // The "just sent" shortcut must not bring a deleted message back.
    delete localLastRef.current[key];

    if (scope === "everyone") {
      setMessagesByKey((previous) => ({
        ...previous,
        [key]: (previous[key] || []).map((item) =>
          item.id === message.id
            ? {
                ...item,
                deleted: true,
                text: "",
                attachment: null,
                localPreviewUrl: "",
                deletedAt:
                  result?.deleted_at || new Date().toISOString(),
              }
            : item
        ),
      }));
    } else {
      setMessagesByKey((previous) => ({
        ...previous,
        [key]: (previous[key] || []).filter(
          (item) => item.id !== message.id
        ),
      }));
    }

    // The line under the name in the chat list follows at once.
    const remaining = (messagesRef.current[key] || []).filter(
      (item) => item.id && item.id !== message.id
    );

    const before = remaining[remaining.length - 1];

    setConversations((previous) =>
      previous.map((item) => {
        if (
          item.key !== key ||
          !item.lastMessage ||
          item.lastMessage.id !== message.id
        ) {
          return item;
        }

        if (scope === "everyone") {
          return {
            ...item,
            lastMessage: {
              ...item.lastMessage,
              text: "",
              attachmentName: "",
              deleted: true,
            },
          };
        }

        return {
          ...item,
          lastMessage: before
            ? {
                id: before.id,
                mine: before.mine,
                senderName: before.senderName,
                text: before.text,
                attachmentName: before.attachment
                  ? before.attachment.name
                  : "",
                createdAt: before.createdAt,
                deleted: !!before.deleted,
              }
            : null,
        };
      })
    );

    notifyUnreadChanged();
    loadConversations();
  };

  const handleRestoreChat = async (item) => {
    if (restoringId !== null) {
      return;
    }

    setRestoringId(item.id);
    setArchiveError("");

    try {
      await apiPost(`/chat/conversations/${item.id}/restore`, {});

      if (!mountedRef.current) {
        return;
      }

      // Load the whole history fresh when the chat is opened.
      setMessagesByKey((previous) => {
        const next = { ...previous };

        delete next[item.key];

        return next;
      });

      // Open the restored chat as soon as the list has it again.
      pendingOpenRef.current = String(item.id);

      setShowArchive(false);

      await loadConversations();

      loadArchived();
      notifyUnreadChanged();
    } catch (error) {
      if (mountedRef.current) {
        setArchiveError(
          getErrorMessage(error, "The chat could not be restored.")
        );
      }
    } finally {
      if (mountedRef.current) {
        setRestoringId(null);
      }
    }
  };

  // -------------------------------------------------------
  // MARK AS READ
  // -------------------------------------------------------
  //
  // Messages are marked as read ONLY when:
  // - the conversation is open, and
  // - this browser window is visible and in focus, and
  // - the messages are actually on the screen.
  //
  // This is what makes the bell counter go down only after
  // the receiving account has opened the messages.
  //

  React.useEffect(() => {
    if (!selectedKey || !windowActive) {
      return;
    }

    const entry = conversations.find((item) => item.key === selectedKey);

    if (!entry || !entry.id || !selectedMessages) {
      return;
    }

    const lastIncomingId = selectedMessages.reduce(
      (highest, item) =>
        !item.mine && item.id && item.id > highest
          ? item.id
          : highest,
      0
    );

    const alreadyRead = Math.max(
      entry.myLastReadId,
      readPostedRef.current[selectedKey] || 0
    );

    if (lastIncomingId === 0 || lastIncomingId <= alreadyRead) {
      return;
    }

    readPostedRef.current[selectedKey] = lastIncomingId;

    apiPost(`/chat/conversations/${entry.id}/read`, {
      last_message_id: lastIncomingId,
    })
      .then(() => {
        if (!mountedRef.current) {
          return;
        }

        setConversations((previous) =>
          previous.map((item) =>
            item.key === selectedKey
              ? { ...item, unread: 0, myLastReadId: lastIncomingId }
              : item
          )
        );

        notifyUnreadChanged();
      })
      .catch(() => {
        // Try again on the next refresh.
        readPostedRef.current[selectedKey] = alreadyRead;
      });
  }, [selectedKey, windowActive, conversations, selectedMessages]);

  // -------------------------------------------------------
  // SCROLLING
  // -------------------------------------------------------

  const scrollToBottom = React.useCallback((smooth) => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    if (smooth && typeof element.scrollTo === "function") {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: "smooth",
      });
    } else {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  const handleScroll = () => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    const near = distance < 120;

    nearBottomRef.current = near;

    // The little message menu does not follow a scrolling list.
    setMsgMenu((previous) => (previous ? null : previous));

    setShowScrollButton((previous) =>
      previous === !near ? previous : !near
    );

    if (near) {
      setNewBelow(0);
    }
  };

  const lastMessage =
    selectedMessages && selectedMessages.length > 0
      ? selectedMessages[selectedMessages.length - 1]
      : null;

  const lastMessageToken = lastMessage
    ? `${lastMessage.id || lastMessage.tempId}-${selectedMessages.length}`
    : "";

  React.useLayoutEffect(() => {
    if (!selectedKey || selectedMessages === undefined) {
      return;
    }

    // First time this conversation is shown.
    if (initialScrollKeyRef.current === selectedKey) {
      initialScrollKeyRef.current = null;

      if (dividerRef.current && scrollRef.current) {
        const container = scrollRef.current;

        const distance =
          dividerRef.current.getBoundingClientRect().top -
          container.getBoundingClientRect().top;

        container.scrollTop += distance - 60;

        handleScroll();
      } else {
        scrollToBottom(false);
      }

      return;
    }

    if (lastMessage && (lastMessage.mine || nearBottomRef.current)) {
      scrollToBottom(!!lastMessage.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, selectedMessages === undefined, lastMessageToken]);

  // -------------------------------------------------------
  // ROWS (messages + day lines + unread line)
  // -------------------------------------------------------

  const rows = React.useMemo(() => {
    if (!selectedMessages) {
      return [];
    }

    const list = [];

    const anchor =
      unreadAnchor && unreadAnchor.key === selectedKey
        ? unreadAnchor
        : null;

    const unreadTotal = anchor
      ? selectedMessages.filter(
          (item) =>
            !item.mine &&
            !item.deleted &&
            item.id &&
            item.id > anchor.afterId
        ).length
      : 0;

    let lastDay = "";
    let lastSender = null;
    let dividerShown = false;

    selectedMessages.forEach((item) => {
      const date = parseDate(item.createdAt) || new Date();

      const dayKey = date.toDateString();

      if (dayKey !== lastDay) {
        list.push({
          type: "day",
          id: `day-${dayKey}`,
          label: formatDayLabel(date),
        });

        lastDay = dayKey;
        lastSender = null;
      }

      if (
        anchor &&
        !dividerShown &&
        unreadTotal > 0 &&
        !item.mine &&
        !item.deleted &&
        item.id &&
        item.id > anchor.afterId
      ) {
        list.push({
          type: "unread",
          id: "unread-line",
          count: unreadTotal,
        });

        dividerShown = true;
        lastSender = null;
      }

      list.push({
        type: "message",
        id: item.id || item.tempId,
        message: item,
        showSender: lastSender !== item.senderId,
      });

      lastSender = item.senderId;
    });

    return list;
  }, [selectedMessages, unreadAnchor, selectedKey]);

  // -------------------------------------------------------
  // DRAFT / EMOJI / FILES
  // -------------------------------------------------------

  const draft = selectedKey ? drafts[selectedKey] || "" : "";

  const pendingFile = selectedKey ? pendingFiles[selectedKey] : null;

  const setDraft = (value) => {
    if (!selectedKey) {
      return;
    }

    setDrafts((previous) => ({ ...previous, [selectedKey]: value }));
  };

  // Let the text box grow with the text.
  React.useLayoutEffect(() => {
    const element = textareaRef.current;

    if (element) {
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 112)}px`;
    }
  }, [draft, selectedKey]);

  const insertEmoji = (emoji) => {
    const element = textareaRef.current;

    const start = element ? element.selectionStart : draft.length;
    const end = element ? element.selectionEnd : draft.length;

    const next = draft.slice(0, start) + emoji + draft.slice(end);

    setDraft(next);

    const position = start + emoji.length;

    window.requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(position, position);
      }
    });

    setRecentEmojis((previous) => {
      const updated = [
        emoji,
        ...previous.filter((item) => item !== emoji),
      ].slice(0, 16);

      saveRecentEmojis(updated);

      return updated;
    });
  };

  // Close the emoji picker when clicking outside or pressing Esc.
  React.useEffect(() => {
    if (!emojiOpen) {
      return undefined;
    }

    const handleClick = (event) => {
      if (
        emojiPickerRef.current?.contains(event.target) ||
        emojiButtonRef.current?.contains(event.target)
      ) {
        return;
      }

      setEmojiOpen(false);
    };

    const handleKey = (event) => {
      if (event.key === "Escape") {
        setEmojiOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [emojiOpen]);

  // Close the small menus when clicking somewhere else, pressing Esc
  // or resizing the window.
  React.useEffect(() => {
    if (!msgMenu && !listMenuOpen) {
      return undefined;
    }

    const handleClick = (event) => {
      const target = event.target;

      if (
        msgMenuRef.current?.contains(target) ||
        listMenuRef.current?.contains(target) ||
        (target.closest && target.closest("[data-msg-menu-trigger]"))
      ) {
        return;
      }

      setMsgMenu(null);
      setListMenuOpen(false);
    };

    const handleKey = (event) => {
      if (event.key === "Escape") {
        setMsgMenu(null);
        setListMenuOpen(false);
      }
    };

    const handleResize = () => setMsgMenu(null);

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleResize);
    };
  }, [msgMenu, listMenuOpen]);

  React.useEffect(() => {
    if (!lightbox) {
      return undefined;
    }

    const handleKey = (event) => {
      if (event.key === "Escape") {
        setLightbox(null);
      }
    };

    document.addEventListener("keydown", handleKey);

    return () => document.removeEventListener("keydown", handleKey);
  }, [lightbox]);

  const showAttachError = (text) => {
    setAttachError(text);

    window.clearTimeout(attachTimerRef.current);

    attachTimerRef.current = window.setTimeout(
      () => setAttachError(""),
      6000
    );
  };

  React.useEffect(
    () => () => window.clearTimeout(attachTimerRef.current),
    []
  );

  const attachFile = (file) => {
    if (!file || !selectedKey) {
      return;
    }

    const extension = getFileExtension(file.name);

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      showAttachError(
        `"${file.name}" cannot be sent. Allowed: PDF, Word, Excel, PowerPoint, text, CSV, images and ZIP.`
      );

      return;
    }

    if (file.size === 0) {
      showAttachError(`"${file.name}" is empty.`);

      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      showAttachError(
        `"${file.name}" is ${formatBytes(
          file.size
        )}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`
      );

      return;
    }

    setAttachError("");

    const previewUrl = isImageFile(file.name, file.type)
      ? URL.createObjectURL(file)
      : "";

    setPendingFiles((previous) => ({
      ...previous,
      [selectedKey]: { file, previewUrl },
    }));

    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const removePendingFile = () => {
    if (!selectedKey) {
      return;
    }

    if (pendingFile?.previewUrl) {
      URL.revokeObjectURL(pendingFile.previewUrl);
    }

    setPendingFiles((previous) => {
      const next = { ...previous };

      delete next[selectedKey];

      return next;
    });
  };

  const handleFileInput = (event) => {
    const file = event.target.files && event.target.files[0];

    event.target.value = "";

    attachFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer?.files?.[0];

    if (file) {
      attachFile(file);
    }
  };

  // -------------------------------------------------------
  // SEND
  // -------------------------------------------------------

  const updateTemp = (key, tempId, changes) => {
    setMessagesByKey((previous) => ({
      ...previous,
      [key]: (previous[key] || []).map((item) =>
        item.tempId === tempId ? { ...item, ...changes } : item
      ),
    }));
  };

  const deliverMessage = async (key, tempId, text, file) => {
    try {
      let entry = conversationsRef.current.find(
        (item) => item.key === key
      );

      if (!entry) {
        throw new Error("This conversation is no longer available.");
      }

      let conversationId = entry.id;

      if (!conversationId) {
        const created = await apiPost("/chat/conversations", {
          user_id: entry.participantId,
        });

        conversationId = created.id;

        setConversations((previous) =>
          previous.map((item) =>
            item.key === key ? { ...item, id: conversationId } : item
          )
        );

        conversationsRef.current = conversationsRef.current.map(
          (item) =>
            item.key === key ? { ...item, id: conversationId } : item
        );
      }

      const payload = { text };

      if (file) {
        payload.attachment = {
          name: file.name,
          mime: file.type || "application/octet-stream",
          data_base64: await readFileAsBase64(file),
        };
      }

      const saved = normalizeMessage(
        await apiPost(
          `/chat/conversations/${conversationId}/messages`,
          payload
        )
      );

      saved.mine = true;

      const temp = (messagesRef.current[key] || []).find(
        (item) => item.tempId === tempId
      );

      if (saved.attachment && temp?.localPreviewUrl) {
        attachmentCache.set(
          saved.attachment.id,
          Promise.resolve({
            url: temp.localPreviewUrl,
            name: saved.attachment.name,
          })
        );
      }

      setMessagesByKey((previous) => {
        const others = (previous[key] || []).filter(
          (item) => item.tempId !== tempId && item.id !== saved.id
        );

        const real = others.filter((item) => item.id);
        const temps = others.filter((item) => !item.id);

        real.push(saved);
        real.sort((first, second) => first.id - second.id);

        return { ...previous, [key]: [...real, ...temps] };
      });

      // The chat I just wrote in moves to the top of the list.
      const sentLast = {
        id: saved.id,
        mine: true,
        senderName: "",
        text: saved.text,
        attachmentName: saved.attachment ? saved.attachment.name : "",
        createdAt: saved.createdAt,
      };

      localLastRef.current[key] = {
        until: Date.now() + LOCAL_LAST_MS,
        message: sentLast,
      };

      setConversations((previous) =>
        previous.map((item) =>
          item.key === key &&
          (!item.lastMessage ||
            !item.lastMessage.id ||
            item.lastMessage.id <= saved.id)
            ? { ...item, id: item.id || conversationId, lastMessage: sentLast }
            : item
        )
      );

      loadConversations();
    } catch (error) {
      delete localLastRef.current[key];

      loadConversations();

      updateTemp(key, tempId, {
        status: "failed",
        error: getErrorMessage(error, "Not sent"),
      });
    }
  };

  const handleSend = () => {
    if (!selectedKey) {
      return;
    }

    const text = draft.trim();
    const file = pendingFile?.file || null;

    if (!text && !file) {
      return;
    }

    tempCounterRef.current += 1;

    const tempId = `temp-${Date.now()}-${tempCounterRef.current}`;

    const tempMessage = {
      id: null,
      tempId,
      mine: true,
      senderName: "",
      senderId: "me",
      text,
      createdAt: new Date().toISOString(),
      status: "sending",
      localPreviewUrl: pendingFile?.previewUrl || "",
      retryFile: file,
      attachment: file
        ? {
            id: null,
            name: file.name,
            mime: file.type,
            size: file.size,
          }
        : null,
    };

    const key = selectedKey;

    // Move this chat to the top of the list right away.
    const justSent = {
      id: null,
      mine: true,
      senderName: "",
      text,
      attachmentName: file ? file.name : "",
      createdAt: tempMessage.createdAt,
    };

    localLastRef.current[key] = {
      until: Date.now() + LOCAL_LAST_MS,
      message: justSent,
    };

    setConversations((previous) =>
      previous.map((item) =>
        item.key === key ? { ...item, lastMessage: justSent } : item
      )
    );

    setMessagesByKey((previous) => ({
      ...previous,
      [key]: [...(previous[key] || []), tempMessage],
    }));

    setDrafts((previous) => ({ ...previous, [key]: "" }));

    setPendingFiles((previous) => {
      const next = { ...previous };

      delete next[key];

      return next;
    });

    setEmojiOpen(false);
    setAttachError("");

    deliverMessage(key, tempId, text, file);
  };

  const handleRetry = (message) => {
    if (!selectedKey) {
      return;
    }

    updateTemp(selectedKey, message.tempId, {
      status: "sending",
      error: "",
    });

    deliverMessage(
      selectedKey,
      message.tempId,
      message.text,
      message.retryFile || null
    );
  };

  const handleDiscard = (message) => {
    if (!selectedKey) {
      return;
    }

    setMessagesByKey((previous) => ({
      ...previous,
      [selectedKey]: (previous[selectedKey] || []).filter(
        (item) => item.tempId !== message.tempId
      ),
    }));
  };

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent?.isComposing
    ) {
      event.preventDefault();
      handleSend();
    }
  };

  // -------------------------------------------------------
  // LEFT LIST
  // -------------------------------------------------------

  // The number shown for a conversation.
  // - Open and the window is in use: 0 (the messages are being read).
  // - Open but the window is in the background: the new messages
  //   count at once, without waiting for the next refresh.
  const effectiveUnread = (entry) => {
    if (entry.key !== selectedKey) {
      return entry.unread;
    }

    if (windowActive) {
      return 0;
    }

    const readUpTo = Math.max(
      entry.myLastReadId,
      readPostedRef.current[entry.key] || 0
    );

    const received = (messagesByKey[entry.key] || []).filter(
      (item) =>
        !item.mine && !item.deleted && item.id && item.id > readUpTo
    ).length;

    return Math.max(entry.unread, received);
  };

  const totalUnread = conversations.reduce(
    (total, entry) => total + effectiveUnread(entry),
    0
  );

  const visibleConversations = (() => {
    const query = search.trim().toLowerCase();

    return sortConversations(conversations).filter((entry) => {
      if (activeFilter === "Unread" && effectiveUnread(entry) === 0) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        entry.name,
        entry.subtitle,
        entry.role,
        entry.lastMessage?.text,
        entry.lastMessage?.attachmentName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  })();

  const getPreview = (entry) => {
    const last = entry.lastMessage;

    if (!last) {
      return entry.type === "channel"
        ? "No messages yet"
        : "Tap to start chatting";
    }

    if (last.deleted) {
      return last.mine
        ? "🚫 You deleted this message"
        : "🚫 This message was deleted";
    }

    const who = last.mine
      ? "You: "
      : entry.type === "channel" && last.senderName
      ? `${last.senderName.split(" ")[0]}: `
      : "";

    const body = last.attachmentName
      ? `📎 ${last.attachmentName}${last.text ? ` ${last.text}` : ""}`
      : last.text;

    return who + body;
  };

  const getStatusLine = (entry) => {
    if (entry.type === "channel") {
      return entry.memberCount
        ? `${entry.memberCount} ${
            entry.memberCount === 1 ? "member" : "members"
          }`
        : entry.subtitle;
    }

    return entry.online ? "online" : formatLastSeen(entry.lastSeen);
  };

  // -------------------------------------------------------
  // WHAT THE QUESTION BOX SAYS
  // -------------------------------------------------------

  const chatsWithMessages = conversations.filter(
    (item) => item.id && item.lastMessage
  );

  const canDeleteAll = chatsWithMessages.length > 0;

  let dialogView = null;

  if (dialog && dialog.kind === "message") {
    const target = dialog.message;

    // "Delete for everyone" is only for my own messages that are not
    // deleted yet (like WhatsApp).
    const forEveryone = target.mine && !target.deleted;

    dialogView = {
      title: "Delete message?",
      body: forEveryone
        ? "Delete for everyone removes it for all members of this chat. Delete for me removes it from your screen only."
        : "It is removed from your screen only. Everyone else in this chat is not affected.",
      actions: [
        ...(forEveryone
          ? [
              {
                label: "Delete for everyone",
                testId: "delete-for-everyone",
                onClick: () =>
                  runDialogAction(() =>
                    performDeleteMessage(dialog.entry, target, "everyone")
                  ),
              },
            ]
          : []),
        {
          label: "Delete for me",
          testId: "delete-for-me",
          onClick: () =>
            runDialogAction(() =>
              performDeleteMessage(dialog.entry, target, "me")
            ),
        },
      ],
    };
  } else if (dialog && dialog.kind === "chat") {
    const target = dialog.entry;

    const keeper =
      target.type === "channel"
        ? "Everyone else keeps"
        : `${target.name} keeps`;

    dialogView = {
      title: `Delete this chat with ${target.name}?`,
      body:
        `The messages are removed from your list only. ${keeper} them, ` +
        'and you can bring them back any time with "Restore" in ' +
        '"Deleted & archived chats".',
      actions: [
        {
          label: "Delete chat",
          testId: "confirm-delete-chat",
          onClick: () =>
            runDialogAction(() => performDeleteChat(target)),
        },
      ],
    };
  } else if (dialog && dialog.kind === "all") {
    const count = chatsWithMessages.length;

    dialogView = {
      title: "Delete all chats?",
      body:
        `All ${count} ${count === 1 ? "chat" : "chats"} with messages ` +
        "will be removed from your list. The other people keep them, " +
        'and you can bring any chat back with "Restore" in ' +
        '"Deleted & archived chats".' +
        (totalUnread > 0
          ? `\n\nThis includes ${totalUnread} unread ${
              totalUnread === 1 ? "message" : "messages"
            }.`
          : ""),
      actions: [
        {
          label: "Delete all chats",
          testId: "confirm-delete-all",
          onClick: () => runDialogAction(performDeleteAll),
        },
      ],
    };
  }

  // =======================================================
  // RENDER
  // =======================================================

  const noStripStyle = { backgroundColor: "transparent" };

  return (
    <div ref={rootRef} className="port-chat-root mt-3">
      {/* SCROLLBARS + REMOVE THE BLACK STRIP IN INPUTS */}

      <style>
        {`
          .port-chat-root input,
          .port-chat-root textarea {
            background-color: transparent !important;
            box-shadow: none !important;
            -webkit-appearance: none;
            appearance: none;
          }

          .port-chat-root input:-webkit-autofill {
            -webkit-box-shadow: 0 0 0 1000px transparent inset !important;
          }

          .port-scrollbar::-webkit-scrollbar,
          .message-scrollbar::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }

          .port-scrollbar::-webkit-scrollbar-track,
          .message-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }

          .port-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(99, 102, 241, 0.35);
            border-radius: 999px;
          }

          .message-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.4);
            border-radius: 999px;
          }

          .port-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: rgba(99, 102, 241, 0.45) transparent;
          }

          .message-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
          }
        `}
      </style>

      {/* PAGE HEADER */}

      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
            <MdForum className="h-6 w-6" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-navy-700 dark:text-white">
              Port Communication
            </h1>

            <p className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-300">
              <span>Messages and documents between port personnel.</span>

              <span
                className="inline-flex flex-shrink-0 cursor-help"
                title={`Messages and documents are visible only to the people in the conversation (everyone in a channel). You can share PDF, Word, Excel, PowerPoint, text, CSV, image and ZIP files up to ${formatBytes(
                  MAX_FILE_BYTES
                )}. The unread counter on the bell goes down only after you open the conversation. A chat you delete (only for you), or one with no message for 6 months, moves to "Deleted & archived chats" where you can restore it. Use the arrow beside a message to delete it for you or, for your own messages, for everyone.`}
              >
                <MdInfoOutline className="h-4 w-4 text-indigo-400" />
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {connectionLost && (
            <span className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
              <MdRefresh className="h-4 w-4 animate-spin" />
              Reconnecting...
            </span>
          )}

          <div className="rounded-xl bg-white px-4 py-2 shadow-sm dark:bg-navy-800">
            <span className="text-xs text-gray-400">Unread</span>

            <span
              className="ml-2 font-bold text-navy-700 dark:text-white"
              data-testid="total-unread"
            >
              {totalUnread}
            </span>
          </div>
        </div>
      </div>

      {/* COMMUNICATION AREA */}

      <div
        ref={chatBoxRef}
        style={{ height: fitHeight ? `${fitHeight}px` : undefined }}
        className="flex h-[calc(100vh-300px)] min-h-[360px] overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-navy-800"
      >
        {/* LEFT PANEL */}

        <div
          className={`w-full min-w-0 flex-col border-r border-gray-100 dark:border-white/10 md:flex md:w-[360px] md:min-w-[360px] md:flex-shrink-0 ${
            showMobileChat ? "hidden md:flex" : "flex"
          }`}
        >
          {/* DELETED & ARCHIVED CHATS (replaces the list while open) */}

          {showArchive && (
            <ArchivePanel
              items={archived}
              restoringId={restoringId}
              error={archiveError}
              onBack={() => {
                setShowArchive(false);
                setArchiveError("");
              }}
              onRestore={handleRestoreChat}
            />
          )}

          <div
            className={`border-b border-gray-100 p-3 dark:border-white/10 ${
              showArchive ? "hidden" : ""
            }`}
          >
            {/* SEARCH */}

            <div className="flex items-center rounded-xl bg-gray-100 px-3 py-2.5 dark:bg-navy-700">
              <MdSearch className="mr-2 h-5 w-5 flex-shrink-0 text-gray-400" />

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, role or message..."
                aria-label="Search conversations"
                style={noStripStyle}
                className="w-full !bg-transparent text-sm text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="rounded-full p-1 text-gray-400"
                >
                  <MdClose className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* FILTERS */}

            <div className="mt-3 flex items-center gap-2">
              {["All", "Unread"].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                    activeFilter === filter
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-300"
                  }`}
                >
                  {filter}

                  {filter === "Unread" && totalUnread > 0 && (
                    <span className="ml-1.5">{totalUnread}</span>
                  )}
                </button>
              ))}

              {/* THREE DOTS: DELETE ALL CHATS */}

              <div ref={listMenuRef} className="relative ml-auto">
                <button
                  type="button"
                  aria-label="More options"
                  title="More options"
                  aria-haspopup="menu"
                  aria-expanded={listMenuOpen}
                  data-testid="list-menu-button"
                  onClick={() => setListMenuOpen((open) => !open)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-navy-700"
                >
                  <MdMoreVert className="h-5 w-5" />
                </button>

                {listMenuOpen && (
                  <div
                    role="menu"
                    data-testid="list-menu"
                    className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-navy-700"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!canDeleteAll}
                      onClick={openDeleteAll}
                      data-testid="delete-all-chats"
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-500/10"
                    >
                      <MdDeleteSweep className="h-5 w-5" />
                      Delete all chats
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* DELETED & ARCHIVED CHATS */}

            {archived.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setArchiveError("");
                  setShowArchive(true);
                  loadArchived();
                }}
                data-testid="open-archive"
                className="mt-3 flex w-full items-center gap-3 rounded-xl bg-gray-100 px-3 py-2.5 text-left text-xs font-semibold text-gray-600 transition hover:bg-gray-200 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600"
              >
                <MdArchive className="h-5 w-5 flex-shrink-0 text-indigo-500" />

                <span className="flex-1">Deleted & archived chats</span>

                <span
                  data-testid="archive-count"
                  className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white"
                >
                  {archived.length}
                </span>
              </button>
            )}
          </div>

          {/* CONTACTS */}

          <div
            className={`port-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto ${
              showArchive ? "hidden" : ""
            }`}
            data-testid="conversation-list"
          >
            {loadState === "loading" && (
              <div className="p-6 text-center text-sm text-gray-400">
                Loading conversations...
              </div>
            )}

            {loadState === "error" && (
              <div className="p-6 text-center">
                <MdErrorOutline className="mx-auto mb-2 h-8 w-8 text-red-400" />

                <p className="text-sm font-semibold text-navy-700 dark:text-white">
                  Port Communication is not available
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  {loadError}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setLoadState("loading");
                    loadConversations();
                  }}
                  className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  Try again
                </button>
              </div>
            )}

            {loadState === "ready" &&
              visibleConversations.length === 0 && (
                <div className="p-6 text-center text-sm text-gray-400">
                  {conversations.length === 0
                    ? "There are no other port accounts to chat with yet."
                    : activeFilter === "Unread" && !search
                    ? "No unread messages."
                    : "No conversation matches your search."}
                </div>
              )}

            {visibleConversations.map((entry) => {
              const unread = effectiveUnread(entry);

              const lastDate = parseDate(entry.lastMessage?.createdAt);

              const isSelected = entry.key === selectedKey;

              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => handleSelectConversation(entry)}
                  data-testid="conversation-row"
                  data-name={entry.name}
                  className={`group flex w-full min-w-0 flex-shrink-0 items-center gap-3 border-b border-gray-50 px-4 py-3.5 text-left transition dark:border-white/5 ${
                    isSelected
                      ? "bg-indigo-50 dark:bg-indigo-500/10"
                      : "hover:bg-gray-50 dark:hover:bg-navy-700"
                  }`}
                >
                  <Avatar
                    name={entry.name}
                    channel={entry.type === "channel"}
                    online={
                      entry.type === "direct" ? entry.online : undefined
                    }
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                        {entry.name}
                      </p>

                      <span
                        className={`ml-2 flex-shrink-0 text-[10px] ${
                          unread > 0
                            ? "font-bold text-indigo-600 dark:text-indigo-300"
                            : "text-gray-400"
                        }`}
                      >
                        {formatListTime(lastDate)}
                      </span>
                    </div>

                    {entry.subtitle && (
                      <p className="truncate text-[11px] text-indigo-500 dark:text-indigo-300">
                        {entry.subtitle}
                      </p>
                    )}

                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p
                        className={`truncate text-xs ${
                          unread > 0
                            ? "font-semibold text-navy-700 dark:text-white"
                            : "text-gray-400"
                        }`}
                      >
                        {getPreview(entry)}
                      </p>

                      {unread > 0 && (
                        <span
                          data-testid="row-unread"
                          className="flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white"
                        >
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* CHAT WINDOW */}

        <div
          className={`relative min-w-0 flex-1 flex-col ${
            showMobileChat ? "flex" : "hidden md:flex"
          }`}
          onDragOver={(event) => {
            if (selectedEntry) {
              event.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setDragging(false);
            }
          }}
          onDrop={selectedEntry ? handleDrop : undefined}
        >
          {selectedEntry ? (
            <>
              {/* CHAT HEADER */}

              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5 dark:border-white/10 md:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowMobileChat(false)}
                    aria-label="Back to conversations"
                    className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-navy-700 md:hidden"
                  >
                    <MdArrowBack className="h-5 w-5" />
                  </button>

                  <Avatar
                    name={selectedEntry.name}
                    channel={selectedEntry.type === "channel"}
                    size="h-11 w-11"
                    text="text-xs"
                    online={
                      selectedEntry.type === "direct"
                        ? selectedEntry.online
                        : undefined
                    }
                  />

                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-bold text-navy-700 dark:text-white"
                      data-testid="chat-title"
                    >
                      {selectedEntry.name}
                    </p>

                    <div className="flex items-center gap-2 text-xs">
                      {selectedEntry.subtitle && (
                        <>
                          <span className="truncate text-gray-400">
                            {selectedEntry.subtitle}
                          </span>

                          <span className="text-gray-300">•</span>
                        </>
                      )}

                      <span
                        data-testid="chat-status"
                        className={
                          selectedEntry.type === "direct" &&
                          selectedEntry.online
                            ? "font-semibold text-green-500"
                            : "text-gray-400"
                        }
                      >
                        {getStatusLine(selectedEntry)}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedEntry.id && selectedEntry.lastMessage && (
                  <button
                    type="button"
                    onClick={openDeleteChat}
                    title="Delete chat (only for you)"
                    aria-label="Delete chat"
                    data-testid="delete-chat"
                    className="ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                  >
                    <MdDeleteOutline className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* MESSAGES */}

              <div className="relative min-h-0 flex-1">
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  data-testid="message-area"
                  className="message-scrollbar h-full overflow-y-auto bg-[#f5f7fb] p-4 dark:bg-navy-900 md:p-6"
                >
                  {selectedMessages === undefined && !messageError && (
                    <p className="py-10 text-center text-sm text-gray-400">
                      Loading messages...
                    </p>
                  )}

                  {messageError && (
                    <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-xs font-semibold text-red-500 dark:bg-red-500/10">
                      <MdErrorOutline className="h-4 w-4" />

                      {messageError}

                      <button
                        type="button"
                        onClick={() =>
                          loadMessages(selectedEntry.key, true)
                        }
                        className="underline"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {selectedMessages !== undefined &&
                    selectedMessages.length === 0 && (
                      <div className="flex flex-col items-center py-16 text-center">
                        <MdForum className="mb-3 h-10 w-10 text-indigo-300" />

                        <p className="text-sm font-semibold text-navy-700 dark:text-white">
                          No messages yet
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          {selectedEntry.type === "channel"
                            ? "Send the first message to this channel."
                            : `Say hello to ${selectedEntry.name}.`}
                        </p>
                      </div>
                    )}

                  <div className="space-y-1.5">
                    {rows.map((row) => {
                      if (row.type === "day") {
                        return (
                          <div
                            key={row.id}
                            className="flex justify-center py-2"
                          >
                            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-gray-500 shadow-sm dark:bg-navy-800 dark:text-gray-300">
                              {row.label}
                            </span>
                          </div>
                        );
                      }

                      if (row.type === "unread") {
                        return (
                          <div
                            key={row.id}
                            ref={dividerRef}
                            data-testid="unread-divider"
                            className="flex justify-center py-2"
                          >
                            <span className="rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-bold uppercase text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
                              {row.count} unread{" "}
                              {row.count === 1 ? "message" : "messages"}
                            </span>
                          </div>
                        );
                      }

                      const message = row.message;

                      const read =
                        message.mine &&
                        message.id &&
                        selectedEntry.peerLastReadId !== null &&
                        message.id <= selectedEntry.peerLastReadId;

                      return (
                        <MessageBubble
                          key={row.id}
                          message={message}
                          showSender={row.showSender}
                          isChannel={selectedEntry.type === "channel"}
                          read={!!read}
                          onOpenImage={setLightbox}
                          onRetry={handleRetry}
                          onDiscard={handleDiscard}
                          onOpenMenu={openMessageMenu}
                        />
                      );
                    })}
                  </div>
                </div>

                {showScrollButton && (
                  <button
                    type="button"
                    onClick={() => {
                      scrollToBottom(true);
                      setNewBelow(0);
                    }}
                    aria-label="Scroll to latest message"
                    data-testid="scroll-latest"
                    className="absolute bottom-4 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-lg hover:text-indigo-600 dark:bg-navy-700 dark:text-gray-200"
                  >
                    <MdKeyboardArrowDown className="h-6 w-6" />

                    {newBelow > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                        {newBelow}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* COMPOSER */}

              <div className="relative border-t border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-navy-800 md:p-4">
                {attachError && (
                  <div
                    role="alert"
                    className="mb-2 flex items-start justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 dark:bg-red-500/10"
                  >
                    <span>{attachError}</span>

                    <button
                      type="button"
                      onClick={() => setAttachError("")}
                      aria-label="Dismiss"
                    >
                      <MdClose className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {pendingFile && (
                  <div
                    data-testid="pending-file"
                    className="mb-2 flex items-center gap-3 rounded-xl bg-gray-100 p-2.5 dark:bg-navy-700"
                  >
                    {pendingFile.previewUrl ? (
                      <img
                        src={pendingFile.previewUrl}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      (() => {
                        const kind = getFileKind(
                          pendingFile.file.name,
                          pendingFile.file.type
                        );

                        return (
                          <div
                            className={`flex h-12 w-12 items-center justify-center rounded-lg ${kind.color}`}
                          >
                            <kind.Icon className="h-6 w-6" />
                          </div>
                        );
                      })()
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-700 dark:text-white">
                        {pendingFile.file.name}
                      </p>

                      <p className="text-[11px] text-gray-400">
                        {formatBytes(pendingFile.file.size)} • ready to
                        send. Add a message below if you like.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={removePendingFile}
                      aria-label="Remove document"
                      className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-red-500 dark:hover:bg-navy-600"
                    >
                      <MdClose className="h-5 w-5" />
                    </button>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    accept={ALLOWED_EXTENSIONS.map((item) => `.${item}`).join(",")}
                    onChange={handleFileInput}
                    data-testid="file-input"
                  />

                  <div className="relative flex-shrink-0">
                    {emojiOpen && (
                      <EmojiPicker
                        recent={recentEmojis}
                        onPick={insertEmoji}
                        pickerRef={emojiPickerRef}
                      />
                    )}

                    <button
                      ref={emojiButtonRef}
                      type="button"
                      title="Emoji"
                      aria-label="Emoji"
                      data-testid="emoji-button"
                      onClick={() => setEmojiOpen((open) => !open)}
                      className={`flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-gray-100 hover:text-indigo-500 dark:hover:bg-navy-700 ${
                        emojiOpen
                          ? "bg-gray-100 text-indigo-500 dark:bg-navy-700"
                          : "text-gray-400"
                      }`}
                    >
                      <MdInsertEmoticon className="h-6 w-6" />
                    </button>
                  </div>

                  <button
                    type="button"
                    title="Attach a document or image"
                    aria-label="Attach a document or image"
                    data-testid="attach-button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-indigo-500 dark:hover:bg-navy-700"
                  >
                    <MdAttachFile className="h-6 w-6" />
                  </button>

                  <div className="flex min-h-[46px] flex-1 items-center rounded-2xl bg-gray-100 px-4 py-1.5 dark:bg-navy-700">
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      data-testid="message-input"
                      aria-label="Type a message"
                      placeholder={
                        pendingFile
                          ? "Add a message (optional)"
                          : `Message ${selectedEntry.name}`
                      }
                      style={noStripStyle}
                      className="max-h-28 min-h-[36px] flex-1 resize-none !bg-transparent py-2 text-sm text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!draft.trim() && !pendingFile}
                    title="Send"
                    aria-label="Send"
                    data-testid="send-button"
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <MdSend className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {dragging && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-indigo-600/10 backdrop-blur-[1px]">
                  <div className="rounded-2xl border-2 border-dashed border-indigo-400 bg-white px-8 py-6 text-center shadow-xl dark:bg-navy-800">
                    <MdAttachFile className="mx-auto mb-2 h-8 w-8 text-indigo-500" />

                    <p className="font-bold text-navy-700 dark:text-white">
                      Drop the document to send
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <MdForum className="mb-4 h-12 w-12 text-indigo-300" />

              <h3 className="font-bold text-navy-700 dark:text-white">
                Select a conversation
              </h3>

              <p className="mt-1 max-w-xs text-sm text-gray-400">
                Choose a colleague or channel on the left to send
                messages and documents.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MESSAGE MENU (the arrow beside a message) */}

      {msgMenu && (
        <BodyPortal anchor={rootRef}>
          <MessageMenu
            menu={msgMenu}
            menuRef={msgMenuRef}
            onDelete={openDeleteMessage}
          />
        </BodyPortal>
      )}

      {/* QUESTION BOX: delete a message / a chat / all chats */}

      {dialogView && (
        <BodyPortal anchor={rootRef}>
          <ConfirmDialog
            title={dialogView.title}
            body={dialogView.body}
            actions={dialogView.actions}
            busy={dialogBusy}
            error={dialogError}
            onClose={closeDialog}
          />
        </BodyPortal>
      )}

      {/* IMAGE VIEWER */}

      {lightbox && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          data-testid="lightbox"
        >
          <div className="absolute right-4 top-4 flex gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                downloadAttachment(lightbox.attachment).catch(() => {});
              }}
              aria-label="Download image"
              className="rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
            >
              <MdFileDownload className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="Close"
              className="rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
            >
              <MdClose className="h-6 w-6" />
            </button>
          </div>

          <img
            src={lightbox.url}
            alt={lightbox.attachment.name}
            onClick={(event) => event.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
};

export default PortCommunication;