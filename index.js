
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const SUNO_API_KEY = process.env.SUNO_API_KEY;

// À configurer selon la documentation de ton fournisseur Suno API.
const SUNO_API_URL = process.env.SUNO_API_URL;

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ZikAi Server est en ligne !",
    version: "1.0.0"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/generate", async (req, res) => {
  try {
    const { lyrics, genre, voice } = req.body || {};

    if (typeof lyrics !== "string" || !lyrics.trim()) {
      return res.status(400).json({
        success: false,
        error: "Les paroles sont obligatoires."
      });
    }

    if (lyrics.length > 5000) {
      return res.status(400).json({
        success: false,
        error: "Les paroles ne doivent pas dépasser 5000 caractères."
      });
    }

    if (!SUNO_API_KEY || !SUNO_API_URL) {
      return res.status(503).json({
        success: false,
        error: "L'API musicale n'est pas encore configurée."
      });
    }

    const prompt = [
      lyrics.trim(),
      genre ? `Style musical : ${String(genre).slice(0, 100)}` : "",
      voice ? `Type de voix : ${String(voice).slice(0, 100)}` : ""
    ].filter(Boolean).join("\n");

    const response = await fetch(SUNO_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUNO_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        make_instrumental: false
      }),
      signal: AbortSignal.timeout(30000)
    });

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText.slice(0, 500) };
    }

    if (!response.ok) {
      console.error("Erreur du fournisseur musical :", response.status);

      return res.status(502).json({
        success: false,
        error: "Le fournisseur musical a refusé la demande.",
        providerStatus: response.status
      });
    }

    // La structure de la réponse dépend du fournisseur utilisé.
    // On la renvoie sans inventer une URL audio.
    return res.json({
      success: true,
      message: "Demande transmise au fournisseur musical.",
      providerResponse: data
    });
  } catch (error) {
    console.error("Erreur de génération :", error.name);

    return res.status(500).json({
      success: false,
      error: error.name === "TimeoutError"
        ? "Le fournisseur musical met trop de temps à répondre."
        : "Une erreur est survenue pendant la génération."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ZikAi Server démarré sur le port ${PORT}`);
});

