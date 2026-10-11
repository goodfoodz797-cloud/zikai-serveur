
const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
const PORT = process.env.PORT || 3000;
const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_CREATE_URL =
  "https://www.suno-api.io/api/music/create";
const SUNO_QUERY_URL =
  "https://www.suno-api.io/api/music/query";
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ZikAI Server est en ligne !",
    version: "2.0.0"
  });
});
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.post("/generate", async (req, res) => {
  try {
    const { lyrics, genre, voice, instrumental } =
      req.body || {};
    if (!SUNO_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "La clé SUNO_API_KEY manque dans Render."
      });
    }
    if (
      !instrumental &&
      (typeof lyrics !== "string" || !lyrics.trim())
    ) {
      return res.status(400).json({
        success: false,
        error: "Les paroles sont obligatoires."
      });
    }
    if (typeof lyrics === "string" && lyrics.length > 5000) {
      return res.status(400).json({
        success: false,
        error: "Maximum 5000 caractères pour les paroles."
      });
    }
    const description = [
      instrumental ? "Musique instrumentale, sans paroles." : lyrics.trim(),
      genre ? `Style musical : ${String(genre).slice(0, 100)}` : "",
      voice ? `Type de voix : ${String(voice).slice(0, 100)}` : ""
    ].filter(Boolean).join("\n");
    const headers = {
      Authorization: `Bearer ${SUNO_API_KEY}`,
      "Content-Type": "application/json"
    };
    const createResponse = await fetch(SUNO_CREATE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        description,
        model: "suno-v6"
      }),
      signal: AbortSignal.timeout(30000)
    });
    const createData = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
      console.error("Suno create error:", createResponse.status);
      return res.status(502).json({
        success: false,
        error: "Impossible de lancer la génération musicale.",
        providerStatus: createResponse.status
      });
    }
    const findIds = (obj) => {
      if (!obj || typeof obj !== "object") return [];
      const ids = [];
      if (obj.song_id) ids.push(obj.song_id);
      if (obj.songId) ids.push(obj.songId);
      if (obj.task_id) ids.push(obj.task_id);
      if (obj.taskId) ids.push(obj.taskId);
      for (const value of Object.values(obj)) {
        if (value && typeof value === "object") {
          ids.push(...findIds(value));
        }
      }
      return [...new Set(ids.map(String))];
    };
    const findAudio = (obj) => {
      if (!obj || typeof obj !== "object") return null;
      for (const [key, value] of Object.entries(obj)) {
        if (
          typeof value === "string" &&
          /^(audio_url|audioUrl|stream_url|streamUrl|url)$/i.test(key) &&
          /^https?:\/\//i.test(value)
        ) {
          return value;
        }
      }
      for (const value of Object.values(obj)) {
        if (value && typeof value === "object") {
          const found = findAudio(value);
          if (found) return found;
        }
      }
      return null;
    };
    const ids = findIds(createData);
    const directAudio = findAudio(createData);
    if (directAudio) {
      return res.json({
        success: true,
        status: "completed",
        audioUrl: directAudio,
        data: createData
      });
    }
    if (!ids.length) {
      console.error("Suno response did not contain an ID.");
      return res.status(502).json({
        success: false,
        error: "La réponse du fournisseur ne contient aucun identifiant de génération."
      });
    }
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const queryResponse = await fetch(SUNO_QUERY_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          song_ids: ids,
          model: "suno-v6"
        }),
        signal: AbortSignal.timeout(20000)
      });
      const queryData = await queryResponse.json().catch(() => ({}));
      if (!queryResponse.ok) {
        console.error("Suno query error:", queryResponse.status);
        return res.status(502).json({
          success: false,
          error: "Impossible de vérifier l'état de la génération."
        });
      }
      const audioUrl = findAudio(queryData);
      if (audioUrl) {
        return res.json({
          success: true,
          status: "completed",
          audioUrl,
          data: queryData
        });
      }
      const serialized = JSON.stringify(queryData).toLowerCase();
      if (
        serialized.includes('"status":"failed"') ||
        serialized.includes('"status":"error"')
      ) {
        return res.status(502).json({
          success: false,
          error: "La génération musicale a échoué."
        });
      }
    }
    return res.status(202).json({
      success: true,
      status: "processing",
      message: "La musique est toujours en cours de génération.",
      taskIds: ids
    });
  } catch (error) {
    console.error("Generation error:", error.name);
    return res.status(500).json({
      success: false,
      error: error.name === "TimeoutError"
        ? "Le fournisseur musical met trop de temps à répondre."
        : "Erreur interne pendant la génération."
    });
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`ZikAI Server démarré sur le port ${PORT}`);
});
