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

  app.post("/api/extract-claims", async (req, res) => {
    try {
      const { resume } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set." });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: resume,
        config: {
          systemInstruction: `You are the Resume Intelligence Engine for an Interview Intelligence Platform. Your task is to extract atomic, independently testable claims from the provided resume text.

Rules:
A claim must be independently testable during an interview.
Preserve the candidate's exact meaning; do not invent achievements.
Prefer claims with a concrete action, technology, ownership, and measurable result.
Assign an importance score (1-5) based on how critical this claim is to a technical or professional profile.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                claim_text: { type: Type.STRING, description: "The atomic claim" },
                category: { type: Type.STRING, description: "e.g., project, technical, behavioral" },
                skill_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                importance: { type: Type.INTEGER }
              },
              required: ["claim_text", "category", "skill_tags", "importance"]
            }
          }
        }
      });

      if (!response.text) throw new Error("No response text");
      res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("Error extracting claims:", error);
      res.status(500).json({ error: "Failed to extract claims." });
    }
  });

  app.post("/api/analyze-job-fit", async (req, res) => {
    try {
      const { jobDescription, resumeClaims } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set." });
      }

      const prompt = `[JSON output from Resume Intelligence Engine]\n${JSON.stringify(resumeClaims)}\n\n[Raw Job Description text]\n${jobDescription}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: `You are the Job Intelligence Engine. Your task is to analyze a raw Job Description (JD) and a candidate's structured resume profile.

Rules:
Extract the required skills, preferred skills, and technologies from the JD.
Compare the candidate's profile against these requirements.
Identify gaps and classify them as: Missing (not demonstrated), Weak (shallow evidence), Unverified (claimed but not tested), or Strong (credible evidence).
Generate an explainable readiness score based on requirement coverage.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              required_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
              readiness_score_percentage: { type: Type.INTEGER },
              skill_gaps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    skill: { type: Type.STRING },
                    gap_type: { type: Type.STRING, description: "Missing, Weak, Unverified, or Strong" },
                    explanation: { type: Type.STRING }
                  },
                  required: ["skill", "gap_type", "explanation"]
                }
              }
            },
            required: ["required_skills", "readiness_score_percentage", "skill_gaps"]
          }
        }
      });

      if (!response.text) throw new Error("No response text");
      res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("Error analyzing job fit:", error);
      res.status(500).json({ error: "Failed to analyze job fit." });
    }
  });

  app.post("/api/evaluate-answer", async (req, res) => {
    try {
      const { claim, question, answer } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set." });
      }

      const prompt = `Claim Tested: "${claim}"\nQuestion: "${question}"\nCandidate Answer: "${answer}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: `You are the core Adaptive Interview Evaluator. You will receive a specific resume claim being tested, the interview question asked, and the candidate's answer transcript.

Rules:
Evaluate the answer based on Relevance, Technical Correctness, Depth, Ownership, and the STAR format.
Determine the Claim Credibility Level: "Strongly supported", "Partially supported", "Weakly supported", or "Unsupported".
Provide an explainable rationale for the evidence status.
Suggest the next question strategy (e.g., clarify weak answer, test missing skill, or probe claim deeper).`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              evaluation_scores: {
                type: Type.OBJECT,
                properties: {
                  technical_correctness: { type: Type.INTEGER, description: "Score 1-5" },
                  ownership: { type: Type.INTEGER, description: "Score 1-5" }
                },
                required: ["technical_correctness", "ownership"]
              },
              claim_credibility: { 
                type: Type.STRING, 
                description: "Strongly supported, Partially supported, Weakly supported, or Unsupported" 
              },
              evidence_rationale: { type: Type.STRING, description: "Why this credibility level was chosen" },
              next_question_strategy: { type: Type.STRING, description: "What type of question to ask next" }
            },
            required: ["evaluation_scores", "claim_credibility", "evidence_rationale", "next_question_strategy"]
          }
        }
      });

      if (!response.text) throw new Error("No response text");
      res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("Error evaluating answer:", error);
      res.status(500).json({ error: "Failed to evaluate answer." });
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
