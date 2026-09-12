import React from "react";

import {
  MdSearch,
  MdSend,
  MdAttachFile,
  MdMoreVert,
  MdArrowBack,
  MdDoneAll,
  MdPerson,
  MdAdminPanelSettings,
  MdAnchor,
  MdLocalShipping,
  MdSecurity,
  MdEngineering,
  MdClose,
  MdLock,
  MdInfoOutline,
  MdInsertEmoticon,
  MdCall,
  MdVideocam,
  MdForum,
  MdVerifiedUser,
  MdKey,
} from "react-icons/md";

// =========================================================
// PORT COMMUNICATION — END-TO-END ENCRYPTED
// =========================================================
//
// Karwar Port Smart Sea Port Management & Monitoring System
//
// Security model:
//
// User
//   ↓
// Browser-side private key
//   ↓
// ECDH P-256
//   ↓
// HKDF-SHA-256
//   ↓
// AES-256-GCM
//   ↓
// Ciphertext
//   ↓
// WSS
//   ↓
// FastAPI
//   ↓
// PostgreSQL
//
// IMPORTANT:
// This frontend implements the cryptographic mechanism for the
// prototype. Production deployment still requires:
//
// - authenticated user identities
// - secure public-key registration
// - public-key verification
// - secure key rotation
// - device/session management
// - backend WebSocket authentication
// - encrypted attachment handling
//
// The backend must NEVER receive plaintext messages.
//
// =========================================================


// =========================================================
// CURRENT USER
// =========================================================

const currentUser = {
  id: "U001",
  name: "Port Administrator",
  role: "Port Administrator",
  status: "Online",
};


// =========================================================
// DEMONSTRATION USERS
// =========================================================

const users = [
  {
    id: "U001",
    name: "Port Administrator",
    role: "Port Administrator",
    department: "Administration",
    status: "Online",
    avatar: "PA",
  },

  {
    id: "U002",
    name: "Marine Officer",
    role: "Marine Officer",
    department: "Marine Operations",
    status: "Online",
    avatar: "MO",
  },

  {
    id: "U003",
    name: "Port Operations Officer",
    role: "Operations Officer",
    department: "Port Operations",
    status: "Online",
    avatar: "PO",
  },

  {
    id: "U004",
    name: "Cargo Officer",
    role: "Cargo Officer",
    department: "Cargo Operations",
    status: "Away",
    avatar: "CO",
  },

  {
    id: "U005",
    name: "Gate & Truck Officer",
    role: "Gate Officer",
    department: "Gate Operations",
    status: "Online",
    avatar: "GT",
  },

  {
    id: "U006",
    name: "Security Officer",
    role: "Security Officer",
    department: "Port Security",
    status: "Offline",
    avatar: "SO",
  },

  {
    id: "U007",
    name: "Maintenance Officer",
    role: "Maintenance Officer",
    department: "Engineering",
    status: "Online",
    avatar: "ME",
  },
];


// =========================================================
// ROLE ICON
// =========================================================

const getRoleIcon = (role) => {
  if (role === "Port Administrator") {
    return <MdAdminPanelSettings />;
  }

  if (role === "Marine Officer") {
    return <MdAnchor />;
  }

  if (role === "Cargo Officer") {
    return <MdLocalShipping />;
  }

  if (role === "Security Officer") {
    return <MdSecurity />;
  }

  if (role === "Maintenance Officer") {
    return <MdEngineering />;
  }

  return <MdPerson />;
};


// =========================================================
// STATUS
// =========================================================

const getStatusColor = (status) => {
  if (status === "Online") {
    return "text-green-500";
  }

  if (status === "Away") {
    return "text-yellow-500";
  }

  return "text-gray-400";
};


// =========================================================
// STATUS DOT
// =========================================================

const getStatusDotColor = (status) => {
  if (status === "Online") {
    return "bg-green-500";
  }

  if (status === "Away") {
    return "bg-yellow-500";
  }

  return "bg-gray-400";
};


// =========================================================
// DEMONSTRATION PLAINTEXT DATA
// =========================================================
//
// These are only initial prototype messages.
//
// During initialization they are encrypted in the browser
// before being placed into the active conversation state.
//
// =========================================================

