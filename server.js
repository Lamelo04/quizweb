"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const allowedFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/script.js", ["script.js", "text/javascript; charset=utf-8"]]
]);

loadLocalEnv();

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/questions") {
      await generateQuestions(request, response);
      return;
    }

    if (request.method === "GET") {
      serveFile(request.url, response);
      return;
    }

    sendJson(response, 405, { error: "Méthode non autorisée." });
  } catch (error) {
    console.error("Server request failed:", error.message);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "Erreur interne du serveur. Réessayez." });
    } else {
      response.destroy();
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Quiz Web est prêt : http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY absent : le quiz démo fonctionne, la génération IA est désactivée.");
  }
});

function loadLocalEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function serveFile(url, response) {
  const fileEntry = allowedFiles.get(url);
  if (!fileEntry) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Page introuvable.");
    return;
  }

  const [fileName, contentType] = fileEntry;
  const filePath = path.join(ROOT, fileName);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Impossible de charger le fichier.");
      return;
    }
    response.writeHead(200, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff" });
    response.end(content);
  });
}

async function generateQuestions(request, response) {
  if (!process.env.GEMINI_API_KEY) {
    sendJson(response, 503, {
      error: "La génération IA n'est pas configurée. Ajoutez GEMINI_API_KEY dans le fichier .env."
    });
    return;
  }

  let settings;
  try {
    settings = await readJsonBody(request);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: error.message });
    return;
  }

  const { topic, count, type, difficulty } = settings || {};
  const questionTypes = ["mixed", "multiple_choice", "true_false"];
  const difficulties = ["easy", "medium", "hard"];
  if (typeof topic !== "string" || topic.trim().length < 2 || topic.length > 80) {
    sendJson(response, 400, { error: "Le sujet doit contenir entre 2 et 80 caractères." });
    return;
  }
  if (!Number.isInteger(count) || count < 3 || count > 10) {
    sendJson(response, 400, { error: "Choisissez de 3 à 10 questions." });
    return;
  }
  if (!questionTypes.includes(type) || !difficulties.includes(difficulty)) {
    sendJson(response, 400, { error: "Le type ou le niveau demandé n'est pas valide." });
    return;
  }

  const schema = {
    type: "OBJECT",
    properties: {
      questions: {
        type: "ARRAY",
        minItems: count,
        maxItems: count,
        items: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING" },
            type: { type: "STRING", enum: ["multiple_choice", "true_false"] },
            question: { type: "STRING" },
            answers: { type: "ARRAY", minItems: 2, maxItems: 4, items: { type: "STRING" } },
            correct_index: { type: "INTEGER", minimum: 0, maximum: 3 },
            explanation: { type: "STRING" }
          },
          required: ["category", "type", "question", "answers", "correct_index", "explanation"]
        }
      }
    },
    required: ["questions"]
  };

  const typeInstruction = type === "mixed"
    ? "Mélange des QCM à quatre choix et des questions vrai/faux à deux choix."
    : type === "true_false"
      ? "Toutes les questions sont de type vrai/faux et proposent exactement Vrai puis Faux."
      : "Toutes les questions sont des QCM avec exactement quatre choix.";
  const prompt = `Crée exactement ${count} questions de quiz originales sur le sujet : ${topic.trim()}.
Niveau : ${difficulty}. ${typeInstruction}
Rédige en français. Chaque question doit avoir une seule bonne réponse, une catégorie courte et une explication factuelle d'une ou deux phrases.
Pour un QCM, donne quatre réponses distinctes et plausibles. Pour vrai/faux, donne exactement ["Vrai", "Faux"].
correct_index est l'indice de la bonne réponse, à partir de zéro. Varie les formulations et ne répète aucune question.`;

  try {
    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "Tu es un générateur de questions de quiz précis. Respecte strictement les types et le format demandé." }]
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            maxOutputTokens: 3000
          }
        }),
        signal: AbortSignal.timeout(45000)
      }
    );

    const apiData = await apiResponse.json();
    if (!apiResponse.ok) {
      console.error("Gemini API error:", apiData.error?.message || apiResponse.status);
      if (apiResponse.status === 503) {
        sendJson(response, 503, { error: "Gemini est momentanément très sollicité. Attendez quelques secondes puis réessayez." });
      } else if (apiResponse.status === 429) {
        sendJson(response, 429, { error: "La limite de requêtes du niveau gratuit est atteinte. Attendez la réinitialisation du quota avant de réessayer." });
      } else {
        sendJson(response, 502, { error: "Gemini n'a pas pu générer le quiz. Vérifiez la clé et la configuration du modèle." });
      }
      return;
    }

    const outputText = (apiData.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("\n");
    const generated = JSON.parse(outputText);
    const questions = validateQuestions(generated.questions, count, type);
    sendJson(response, 200, { questions });
  } catch (error) {
    console.error("Question generation failed:", error.message);
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    sendJson(response, timedOut ? 504 : 502, {
      error: timedOut
        ? "Gemini n'a pas répondu dans le délai prévu. Réessayez dans quelques instants."
        : "Impossible de générer le quiz pour le moment. Réessayez."
    });
  }
}

function validateQuestions(questions, expectedCount, requestedType) {
  if (!Array.isArray(questions) || questions.length !== expectedCount) {
    throw new Error("Question count did not match the request.");
  }

  return questions.map((question) => {
    if (!question || typeof question !== "object") {
      throw new Error("The generated question was invalid.");
    }
    const expectedAnswers = question.type === "true_false" ? 2 : 4;
    if (
      typeof question.category !== "string" ||
      typeof question.question !== "string" ||
      typeof question.explanation !== "string" ||
      !["multiple_choice", "true_false"].includes(question.type) ||
      (requestedType !== "mixed" && requestedType !== question.type) ||
      !Array.isArray(question.answers) ||
      question.answers.length !== expectedAnswers ||
      !Number.isInteger(question.correct_index) ||
      question.correct_index < 0 ||
      question.correct_index >= question.answers.length
    ) {
      throw new Error("The generated question was invalid.");
    }

    return {
      category: question.category.slice(0, 40),
      type: question.type,
      question: question.question.slice(0, 300),
      answers: question.answers.map((answer) => String(answer).slice(0, 160)),
      correct: question.correct_index,
      explanation: question.explanation.slice(0, 500)
    };
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10000) {
        const error = new Error("La demande est trop volumineuse.");
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("La demande doit être au format JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(data));
}

