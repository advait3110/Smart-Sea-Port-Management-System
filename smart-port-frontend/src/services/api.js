// =========================================================
// PORT OF SINGAPORE
// API SERVICE
// =========================================================
//
// Central API communication layer.
//
// Frontend
//    ↓
// apiRequest()
//    ↓
// FastAPI
//    ↓
// PostgreSQL
//
// Responsibilities:
// - GET requests
// - POST requests
// - PUT requests
// - DELETE requests
// - JWT authentication
// - FastAPI error handling
// - Network error handling
// =========================================================

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  "http://127.0.0.1:8000";

// =========================================================
// ACCESS TOKEN
// =========================================================

const getAccessToken = () => {
  try {
    const token =
      sessionStorage.getItem(
        "karwarPortAccessToken"
      );

    return token || null;
  } catch (error) {
    console.error(
      "Unable to access authentication token:",
      error
    );

    return null;
  }
};

// =========================================================
// READABLE ERROR MESSAGE
// =========================================================

const getReadableErrorMessage = (
  errorData,
  fallbackMessage
) => {
  if (
    errorData === null ||
    errorData === undefined
  ) {
    return fallbackMessage;
  }

  // -------------------------------------------------------
  // String
  // -------------------------------------------------------

  if (typeof errorData === "string") {
    const message = errorData.trim();

    return message || fallbackMessage;
  }

  // -------------------------------------------------------
  // Array
  // -------------------------------------------------------

  if (Array.isArray(errorData)) {
    const messages = errorData
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (
          item &&
          typeof item.msg === "string"
        ) {
          return item.msg;
        }

        if (
          item &&
          typeof item.message === "string"
        ) {
          return item.message;
        }

        if (
          item &&
          typeof item.detail === "string"
        ) {
          return item.detail;
        }

        return null;
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(", ");
    }

    return fallbackMessage;
  }

  // -------------------------------------------------------
  // Object
  // -------------------------------------------------------

  if (
    typeof errorData === "object"
  ) {
    // FastAPI detail string.
    if (
      typeof errorData.detail === "string"
    ) {
      return errorData.detail;
    }

    // FastAPI validation errors.
    if (
      Array.isArray(errorData.detail)
    ) {
      return getReadableErrorMessage(
        errorData.detail,
        fallbackMessage
      );
    }

    // Nested detail object.
    if (
      errorData.detail &&
      typeof errorData.detail === "object"
    ) {
      return getReadableErrorMessage(
        errorData.detail,
        fallbackMessage
      );
    }

    // Generic message.
    if (
      typeof errorData.message === "string"
    ) {
      return errorData.message;
    }

    // Generic error.
    if (
      typeof errorData.error === "string"
    ) {
      return errorData.error;
    }

    // Nested response data.
    if (
      errorData.response &&
      typeof errorData.response === "object"
    ) {
      return getReadableErrorMessage(
        errorData.response,
        fallbackMessage
      );
    }

    // Nested data.
    if (
      errorData.data &&
      typeof errorData.data === "object"
    ) {
      return getReadableErrorMessage(
        errorData.data,
        fallbackMessage
      );
    }

    // Last safe conversion.
    try {
      const serialized =
        JSON.stringify(errorData);

      if (
        serialized &&
        serialized !== "{}"
      ) {
        return serialized;
      }
    } catch (error) {
      console.error(
        "Unable to serialize API error:",
        error
      );
    }
  }

  return fallbackMessage;
};

// =========================================================
// WEAK NETWORKS (college Wi-Fi, mobile data)
// =========================================================
//
// - A GET request that gets no answer within GET_TIMEOUT_MS is
//   stopped, so a page never shows "Loading..." for ever.
// - A GET request that fails because of the network (or because
//   the server was briefly busy: 502, 503, 504) is tried again
//   once, after RETRY_DELAY_MS.
// - POST, PUT and DELETE are never repeated automatically (a
//   repeated "save" could save twice) and get no time limit,
//   because uploads and ML training can take a while.

const GET_TIMEOUT_MS = 30000;

const RETRY_DELAY_MS = 1500;

const RETRY_STATUSES = [502, 503, 504];

const wait = (ms) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

// fetch() with a time limit. A request that takes too long is
// stopped and reported as a TIMEOUT error.
const fetchWithTimeout = async (url, options, timeoutMs) => {
  if (
    !timeoutMs ||
    options.signal ||
    typeof AbortController === "undefined"
  ) {
    return fetch(url, options);
  }

  const controller = new AbortController();

  let timedOut = false;

  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error("timeout");

      timeoutError.isTimeout = true;

      throw timeoutError;
    }

    throw error;
  } finally {
    window.clearTimeout(timer);
  }
};

// =========================================================
// API REQUEST
// =========================================================

