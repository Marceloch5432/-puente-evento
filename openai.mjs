export async function mintAuthorization(key, signal, fetcher = fetch) {
  const fail = (safeMessage) => { throw Object.assign(new Error(safeMessage), { safeMessage }); };
  if (typeof key !== "string" || !key.startsWith("sk-") || key.length < 20 || /\s/.test(key))
    fail("Falta configurar una clave de OpenAI en el servidor. La prueba de conexión sí está disponible.");
  let response;
  try {
    response = await fetcher("https://api.openai.com/v1/realtime/translations/client_secrets", {
      method: "POST", redirect: "manual"
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 120 },
        session: { model: "gpt-realtime-translate", audio: {
          input: { transcription: { model: "gpt-realtime-whisper" } }, output: { language: "en" }
        } } }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
    });
  } catch { fail("No se pudo contactar con OpenAI. Vuelve a intentar."); }
  if (response.status === 401) fail("La clave de OpenAI del servidor no es válida.");
  if (response.status === 403 || response.status === 404) fail("La cuenta no tiene acceso al modelo de traducción en vivo.");
  if (response.status === 429) fail("OpenAI alcanzó un límite de saldo o de uso. Revisa tu cuenta.");
  if (!response.ok) fail("OpenAI no pudo iniciar la traducción. Vuelve a intentar.");
  let data;
  try { data = await response.json(); } catch { fail("OpenAI devolvió una respuesta no válida."); }
  if (typeof data?.value !== "string" || !data.value.startsWith("ek_") || data.value.length > 4096
    || typeof data.expires_at !== "number" || data.expires_at * 1000 <= Date.now())
    fail("OpenAI devolvió una autorización no válida.");
  return { clientSecret: data.value, expiresAt: data.expires_at * 1000 };
}
