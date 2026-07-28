import { DEFAULT_SETTINGS, getSettings } from "./storage.js";
import { buildPrompt } from "./prompt-builder.js";
import { clamp, isPlainObject, normalizeWhitespace, stripThinkBlocks } from "./utils.js";

export class OllamaError extends Error {
  constructor(message, { code = "OLLAMA_ERROR", status = null, cause = null } = {}) {
    super(message, { cause });
    this.name = "OllamaError";
    this.code = code;
    this.status = status;
  }
}

export function validateOllamaUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new OllamaError("Ollama API URLの形式が正しくありません。", {
      code: "INVALID_URL",
      cause: error,
    });
  }

  const allowedHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const allowedPath = url.pathname.replace(/\/+$/, "") === "/api/chat";
  if (
    url.protocol !== "http:" ||
    !allowedHost ||
    url.port !== "11434" ||
    !allowedPath ||
    url.username ||
    url.password
  ) {
    throw new OllamaError(
      "標準構成では http://localhost:11434/api/chat または 127.0.0.1 のみ利用できます。",
      { code: "UNSUPPORTED_URL" },
    );
  }
  return url.toString();
}

async function resolvedSettings(provided) {
  if (isPlainObject(provided)) return { ...DEFAULT_SETTINGS, ...provided };
  try {
    return await getSettings();
  } catch {
    // Node-based checks have no extension storage. Network callers can still
    // pass explicit options, while the documented defaults remain usable.
    return { ...DEFAULT_SETTINGS };
  }
}

function currentMessages(options) {
  if (options.systemPrompt || options.userPrompt) {
    const system = normalizeWhitespace(options.systemPrompt);
    let user = String(options.userPrompt ?? "").trim();
    if (!system || !user) {
      throw new OllamaError("systemPrompt と userPrompt の両方が必要です。", {
        code: "INVALID_REQUEST",
      });
    }
    if (!user.startsWith("/no_think")) user = `/no_think\n${user}`;
    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  }

  try {
    return buildPrompt({
      question: options.question,
      mode: options.mode,
      category: options.category,
      solverResult: options.solverResult,
    }).messages;
  } catch (error) {
    throw new OllamaError(error.message || "問題文が空です。", {
      code: "INVALID_REQUEST",
      cause: error,
    });
  }
}

function responseErrorMessage(data, status) {
  const detail = normalizeWhitespace(data?.error ?? data?.message ?? "");
  return detail
    ? `Ollama APIエラー (${status}): ${detail}`
    : `Ollama APIがHTTP ${status}を返しました。`;
}

export async function requestOllama(options = {}) {
  if (!isPlainObject(options)) {
    throw new OllamaError("Ollamaリクエストはオブジェクトで指定してください。", {
      code: "INVALID_REQUEST",
    });
  }

  const settings = await resolvedSettings(options.settings);
  const apiUrl = validateOllamaUrl(options.apiUrl ?? settings.apiUrl);
  const modelName = normalizeWhitespace(options.modelName ?? options.model ?? settings.modelName);
  if (!modelName) {
    throw new OllamaError("Ollamaモデル名が空です。", { code: "INVALID_REQUEST" });
  }
  const rawTimeout = Number(options.timeoutSeconds ?? settings.timeoutSeconds);
  const timeoutSeconds = Number.isFinite(rawTimeout) ? clamp(rawTimeout, 1, 600) : 90;
  const messages = currentMessages(options);
  const controller = new AbortController();
  const externalSignal = options.signal;
  let timedOut = false;
  const abortFromOutside = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromOutside();
  else externalSignal?.addEventListener?.("abort", abortFromOutside, { once: true });
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutSeconds * 1_000);

  const fetchImplementation = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener?.("abort", abortFromOutside);
    throw new OllamaError("この環境ではfetchを利用できません。", { code: "UNAVAILABLE" });
  }

  try {
    const response = await fetchImplementation(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        stream: false,
        messages,
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let data = null;
    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        if (!response.ok) {
          throw new OllamaError(responseErrorMessage(null, response.status), {
            code: "HTTP_ERROR",
            status: response.status,
            cause: error,
          });
        }
        throw new OllamaError("Ollamaの応答がJSON形式ではありません。", {
          code: "INVALID_JSON",
          status: response.status,
          cause: error,
        });
      }
    }

    if (!response.ok) {
      throw new OllamaError(responseErrorMessage(data, response.status), {
        code: "HTTP_ERROR",
        status: response.status,
      });
    }
    if (!isPlainObject(data) || !isPlainObject(data.message)) {
      throw new OllamaError("Ollamaの応答形式を確認できません。", {
        code: "INVALID_RESPONSE",
        status: response.status,
      });
    }

    const content = stripThinkBlocks(data.message.content);
    if (!content) {
      throw new OllamaError("Ollamaから空の回答が返されました。", {
        code: "EMPTY_RESPONSE",
        status: response.status,
      });
    }
    return {
      content,
      model: normalizeWhitespace(data.model) || modelName,
      doneReason: normalizeWhitespace(data.done_reason) || null,
      raw: data,
    };
  } catch (error) {
    if (error instanceof OllamaError) throw error;
    if (timedOut) {
      throw new OllamaError(
        `Ollamaの回答が${timeoutSeconds}秒以内に完了しませんでした。`,
        { code: "TIMEOUT", cause: error },
      );
    }
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw new OllamaError("Ollamaへのリクエストを中止しました。", {
        code: "ABORTED",
        cause: error,
      });
    }
    throw new OllamaError(
      "Ollamaに接続できません。Ollamaが起動しているか、設定URLを確認してください。",
      { code: "NETWORK_ERROR", cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener?.("abort", abortFromOutside);
  }
}

export async function askOllama(options = {}) {
  return (await requestOllama(options)).content;
}
