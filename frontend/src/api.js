export const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("micropay_token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    throw new Error(`Network request error. ${error?.message || "Failed to fetch"}`);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}
