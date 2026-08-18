"""
verify_requirements.py — Verification script for Gemini error codes, 429/503 status codes, and demo fallbacks.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import asyncio
import httpx
from services.gemini import GeminiAPIError, generate_questions

from main import app
from fastapi.testclient import TestClient

BASE = "http://localhost:8000"

async def test_verification():
    print("=== REQUIREMENT VERIFICATION TEST ===")
    
    # 1 & 2: Verify GeminiAPIError 429 & 503 status codes via FastAPI exception handler
    with TestClient(app) as client:
        # Test GeminiAPIError with status 429
        @app.get("/test-429")
        async def route_429():
            raise GeminiAPIError("Rate limit exceeded", status_code=429)
        
        @app.get("/test-503")
        async def route_503():
            raise GeminiAPIError("Service unavailable", status_code=503)

        r429 = client.get("/test-429")
        assert r429.status_code == 429, f"Expected 429, got {r429.status_code}"
        assert "Rate limit exceeded" in r429.json()["detail"]
        print("[PASS] 1. Gemini quota/rate-limit error -> returns HTTP 429")

        r503 = client.get("/test-503")
        assert r503.status_code == 503, f"Expected 503, got {r503.status_code}"
        assert "Service unavailable" in r503.json()["detail"]
        print("[PASS] 2. Gemini service/unavailable error -> returns HTTP 503")

    # 3, 4, 5: Verify demo fallbacks for extract-claims, analyze-job-fit, generate-questions via HTTP API
    async with httpx.AsyncClient(base_url=BASE, timeout=10.0) as http:
        # Create a test session
        r = await http.post("/api/sessions", json={"job_description": "Software Eng", "resume": "Python Dev"})
        session_id = r.json()["session_id"]

        # 3. Extract claims fallback
        r_claims = await http.post("/api/extract-claims", json={"session_id": session_id, "resume": "Python Dev"})
        assert r_claims.status_code == 200, f"Expected 200, got {r_claims.status_code}"
        claims_data = r_claims.json()
        assert len(claims_data["claims"]) > 0
        print(f"[PASS] 3. extract-claims demo fallback works ({len(claims_data['claims'])} claims returned)")

        # 4. Analyze job fit fallback
        r_fit = await http.post("/api/analyze-job-fit", json={"session_id": session_id, "job_description": "Software Eng", "resume_claims": claims_data["claims"]})
        assert r_fit.status_code == 200, f"Expected 200, got {r_fit.status_code}"
        fit_data = r_fit.json()
        assert "readiness_score_percentage" in fit_data
        print(f"[PASS] 4. analyze-job-fit demo fallback works (readiness score: {fit_data['readiness_score_percentage']}%)")

        # 5. Generate questions fallback
        r_questions = await http.post("/api/generate-questions", json={"session_id": session_id, "job_description": "Software Eng", "resume": "Python Dev"})
        assert r_questions.status_code == 200, f"Expected 200, got {r_questions.status_code}"
        plan_data = r_questions.json()
        assert len(plan_data["interview_plan"]) == 5
        print(f"[PASS] 5. generate-questions demo fallback works ({len(plan_data['interview_plan'])} questions generated)")

if __name__ == "__main__":
    asyncio.run(test_verification())
