# AI Mock Interview Copilot

## Overview
The AI Mock Interview Copilot is a full-stack application that simulates a realistic, voice-enabled technical interview. Powered by Google's Gemini AI, the platform acts as "Alex", a Senior Technical Recruiter, to evaluate candidates based on their resume and the target job description. 

## Core Features

### 1. Tailored Question Generation
* **Inputs**: Target Job Description and Candidate Resume.
* **AI Processing**: Uses Gemini with Structured Outputs (JSON) to generate an interview plan consisting of exactly 3 Behavioral questions and 2 Technical questions.
* **Focus**: Evaluates past experience, problem-solving, and hard technical skills.

### 2. Stripe Payment Integration
* **Monetization**: The live interview gateway is locked behind a Stripe Payment Link.
* **Access Control**: Users must pay $9.00 to unlock the interview. Upon successful payment, they are redirected back to the application with a `?paid=true` URL parameter, granting them access to the live session.

### 3. Voice-Enabled Live Interview Simulator
* **Persona**: "Alex", an AI recruiter instructed to ask one question at a time and maintain a professional, conversational tone.
* **Speech-to-Text (STT)**: Utilizes the browser's Web Speech API to allow candidates to dictate their answers hands-free.
* **Text-to-Speech (TTS)**: Automatically reads the recruiter's responses back to the candidate for a realistic audio experience.
* **Context-Aware**: The chat session dynamically injects the generated interview plan into the AI's context so it knows exactly what to ask.

### 4. Post-Interview STAR Scorecard
* **Evaluation**: Upon concluding the interview, the entire conversation transcript is sent to Gemini for executive-level review.
* **STAR Method**: The candidate's answers are strictly evaluated against the Situation, Task, Action, Result framework.
* **Feedback Delivery**: Generates an overall score, hire recommendation, top strengths, top weaknesses, and a rewritten "ideal" answer for the candidate's weakest response.

## Technical Architecture

### Frontend (Client-Side)
* **Framework**: React 18, Vite.
* **Styling**: Tailwind CSS, Lucide React (Icons).
* **State Management**: React Hooks (`useState`, `useEffect`, `useRef`).
* **Animations**: Motion (Framer Motion).
* **Markdown rendering**: `react-markdown` for the scorecard rendering.

### Backend (Server-Side)
* **Framework**: Node.js, Express.
* **AI Integration**: `@google/genai` (Gemini 2.5 Flash model).
* **Endpoints**:
  * `POST /api/generate-questions`: Parses JD and Resume, returns a structured JSON interview plan.
  * `POST /api/chat`: Handles the conversational turns with the "Alex" persona.
  * `POST /api/evaluate`: Analyzes the final transcript and returns a Markdown-formatted performance review.

## File Structure
* `/server.ts`: The Express backend and Gemini API integration.
* `/src/App.tsx`: The main React frontend containing all three states (Setup, Interview, Scorecard).
* `/src/types.ts`: TypeScript definitions for standardizing data schemas.
* `/src/index.css`: Global styles including custom markdown formatting.
* `/metadata.json`: Application metadata requesting microphone permissions.

## Deployment Information

The application is configured to run as a full-stack container on platforms like Google Cloud Run. The backend runs on Port 3000 and serves the Vite SPA statically in production mode.

*(Note: The user previously requested a Python-specific deployment configuration. If you intend to decouple the frontend and build a Python/FastAPI backend, you would use the following Dockerfile configuration)*:

```dockerfile
# Python Backend Dockerfile Example
FROM python:3.11-slim
ENV PYTHONUNBUFFERED True
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
```

**Google Cloud Run Deployment Command:**
```bash
gcloud run deploy interview-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```
