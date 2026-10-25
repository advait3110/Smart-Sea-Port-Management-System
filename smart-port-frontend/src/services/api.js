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

  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}${normalizedEndpoint}`,
      {
        ...options,
        headers,
      }
    );
  } catch (error) {
    console.error(
      "API network error:",
      error
    );

    const networkError = new Error(
      "Unable to connect to the Port of Singapore backend. Please make sure the FastAPI server is running."
    );

    networkError.status = 0;
    networkError.code = "NETWORK_ERROR";
    networkError.originalError = error;

    throw networkError;
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