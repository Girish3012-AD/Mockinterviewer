import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BASE_SYSTEM_INSTRUCTION = `You are "Alex", a Senior Technical Recruiter and Engineering Lead conducting a live mock interview.

YOUR GOAL:
Conduct a realistic, 1-on-1 voice interview with the candidate. Evaluate their communication, technical depth, and adherence to the STAR method (Situation, Task, Action, Result).

CONVERSATIONAL RULES (CRITICAL FOR VOICE OUTPUT):
1. Keep responses brief and spoken-word friendly (2 to 4 sentences max per turn). Never write long paragraphs, bullet points, or markdown lists.
2. Ask ONLY ONE question at a time. Wait for the user's response before proceeding.
3. Acknowledge what the user said in 1 brief sentence, then ask a logical follow-up or move to the next question from your interview plan.
4. Maintain a professional, polite, yet rigorous tone. If an answer is vague, gently press them for technical specifics (e.g., "Can you elaborate on what exact framework you used to solve that?").
5. Do not give away the ideal answer during the interview. Save overall feedback for the final evaluation.`;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/generate-questions", async (req, res) => {
    try {
      const { jobDescription, resume } = req.body;
      
      const prompt = `[JOB DESCRIPTION]\n${jobDescription}\n\n[CANDIDATE RESUME]\n${resume}`;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set." });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: `You are an expert technical hiring manager. Your task is to analyze a candidate's resume against a target job description and generate 5 highly tailored interview questions.

REQUIREMENTS:
- Generate exactly 3 Behavioral questions (evaluating past experience, conflict, or problem-solving).
- Generate exactly 2 Technical questions (evaluating hard skills mentioned in the job description that match or challenge the resume).
- Return ONLY valid JSON adhering strictly to the requested schema. Do not include markdown formatting or extra text outside the JSON.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              interview_plan: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    question: { type: Type.STRING },
                    type: { type: Type.STRING },
                    focus_area: { type: Type.STRING }
                  },
                  required: ["id", "question", "type", "focus_area"]
                }
              }
            },
            required: ["interview_plan"]
          }
        }
      });

      if (!response.text) throw new Error("No response text");
      res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("Error generating questions:", error);
      res.status(500).json({ error: "Failed to generate questions." });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { history, message, interviewPlan } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set." });
      }

      let systemInstruction = BASE_SYSTEM_INSTRUCTION;
      if (interviewPlan) {
        systemInstruction += `\n\nHere is your interview plan to follow:\n${JSON.stringify(interviewPlan, null, 2)}`;
      }

      const formattedHistory = history.map((msg: any) => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      }));

      const contents = [
        ...formattedHistory,
        { role: 'user', parts: [{ text: message }] }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({ text: response.text });
    } catch (error) {
      console.error("Error generating content:", error);
      res.status(500).json({ error: "Failed to generate response." });
    }
  });

  app.post("/api/evaluate", async (req, res) => {
    try {
      const { transcript } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set." });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: transcript,
        config: {
          systemInstruction: `You are an executive hiring manager conducting a post-interview performance review.

YOUR TASK:
Analyze the provided interview transcript against the STAR method (Situation, Task, Action, Result) and produce a detailed evaluation.

OUTPUT REQUIREMENTS:
Provide a structured assessment containing:
1. Overall Score (0-100) and Recommendation (Hire / Strong Hire / No Hire).
2. STAR Breakdown: Evaluate whether the candidate clearly defined their Situation, Task, Action, and measurable Results.
3. Top 2 Strengths: Specific things they did well.
4. Top 2 Weaknesses: Specific areas where they lacked clarity or technical detail.
5. Rewritten Answers: Take their weakest answer from the transcript and rewrite it into an ideal, high-impact STAR response.`,
          temperature: 0.7,
        }
      });

      res.json({ feedback: response.text });
    } catch (error) {
      console.error("Error generating feedback:", error);
      res.status(500).json({ error: "Failed to generate feedback." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