const initialConversations = [
  {
    id: "C001",
    participantId: "U002",
    unread: 2,

    messages: [
      {
        id: 1,
        senderId: "U002",
        text: "Good morning. MV Ocean Pearl has arrived near the harbour.",
        time: "09:12 AM",
      },

      {
        id: 2,
        senderId: "U001",
        text: "Received. Please coordinate with the berth operations team.",
        time: "09:14 AM",
      },

      {
        id: 3,
        senderId: "U002",
        text: "Berth 02 is ready. I will proceed with the inspection.",
        time: "09:18 AM",
      },
    ],
  },

  {
    id: "C002",
    participantId: "U003",
    unread: 1,

    messages: [
      {
        id: 4,
        senderId: "U003",
        text: "Berth 04 maintenance is affecting today's schedule.",
        time: "08:45 AM",
      },

      {
        id: 5,
        senderId: "U001",
        text: "Please send the updated berth availability.",
        time: "08:50 AM",
      },
    ],
  },

  {
    id: "C003",
    participantId: "U004",
    unread: 0,

    messages: [
      {
        id: 6,
        senderId: "U004",
        text: "Cargo documentation for MV Karwar Star has been reviewed.",
        time: "Yesterday",
      },
    ],
  },

  {
    id: "C004",
    participantId: "U005",
    unread: 3,

    messages: [
      {
        id: 7,
        senderId: "U005",
        text: "There are currently 8 trucks waiting at the main gate.",
        time: "08:20 AM",
      },
    ],
  },

  {
    id: "C005",
    participantId: "U006",
    unread: 0,

    messages: [
      {
        id: 8,
        senderId: "U006",
        text: "Security inspection completed for the cargo area.",
        time: "Yesterday",
      },
    ],
  },

  {
    id: "C006",
    participantId: "U007",
    unread: 0,

    messages: [
      {
        id: 9,
        senderId: "U007",
        text: "Maintenance work on Berth 04 is progressing.",
        time: "Yesterday",
      },
    ],
  },
];


// =========================================================
// CRYPTOGRAPHIC HELPERS
// =========================================================

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();


// ---------------------------------------------------------
// ArrayBuffer → Base64
// ---------------------------------------------------------

const bufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);

  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary);
};


// ---------------------------------------------------------
// Base64 → Uint8Array
// ---------------------------------------------------------

const base64ToBuffer = (base64) => {
  const binary = window.atob(base64);

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};


// ---------------------------------------------------------
// Export public key
// ---------------------------------------------------------

const exportPublicKey = async (publicKey) => {
  const exported = await window.crypto.subtle.exportKey(
    "raw",
    publicKey
  );

  return bufferToBase64(exported);
};


// ---------------------------------------------------------
// Import public key
// ---------------------------------------------------------

const importPublicKey = async (base64Key) => {
  const keyData = base64ToBuffer(base64Key);

  return window.crypto.subtle.importKey(
    "raw",
    keyData,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    []
  );
};


// ---------------------------------------------------------
// Generate ECDH identity
// ---------------------------------------------------------

const generateIdentity = async () => {
  const keyPair =
    await window.crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveBits"]
    );

  const publicKey =
    await exportPublicKey(keyPair.publicKey);

  return {
    privateKey: keyPair.privateKey,
    publicKey,
    createdAt: Date.now(),
  };
};


// =========================================================
// DERIVE MESSAGE ENCRYPTION KEY
// =========================================================

const deriveMessageKey = async ({
  privateKey,
  recipientPublicKey,
  salt,
}) => {
  const sharedSecret =
    await window.crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: recipientPublicKey,
      },
      privateKey,
      256
    );


  const hkdfBaseKey =
    await window.crypto.subtle.importKey(
      "raw",
      sharedSecret,
      "HKDF",
      false,
      ["deriveKey"]
    );


  return window.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: textEncoder.encode(
        "Karwar-Port-Secure-Communication"
      ),
    },
    hkdfBaseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
};


// =========================================================
// ENCRYPT MESSAGE
// =========================================================

const encryptMessage = async ({
  text,
  senderIdentity,
  recipientPublicKey,
}) => {
  const iv =
    window.crypto.getRandomValues(
      new Uint8Array(12)
    );

  const salt =
    window.crypto.getRandomValues(
      new Uint8Array(32)
    );


  const encryptionKey =
    await deriveMessageKey({
      privateKey: senderIdentity.privateKey,
      recipientPublicKey,
      salt,
    });


  const encrypted =
    await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      encryptionKey,
      textEncoder.encode(text)
    );


  return {
    ciphertext: bufferToBase64(encrypted),
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    senderPublicKey: senderIdentity.publicKey,
    encryption: "AES-256-GCM",
    keyAgreement: "ECDH-P256",
    keyDerivation: "HKDF-SHA-256",
  };
};


// =========================================================
// DECRYPT MESSAGE
// =========================================================

