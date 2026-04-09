export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return true;
  }

  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }

  const match172 = host.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
}

function collectResults(raw: unknown): WebSearchResult[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const payload = raw as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<unknown>;
  };

  const output: WebSearchResult[] = [];

  if (payload.AbstractText && payload.AbstractURL) {
    output.push({
      title: payload.Heading || "Result",
      snippet: payload.AbstractText,
      url: payload.AbstractURL
    });
  }

  const flattenTopic = (topic: unknown): void => {
    if (!topic || typeof topic !== "object") {
      return;
    }

    const t = topic as {
      Text?: string;
      FirstURL?: string;
      Name?: string;
      Topics?: Array<unknown>;
    };

    if (Array.isArray(t.Topics)) {
      for (const child of t.Topics) {
        flattenTopic(child);
      }
      return;
    }

    if (t.Text && t.FirstURL) {
      output.push({
        title: t.Name || "Result",
        snippet: t.Text,
        url: t.FirstURL
      });
    }
  };

  for (const topic of payload.RelatedTopics ?? []) {
    flattenTopic(topic);
  }

  return output;
}

export async function webSearch(query: string): Promise<WebSearchResponse> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");

  if (isPrivateHost(url.hostname)) {
    throw new Error("Blocked private or localhost target for webSearch");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Web search failed with status ${response.status}`);
    }

    const json = (await response.json()) as unknown;
    const results = collectResults(json)
      .filter((result) => {
        try {
          const parsed = new URL(result.url);
          return !isPrivateHost(parsed.hostname);
        } catch {
          return false;
        }
      })
      .slice(0, 10);

    return { query, results };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("webSearch timeout after 5 seconds");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
