const https = require('https');

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 200, headers, body: JSON.stringify({ message: "Missing API key in environment", status: "yellow" }) };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 200, headers, body: JSON.stringify({ message: "Bad request body: " + e.message, status: "yellow" }) };
  }

  const { miles, pace, avgHR, zone, date } = parsed;

  const prompt = `You are a marathon coach. Give Sam a 2-sentence post-run debrief. Run: ${miles} miles at ${pace}/mi, avg HR ${avgHR || 'unknown'} (${zone || 'unknown zone'}), date ${date}. Be direct and specific. End with STATUS:green on its own line.`;

  const reqBody = JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }]
  });

  try {
    const apiResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.anthropic.com",
        port: 443,
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(reqBody)
        }
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch(e) {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      });

      req.on("error", (e) => reject(e));
      req.write(reqBody);
      req.end();
    });

    if (apiResponse.statusCode !== 200) {
      const errMsg = typeof apiResponse.body === "object"
        ? (apiResponse.body.error ? apiResponse.body.error.message : JSON.stringify(apiResponse.body))
        : String(apiResponse.body).substring(0, 200);
      return { statusCode: 200, headers, body: JSON.stringify({ message: "API returned " + apiResponse.statusCode + ": " + errMsg, status: "yellow" }) };
    }

    const responseBody = apiResponse.body;
    const text = responseBody.content && responseBody.content[0] ? responseBody.content[0].text.trim() : "";

    if (!text) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: "Empty API response", status: "yellow" }) };
    }

    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const statusLine = lines.find(l => l.startsWith("STATUS:"));
    const status = statusLine ? statusLine.replace("STATUS:", "").trim() : "green";
    const message = lines.filter(l => !l.startsWith("STATUS:")).join(" ");

    return { statusCode: 200, headers, body: JSON.stringify({ message, status }) };

  } catch(e) {
    return { statusCode: 200, headers, body: JSON.stringify({ message: "Request failed: " + e.message, status: "yellow" }) };
  }
};