const decryptMessage = async ({
  encryptedMessage,
  recipientIdentity,
}) => {
  try {
    const senderPublicKey =
      await importPublicKey(
        encryptedMessage.senderPublicKey
      );


    const salt =
      base64ToBuffer(
        encryptedMessage.salt
      );


    const iv =
      base64ToBuffer(
        encryptedMessage.iv
      );


    const ciphertext =
      base64ToBuffer(
        encryptedMessage.ciphertext
      );


    const decryptionKey =
      await deriveMessageKey({
        privateKey:
          recipientIdentity.privateKey,
        recipientPublicKey:
          senderPublicKey,
        salt,
      });


    const decrypted =
      await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv,
        },
        decryptionKey,
        ciphertext
      );


    return textDecoder.decode(
      decrypted
    );

  } catch (error) {
    console.error(
      "Message decryption failed:",
      error
    );

    return "Unable to decrypt message.";
  }
};


// =========================================================
// IDENTITY STORAGE
// =========================================================
//
// For this frontend prototype the identity is generated
// locally and kept in memory.
//
// Production:
// private keys should use secure device/browser storage
// with appropriate authentication and key protection.
//
// =========================================================

const identityCache = new Map();


// =========================================================
// GET OR CREATE IDENTITY
// =========================================================

const getIdentity = async (userId) => {
  if (identityCache.has(userId)) {
    return identityCache.get(userId);
  }

  const identity =
    await generateIdentity();

  identityCache.set(
    userId,
    identity
  );

  return identity;
};


// =========================================================
// INITIALIZE DEMO ENCRYPTION
// =========================================================

const initializeEncryptedConversations =
  async () => {

    const initialized = [];

    // Generate an identity for every demonstration user.
    for (const user of users) {
      await getIdentity(user.id);
    }


    for (const conversation of initialConversations) {

      const participant =
        users.find(
          (user) =>
            user.id ===
            conversation.participantId
        );

      if (!participant) {
        initialized.push(conversation);
        continue;
      }


      const encryptedMessages = [];


      for (const message of conversation.messages) {

        const senderIdentity =
          await getIdentity(
            message.senderId
          );

        const recipientId =
          message.senderId === currentUser.id
            ? participant.id
            : currentUser.id;


        const recipientIdentity =
          await getIdentity(
            recipientId
          );


        const recipientPublicKey =
          await importPublicKey(
            recipientIdentity.publicKey
          );


        const encrypted =
          await encryptMessage({
            text: message.text,
            senderIdentity,
            recipientPublicKey,
          });


        encryptedMessages.push({
          id: message.id,
          senderId: message.senderId,
          time: message.time,

          encrypted: true,

          ciphertext:
            encrypted.ciphertext,

          iv:
            encrypted.iv,

          salt:
            encrypted.salt,

          senderPublicKey:
            encrypted.senderPublicKey,

          encryption:
            encrypted.encryption,

          keyAgreement:
            encrypted.keyAgreement,

          keyDerivation:
            encrypted.keyDerivation,
        });
      }


      initialized.push({
        ...conversation,
        messages:
          encryptedMessages,
      });
    }


    return initialized;
  };


// =========================================================
// MAIN COMPONENT
// =========================================================