const apiRequest = async (
  endpoint,
  options = {}
) => {
  // -------------------------------------------------------
  // Normalize endpoint
  // -------------------------------------------------------

  const normalizedEndpoint =
    String(endpoint || "").startsWith("/")
      ? String(endpoint)
      : `/${String(endpoint || "")}`;

  // -------------------------------------------------------
  // Access current JWT
  // -------------------------------------------------------

  const token = getAccessToken();

  // -------------------------------------------------------
  // Headers
  // -------------------------------------------------------

  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  // Only set JSON Content-Type when the request
  // actually contains a JSON body.
  //
  // This prevents problems with requests such as
  // GET and DELETE, and leaves FormData untouched.
  const isFormData =
    typeof FormData !== "undefined" &&
    options.body instanceof FormData;

  if (
    options.body !== undefined &&
    options.body !== null &&
    !isFormData &&
    !headers["Content-Type"] &&
    !headers["content-type"]
  ) {
    headers["Content-Type"] =
      "application/json";
  }

  // -------------------------------------------------------
  // JWT
  // -------------------------------------------------------

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  // -------------------------------------------------------
  // Request
  // -------------------------------------------------------

  const method = String(
    options.method || "GET"
  ).toUpperCase();

  const isGet = method === "GET";

  const url = `${API_BASE_URL}${normalizedEndpoint}`;

  const requestOptions = {
    ...options,
    headers,
  };

  // GET requests: at most 2 tries. Other requests: 1 try.
  const tries = isGet ? 2 : 1;

  let response;

  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const lastTry = attempt === tries;

    try {
      response = await fetchWithTimeout(
        url,
        requestOptions,
        isGet ? GET_TIMEOUT_MS : 0
      );
    } catch (error) {
      if (!lastTry) {
        await wait(RETRY_DELAY_MS);

        continue;
      }

      console.error(
        "API network error:",
        error
      );

      const networkError = new Error(
        error && error.isTimeout
          ? "The Port of Singapore server is taking too long to answer. The internet connection may be slow. The page will try again."
          : "Cannot reach the Port of Singapore server. Please check the internet connection. The page will try again."
      );

      networkError.status = 0;
      networkError.code =
        error && error.isTimeout
          ? "TIMEOUT"
          : "NETWORK_ERROR";
      networkError.originalError = error;

      throw networkError;
    }

    // The server was briefly busy: try a GET once more.
    if (
      !lastTry &&
      RETRY_STATUSES.includes(response.status)
    ) {
      await wait(RETRY_DELAY_MS);

      continue;
    }

    break;
  }

  // =======================================================
  // NON-SUCCESS RESPONSE
  // =======================================================

  if (!response.ok) {
    let errorData = null;

    // -----------------------------------------------------
    // Read response body safely.
    //
    // FastAPI may return:
    // JSON
    // plain text
    // empty body
    // -----------------------------------------------------

    try {
      const responseText =
        await response.text();

      if (
        responseText &&
        responseText.trim().length > 0
      ) {
        try {
          errorData =
            JSON.parse(responseText);
        } catch (parseError) {
          // Backend returned plain text.
          errorData = responseText;
        }
      }
    } catch (readError) {
      console.error(
        "Unable to read API error response:",
        readError
      );
    }

    // -----------------------------------------------------
    // Create readable error.
    // -----------------------------------------------------

    const errorMessage =
      getReadableErrorMessage(
        errorData,
        `API request failed with status ${response.status}.`
      );

    const error =
      new Error(errorMessage);

    error.status = response.status;

    error.code =
      `HTTP_${response.status}`;

    // Preserve backend response.
    error.data = errorData;

    // -----------------------------------------------------
    // Special authentication handling.
    //
    // Do NOT automatically remove the JWT here.
    // A 401/403 may be handled by the calling screen
    // or authentication layer.
    // -----------------------------------------------------

    if (response.status === 401) {
      error.isUnauthorized = true;
    }

    if (response.status === 403) {
      error.isForbidden = true;
    }

    console.error(
      `API ${response.status} error:`,
      errorData
    );

    throw error;
  }

  // =======================================================
  // NO CONTENT
  // =======================================================

  if (response.status === 204) {
    return null;
  }

  // =======================================================
  // SUCCESS RESPONSE
  // =======================================================

  try {
    const responseText =
      await response.text();

    // Some successful endpoints intentionally
    // return an empty body.
    if (
      !responseText ||
      !responseText.trim()
    ) {
      return null;
    }

    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      // Some endpoints may intentionally return
      // plain text.
      console.warn(
        "Successful API response was not JSON. Returning text.",
        parseError
      );

      return responseText;
    }
  } catch (error) {
    console.error(
      "Unable to read API response:",
      error
    );

    const responseError = new Error(
      "The backend returned an unreadable response."
    );

    responseError.code =
      "INVALID_RESPONSE";

    responseError.originalError =
      error;

    throw responseError;
  }
};

// =========================================================
// GET
// =========================================================

export const apiGet = (
  endpoint
) => {
  return apiRequest(
    endpoint,
    {
      method: "GET",
    }
  );
};

// =========================================================
// POST
// =========================================================

export const apiPost = (
  endpoint,
  data
) => {
  return apiRequest(
    endpoint,
    {
      method: "POST",
      body:
        data === undefined ||
        data === null
          ? undefined
          : JSON.stringify(data),
    }
  );
};

// =========================================================
// PUT
// =========================================================

export const apiPut = (
  endpoint,
  data
) => {
  return apiRequest(
    endpoint,
    {
      method: "PUT",
      body:
        data === undefined ||
        data === null
          ? undefined
          : JSON.stringify(data),
    }
  );
};

// =========================================================
// DELETE
// =========================================================

export const apiDelete = (
  endpoint
) => {
  return apiRequest(
    endpoint,
    {
      method: "DELETE",
    }
  );
};

// =========================================================
// DEFAULT EXPORT
// =========================================================

export default apiRequest;