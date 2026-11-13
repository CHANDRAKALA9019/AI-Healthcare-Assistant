const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export async function api(path, { token, ...options } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...options?.headers,
    },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.detail || Object.values(data || {}).flat().join(" ") || "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data;
}

export { API_URL };