const PortCommunication = () => {

  const [conversations, setConversations] =
    React.useState([]);

  const [selectedConversationId, setSelectedConversationId] =
    React.useState("C001");

  const [search, setSearch] =
    React.useState("");

  const [message, setMessage] =
    React.useState("");

  const [showMobileChat, setShowMobileChat] =
    React.useState(false);

  const [activeFilter, setActiveFilter] =
    React.useState("All");

  const [isInitializing, setIsInitializing] =
    React.useState(true);

  const [showSecurityInfo, setShowSecurityInfo] =
    React.useState(false);


  // =======================================================
  // INITIALIZE ENCRYPTION
  // =======================================================

  React.useEffect(() => {

    let mounted = true;

    const initialize = async () => {

      try {

        const encryptedConversations =
          await initializeEncryptedConversations();


        if (mounted) {
          setConversations(
            encryptedConversations
          );
        }

      } catch (error) {

        console.error(
          "Secure communication initialization failed:",
          error
        );

      } finally {

        if (mounted) {
          setIsInitializing(false);
        }

      }
    };


    initialize();


    return () => {
      mounted = false;
    };

  }, []);


  // =======================================================
  // SELECTED CONVERSATION
  // =======================================================

  const selectedConversation =
    conversations.find(
      (conversation) =>
        conversation.id ===
        selectedConversationId
    );


  // =======================================================
  // SELECTED USER
  // =======================================================

  const selectedUser =
    selectedConversation
      ? users.find(
          (user) =>
            user.id ===
            selectedConversation.participantId
        )
      : null;


  // =======================================================
  // FILTER CONVERSATIONS
  // =======================================================

  const filteredConversations =
    conversations.filter(
      (conversation) => {

        const user =
          users.find(
            (item) =>
              item.id ===
              conversation.participantId
          );


        if (!user) {
          return false;
        }


        const searchValue =
          search
            .toLowerCase()
            .trim();


        const matchesSearch =
          !searchValue ||
          user.name
            .toLowerCase()
            .includes(searchValue) ||
          user.role
            .toLowerCase()
            .includes(searchValue) ||
          user.department
            .toLowerCase()
            .includes(searchValue);


        const matchesFilter =
          activeFilter === "All" ||
          (
            activeFilter === "Unread" &&
            conversation.unread > 0
          );


        return (
          matchesSearch &&
          matchesFilter
        );
      }
    );


  // =======================================================
  // SELECT CONVERSATION
  // =======================================================

  const handleSelectConversation =
    (conversationId) => {

      setSelectedConversationId(
        conversationId
      );

      setShowMobileChat(true);


      setConversations(
        (previous) =>
          previous.map(
            (conversation) =>
              conversation.id ===
              conversationId
                ? {
                    ...conversation,
                    unread: 0,
                  }
                : conversation
          )
      );
    };


  // =======================================================
  // SEND ENCRYPTED MESSAGE
  // =======================================================

  const handleSendMessage =
    async () => {

      const trimmedMessage =
        message.trim();


      if (
        !trimmedMessage ||
        !selectedConversation ||
        !selectedUser
      ) {
        return;
      }


      try {

        const senderIdentity =
          await getIdentity(
            currentUser.id
          );


        const recipientIdentity =
          await getIdentity(
            selectedUser.id
          );


        const recipientPublicKey =
          await importPublicKey(
            recipientIdentity.publicKey
          );


        // ================================================
        // ACTUAL CLIENT-SIDE ENCRYPTION
        // ================================================

        const encrypted =
          await encryptMessage({
            text: trimmedMessage,
            senderIdentity,
            recipientPublicKey,
          });


        const newMessage = {

          id: Date.now(),

          senderId:
            currentUser.id,

          time:
            new Date().toLocaleTimeString(
              [],
              {
                hour: "2-digit",
                minute: "2-digit",
              }
            ),

          // ----------------------------------------------
          // IMPORTANT:
          // No plaintext message is stored here.
          // ----------------------------------------------

          encrypted: true,

          ciphertext:
            encrypted.ciphertext,

          iv:
            encrypted.iv,

          salt:
            encrypted.salt,

          senderPublicKey:
            encrypted.senderPublicKey,

          encryption:
            encrypted.encryption,

          keyAgreement:
            encrypted.keyAgreement,

          keyDerivation:
            encrypted.keyDerivation,
        };


        setConversations(
          (previous) =>
            previous.map(
              (conversation) =>
                conversation.id ===
                selectedConversationId
                  ? {
                      ...conversation,

                      messages: [
                        ...conversation.messages,
                        newMessage,
                      ],
                    }
                  : conversation
            )
        );


        setMessage("");

      } catch (error) {

        console.error(
          "Encryption failed:",
          error
        );

      }
    };


  // =======================================================
  // ENTER KEY
  // =======================================================

  const handleMessageKeyDown =
    (event) => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        handleSendMessage();
      }
    };


  // =======================================================
  // MOBILE BACK
  // =======================================================

  const handleBack = () => {
    setShowMobileChat(false);
  };


  // =======================================================
  // TOTAL UNREAD
  // =======================================================

  const totalUnread =
    conversations.reduce(
      (total, conversation) =>
        total + conversation.unread,
      0
    );


  // =======================================================
  // LOADING
  // =======================================================

  if (isInitializing) {

    return (

      <div className="mt-3">

        <div className="flex h-[680px] items-center justify-center rounded-[24px] bg-white shadow-sm dark:bg-navy-800">

          <div className="flex flex-col items-center">

            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 dark:bg-green-500/10">

              <MdLock className="h-8 w-8 animate-pulse text-green-500" />

            </div>

            <p className="font-bold text-navy-700 dark:text-white">
              Establishing secure communication...
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Generating local encryption identities
            </p>

          </div>

        </div>

      </div>
    );
  }


  // =======================================================
  // RENDER
  // =======================================================

  return (

    <div className="mt-3">

      {/* =================================================
          SCROLLBARS
          ================================================= */}

      <style>
        {`
          .port-scrollbar::-webkit-scrollbar {
            width: 7px;
            height: 7px;
          }

          .port-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }

          .port-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(99, 102, 241, 0.35);
            border-radius: 999px;
          }

          .port-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: rgba(99, 102, 241, 0.45) transparent;
          }

          .message-scrollbar::-webkit-scrollbar {
            width: 6px;
          }

          .message-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }

          .message-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.35);
            border-radius: 999px;
          }

          .message-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
          }
        `}
      </style>


      {/* =================================================
          PAGE HEADER
          ================================================= */}

      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

        <div>

          <div className="flex items-center gap-3">

            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-500/10 text-green-500">

              <MdSecurity className="h-6 w-6" />

            </div>

            <div>

              <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
                Secure Port Communication
              </h1>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                End-to-end encrypted communication between authorized port personnel.
              </p>

            </div>

          </div>

        </div>


        {/* SECURITY STATUS */}

        <div className="flex items-center gap-3">

          <button
            type="button"
            onClick={() =>
              setShowSecurityInfo(
                !showSecurityInfo
              )
            }
            className="flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-2.5 transition hover:bg-green-100 dark:border-green-500/20 dark:bg-green-500/10 dark:hover:bg-green-500/20"
          >

            <MdVerifiedUser className="h-4 w-4 text-green-500" />

            <span className="text-xs font-semibold text-green-600 dark:text-green-400">
              E2EE Active
            </span>

          </button>

          <div className="hidden rounded-xl bg-white px-4 py-2.5 shadow-sm dark:bg-navy-800 md:block">

            <span className="text-xs text-gray-400">
              Unread
            </span>

            <span className="ml-2 font-bold text-navy-700 dark:text-white">
              {totalUnread}
            </span>

          </div>

        </div>

      </div>


      {/* =================================================
          SECURITY DETAILS
          ================================================= */}

      {showSecurityInfo && (

        <div className="mb-5 rounded-[20px] border border-green-100 bg-green-50 p-5 dark:border-green-500/20 dark:bg-navy-800">

          <div className="flex items-start gap-3">

            <MdLock className="mt-0.5 h-6 w-6 flex-shrink-0 text-green-500" />

            <div className="flex-1">

              <div className="flex items-center justify-between">

                <p className="font-bold text-green-700 dark:text-green-300">
                  End-to-End Encryption
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setShowSecurityInfo(false)
                  }
                  className="text-gray-400 hover:text-gray-600"
                >
                  <MdClose />
                </button>

              </div>

              <p className="mt-1 text-sm leading-6 text-green-600 dark:text-green-200">
                Messages are encrypted in the sender's browser before transmission.
                The communication server is designed to handle ciphertext rather
                than plaintext.
              </p>


              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">

                <div className="rounded-xl bg-white p-3 dark:bg-navy-700">

                  <MdKey className="mb-2 h-5 w-5 text-indigo-500" />

                  <p className="text-[10px] uppercase text-gray-400">
                    Key Agreement
                  </p>

                  <p className="mt-1 text-xs font-bold text-navy-700 dark:text-white">
                    ECDH P-256
                  </p>

                </div>


                <div className="rounded-xl bg-white p-3 dark:bg-navy-700">

                  <MdLock className="mb-2 h-5 w-5 text-green-500" />

                  <p className="text-[10px] uppercase text-gray-400">
                    Encryption
                  </p>

                  <p className="mt-1 text-xs font-bold text-navy-700 dark:text-white">
                    AES-256-GCM
                  </p>

                </div>


                <div className="rounded-xl bg-white p-3 dark:bg-navy-700">

                  <MdSecurity className="mb-2 h-5 w-5 text-blue-500" />

                  <p className="text-[10px] uppercase text-gray-400">
                    Key Derivation
                  </p>

                  <p className="mt-1 text-xs font-bold text-navy-700 dark:text-white">
                    HKDF-SHA-256
                  </p>

                </div>


                <div className="rounded-xl bg-white p-3 dark:bg-navy-700">

                  <MdVerifiedUser className="mb-2 h-5 w-5 text-purple-500" />

                  <p className="text-[10px] uppercase text-gray-400">
                    Transport
                  </p>

                  <p className="mt-1 text-xs font-bold text-navy-700 dark:text-white">
                    WSS
                  </p>

                </div>

              </div>

            </div>

          </div>

        </div>

      )}


      {/* =================================================
          COMMUNICATION AREA
          ================================================= */}

      <div className="flex h-[680px] overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-navy-800">


        {/* =================================================
            LEFT PANEL
            ================================================= */}

        <div
          className={`w-full min-w-0 flex-col border-r border-gray-100 dark:border-white/10 md:flex md:w-[360px] md:min-w-[360px] md:flex-shrink-0 ${
            showMobileChat
              ? "hidden md:flex"
              : "flex"
          }`}
        >

          <div className="border-b border-gray-100 p-4 dark:border-white/10">

            <div className="mb-4 flex items-center justify-between">

              <div>

                <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                  Secure Messages
                </h2>

                <p className="mt-0.5 text-xs text-gray-400">
                  Authorized port personnel
                </p>

              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-50 text-green-500 dark:bg-green-500/10">

                <MdLock />

              </div>

            </div>


            {/* SEARCH */}

            <div className="flex items-center rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-navy-700">

              <MdSearch className="mr-2 h-5 w-5 text-gray-400" />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search personnel..."
                className="w-full bg-transparent text-sm text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
              />

              {search && (

                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="rounded-full p-1 text-gray-400"
                >
                  <MdClose className="h-4 w-4" />
                </button>

              )}

            </div>


            {/* FILTERS */}

            <div className="mt-3 flex gap-2">

              {["All", "Unread"].map(
                (filter) => (

                  <button
                    key={filter}
                    type="button"
                    onClick={() =>
                      setActiveFilter(
                        filter
                      )
                    }
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                      activeFilter === filter
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-300"
                    }`}
                  >

                    {filter}

                    {filter ===
                      "Unread" &&
                      totalUnread > 0 && (
                        <span className="ml-1.5">
                          {totalUnread}
                        </span>
                      )}

                  </button>

                )
              )}

            </div>

          </div>


          {/* CONTACTS */}

          <div className="port-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">

            {filteredConversations.map(
              (conversation) => {

                const user =
                  users.find(
                    (item) =>
                      item.id ===
                      conversation.participantId
                  );


                if (!user) {
                  return null;
                }


                const lastMessage =
                  conversation.messages[
                    conversation.messages.length - 1
                  ];


                const isSelected =
                  conversation.id ===
                  selectedConversationId;


                return (

                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() =>
                      handleSelectConversation(
                        conversation.id
                      )
                    }
                    className={`group flex w-full min-w-0 flex-shrink-0 items-center gap-3 border-b border-gray-50 px-4 py-3.5 text-left transition dark:border-white/5 ${
                      isSelected
                        ? "bg-indigo-50 dark:bg-indigo-500/10"
                        : "hover:bg-gray-50 dark:hover:bg-navy-700"
                    }`}
                  >

                    {/* AVATAR */}

                    <div className="relative flex-shrink-0">

                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-bold text-indigo-600 dark:text-indigo-300">
                        {user.avatar}
                      </div>

                      <span
                        className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-navy-800 ${getStatusDotColor(
                          user.status
                        )}`}
                      />

                    </div>


                    {/* DETAILS */}

                    <div className="min-w-0 flex-1">

                      <div className="flex items-center justify-between">

                        <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                          {user.name}
                        </p>

                        <span className="ml-2 text-[10px] text-gray-400">
                          {lastMessage?.time}
                        </span>

                      </div>


                      <div className="mt-0.5 flex items-center gap-1">

                        <MdLock className="h-3 w-3 text-green-500" />

                        <p className="truncate text-xs text-green-500">
                          End-to-end encrypted
                        </p>

                      </div>


                      <div className="mt-1 flex items-center justify-between">

                        <p className="truncate text-xs text-gray-400">
                          Encrypted message
                        </p>

                        {conversation.unread > 0 && (

                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">
                            {conversation.unread}
                          </span>

                        )}

                      </div>

                    </div>

                  </button>

                );
              }
            )}

          </div>

        </div>


        {/* =================================================
            CHAT WINDOW
            ================================================= */}

        <div
          className={`min-w-0 flex-1 flex-col ${
            showMobileChat
              ? "flex"
              : "hidden md:flex"
          }`}
        >

          {selectedUser &&
          selectedConversation ? (

            <>

              {/* CHAT HEADER */}

              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5 dark:border-white/10 md:px-5">

                <div className="flex min-w-0 items-center gap-3">

                  <button
                    type="button"
                    onClick={handleBack}
                    className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-navy-700 md:hidden"
                  >
                    <MdArrowBack className="h-5 w-5" />
                  </button>


                  <div className="relative flex-shrink-0">

                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-600 dark:text-indigo-300">
                      {selectedUser.avatar}
                    </div>

                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-navy-800 ${getStatusDotColor(
                        selectedUser.status
                      )}`}
                    />

                  </div>


                  <div className="min-w-0">

                    <div className="flex items-center gap-1.5">

                      <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                        {selectedUser.name}
                      </p>

                      <MdVerifiedUser className="h-4 w-4 flex-shrink-0 text-green-500" />

                    </div>

                    <div className="flex items-center gap-2 text-xs">

                      <span className="truncate text-gray-400">
                        {selectedUser.department}
                      </span>

                      <span className="text-gray-300">
                        •
                      </span>

                      <span
                        className={getStatusColor(
                          selectedUser.status
                        )}
                      >
                        {selectedUser.status}
                      </span>

                    </div>

                  </div>

                </div>


                {/* ACTIONS */}

                <div className="flex items-center gap-1">

                  <button
                    type="button"
                    title="Voice call"
                    className="hidden rounded-full p-2.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-500 dark:hover:bg-navy-700 sm:block"
                  >
                    <MdCall className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    title="Video call"
                    className="hidden rounded-full p-2.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-500 dark:hover:bg-navy-700 sm:block"
                  >
                    <MdVideocam className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    title="Conversation information"
                    className="rounded-full p-2.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-500 dark:hover:bg-navy-700"
                  >
                    <MdMoreVert className="h-5 w-5" />
                  </button>

                </div>

              </div>


              {/* ENCRYPTION BANNER */}

              <div className="flex items-center justify-center gap-2 border-b border-green-100 bg-green-50 px-4 py-2 dark:border-green-500/10 dark:bg-green-500/5">

                <MdLock className="h-3.5 w-3.5 text-green-500" />

                <p className="text-[11px] text-green-600 dark:text-green-400">
                  End-to-end encrypted • Only participants can decrypt these messages
                </p>

                <MdVerifiedUser className="h-3.5 w-3.5 text-green-500" />

              </div>


              {/* MESSAGES */}

              <div className="message-scrollbar flex-1 overflow-y-auto bg-[#f5f7fb] p-4 dark:bg-navy-900 md:p-6">

                <div className="mb-5 flex justify-center">

                  <span className="flex items-center gap-1.5 rounded-full border border-green-100 bg-white px-4 py-1.5 text-[10px] font-semibold text-green-500 shadow-sm dark:border-green-500/10 dark:bg-navy-800">

                    <MdLock className="h-3 w-3" />

                    END-TO-END ENCRYPTED

                  </span>

                </div>


                <div className="space-y-3">

                  {selectedConversation.messages.map(
                    (chatMessage) => (

                      <EncryptedMessage
                        key={chatMessage.id}
                        chatMessage={
                          chatMessage
                        }
                        currentUser={
                          currentUser
                        }
                        recipientIdentity={
                          identityCache.get(
                            chatMessage.senderId === currentUser.id
                              ? selectedUser.id
                              : currentUser.id
                          )
                        }
                      />

                    )
                  )}

                </div>

              </div>


              {/* COMPOSER */}

              <div className="border-t border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-navy-800 md:p-4">

                <div className="flex items-end gap-2">

                  <button
                    type="button"
                    title="Attach encrypted file"
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-indigo-500 dark:hover:bg-navy-700"
                  >
                    <MdAttachFile className="h-5 w-5" />
                  </button>


                  <button
                    type="button"
                    title="Emoji"
                    className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-indigo-500 dark:hover:bg-navy-700 sm:flex"
                  >
                    <MdInsertEmoticon className="h-5 w-5" />
                  </button>


                  <div className="flex min-h-[46px] flex-1 items-center rounded-2xl bg-gray-100 px-4 py-1.5 dark:bg-navy-700">

                    <textarea
                      value={message}
                      onChange={(event) =>
                        setMessage(
                          event.target.value
                        )
                      }
                      onKeyDown={
                        handleMessageKeyDown
                      }
                      rows={1}
                      placeholder={`Message ${selectedUser.name} securely...`}
                      className="max-h-28 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
                    />

                  </div>


                  <button
                    type="button"
                    onClick={
                      handleSendMessage
                    }
                    disabled={
                      !message.trim()
                    }
                    title="Encrypt and send"
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <MdSend className="h-5 w-5" />
                  </button>

                </div>


                <div className="mt-2 flex items-center justify-center gap-1">

                  <MdLock className="h-3 w-3 text-green-500" />

                  <p className="text-[9px] text-gray-400">
                    Message encrypted locally before transmission
                  </p>

                </div>

              </div>

            </>

          ) : (

            <div className="flex flex-1 flex-col items-center justify-center">

              <MdLock className="mb-4 h-10 w-10 text-green-500" />

              <h3 className="font-bold text-navy-700 dark:text-white">
                Select a secure conversation
              </h3>

            </div>

          )}

        </div>

      </div>


      {/* =================================================
          SECURITY ARCHITECTURE
          ================================================= */}

      <div className="mt-5 rounded-[20px] border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-500/20 dark:bg-navy-800">

        <div className="flex items-start gap-3">

          <MdSecurity className="mt-0.5 h-6 w-6 flex-shrink-0 text-indigo-500" />

          <div>

            <p className="font-bold text-indigo-700 dark:text-indigo-300">
              Secure Communication Architecture
            </p>

            <p className="mt-1 text-sm leading-6 text-indigo-600 dark:text-indigo-200">
              Messages are encrypted on the client before they are
              transmitted. The planned backend will relay encrypted
              payloads through authenticated WebSockets and store
              ciphertext rather than plaintext.
            </p>


            <div className="mt-4 flex flex-wrap items-center gap-2">

              {[
                "JWT",
                "RBAC",
                "ECDH P-256",
                "HKDF-SHA-256",
                "AES-256-GCM",
                "WSS",
                "FastAPI",
                "PostgreSQL",
              ].map(
                (item) => (

                  <span
                    key={item}
                    className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-500 dark:bg-navy-700 dark:text-gray-300"
                  >
                    {item}
                  </span>

                )
              )}

            </div>

          </div>

        </div>

      </div>


      {/* =================================================
          PRODUCTION SECURITY NOTICE
          ================================================= */}

      <div className="mt-5 rounded-[20px] border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-navy-800">

        <div className="flex items-start gap-3">

          <MdInfoOutline className="mt-0.5 h-6 w-6 flex-shrink-0 text-gray-400" />

          <div>

            <p className="font-bold text-navy-700 dark:text-white">
              Production Security Requirements
            </p>

            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-300">
              The current capstone frontend demonstrates client-side
              cryptographic encryption. Production deployment will additionally
              require authenticated public-key distribution, key verification,
              secure private-key storage, key rotation, device management,
              authenticated WSS connections and encrypted attachment handling.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
};


// =========================================================
// ENCRYPTED MESSAGE COMPONENT
// =========================================================

const EncryptedMessage = ({
  chatMessage,
  currentUser,
  recipientIdentity,
}) => {

  const [decryptedText, setDecryptedText] =
    React.useState("Decrypting...");

  const [decryptionFailed, setDecryptionFailed] =
    React.useState(false);


  React.useEffect(() => {

    let mounted = true;


    const decrypt = async () => {

      try {

        if (
          !chatMessage.encrypted ||
          !recipientIdentity
        ) {
          if (mounted) {
            setDecryptedText(
              "Encrypted message"
            );
          }

          return;
        }


        const plaintext =
          await decryptMessage({
            encryptedMessage:
              chatMessage,
            recipientIdentity,
          });


        if (mounted) {

          if (
            plaintext ===
            "Unable to decrypt message."
          ) {

            setDecryptionFailed(
              true
            );

          } else {

            setDecryptedText(
              plaintext
            );

          }

        }

      } catch (error) {

        console.error(
          "Message decryption error:",
          error
        );

        if (mounted) {
          setDecryptionFailed(true);
        }

      }

    };


    decrypt();


    return () => {
      mounted = false;
    };

  }, [
    chatMessage,
    recipientIdentity,
  ]);


  const isMine =
    chatMessage.senderId ===
    currentUser.id;


  return (

    <div
      className={`flex ${
        isMine
          ? "justify-end"
          : "justify-start"
      }`}
    >

      <div
        className={`flex max-w-[85%] flex-col ${
          isMine
            ? "items-end"
            : "items-start"
        } md:max-w-[70%]`}
      >

        <div
          className={`rounded-2xl px-4 py-3 shadow-sm ${
            isMine
              ? "rounded-br-md bg-indigo-600 text-white"
              : "rounded-bl-md bg-white text-gray-700 dark:bg-navy-800 dark:text-gray-200"
          }`}
        >

          {decryptionFailed ? (

            <div className="flex items-center gap-2">

              <MdLock className="h-4 w-4 text-red-400" />

              <p className="text-sm">
                Unable to decrypt message
              </p>

            </div>

          ) : (

            <p className="break-words text-sm leading-6">
              {decryptedText}
            </p>

          )}


          <div
            className={`mt-1.5 flex items-center justify-end gap-1 ${
              isMine
                ? "text-indigo-100"
                : "text-gray-400"
            }`}
          >

            <MdLock className="h-3 w-3" />

            <span className="text-[10px]">
              {chatMessage.time}
            </span>

            {isMine && (
              <MdDoneAll className="h-3.5 w-3.5" />
            )}

          </div>

        </div>


        <div className="mt-1 flex items-center gap-1 px-1">

          <MdLock className="h-2.5 w-2.5 text-green-500" />

          <span className="text-[9px] text-gray-400">
            Encrypted
          </span>

        </div>

      </div>

    </div>
  );
};


export default PortCommunication;