/** HTTP helpers of the intake pipeline, shared by the import window and the Drive queue. */
export async function readIntakeResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo completar la operación");
  return body;
}

export async function intakeRequest(url: string, method?: "POST") {
  const response = await fetch(url, { method: method ?? "GET", cache: "no-store" });
  // A stage that is busy or not ready yet (409) is not a failure: the next poll checks again.
  if (method === "POST" && response.status === 409) return { estado: "ocupado" };
  return readIntakeResponse(response);
}
