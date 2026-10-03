export const PHONE_REGEX = /^01[3-9]\d{8}$/;
export const PIN_REGEX = /^\d{6}$/;

export function normalizePhone(phone) {
  return (phone ?? "").trim();
}

export function validatePhone(phone) {
  if (!normalizePhone(phone)) return "Mobile number is required.";
  if (!PHONE_REGEX.test(normalizePhone(phone)))
    return "Enter a valid Bangladeshi mobile number (e.g. 01XXXXXXXXX).";
  return "";
}

export function validatePin(pin) {
  if (!pin) return "PIN is required.";
  if (!PIN_REGEX.test(String(pin).trim()))
    return "PIN must be exactly 6 digits.";
  return "";
}

export function getAuthErrorMessage(error, fallback) {
  const status = error?.response?.status;
  const serverMessage = error?.response?.data?.message;

  if (!error?.response) {
    return "Network issue — check your connection and try again.";
  }
  if (status === 429) {
    return (
      serverMessage ||
      "Too many attempts. Please wait a little while and try again."
    );
  }
  if (typeof serverMessage === "string" && serverMessage.trim()) {
    return serverMessage.trim();
  }
  if (status >= 500) {
    return "Server issue — please try again in a moment.";
  }
  return fallback || "Something went wrong. Please try again.";
}
