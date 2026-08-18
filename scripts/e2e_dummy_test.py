"""
End-to-end internal test with complex dummy JD + resume inputs.
Exercises: session setup, claims, job fit, questions, WebSocket chat, code submit, scorecard.
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
from typing import Any

import httpx
import websockets

BASE = "http://localhost:8000"
WS_BASE = "ws://localhost:8000"

# Complex dummy inputs (Senior Platform Engineer role + inflated resume)
JOB_DESCRIPTION = """
Senior Staff Platform Engineer — FinCore Payments (Remote, US)

About the role:
FinCore processes $48B/year in card and ACH transactions. We are rebuilding our
payment orchestration layer on Kubernetes (EKS) with event-driven microservices.
You will lead design reviews, mentor 6 engineers, and own reliability for our
core ledger and settlement pipeline.

Must have (5+ years):
- Production Java 17+ / Spring Boot 3 services at scale (10k+ RPS)
- Apache Kafka: exactly-once semantics, idempotent consumers, schema registry (Avro)
- Kubernetes: Helm, HPA/VPA, network policies, service mesh (Istio preferred)
- Distributed transactions: Saga pattern, outbox pattern, CDC (Debezium)
- Observability: OpenTelemetry, Prometheus/Grafana, SLO/error budgets
- MySQL or PostgreSQL at scale: sharding, read replicas, connection pooling
- CI/CD: GitHub Actions or Jenkins, blue/green or canary deploys
- Security: PCI-DSS scope reduction, secrets management (Vault), mTLS

Nice to have:
- Rust or Go for performance-critical path components
- Experience with payment networks (Visa/Mastercard ISO8583) or ACH (NACHA)
- Chaos engineering (Litmus/Gremlin), incident command (PagerDuty)
- Terraform + AWS (EKS, RDS, MSK, SQS/SNS)

Responsibilities:
- Design and implement idempotent payment state machines with compensating actions
- Reduce p99 latency from 800ms to <200ms for authorization path
- Lead postmortems; drive blameless culture and runbook automation
- Partner with compliance on audit trails and data retention (7-year policy)

Interview focus: deep system design, failure modes, ownership stories, and live coding
(Java — implement a rate limiter or LRU cache with thread safety).
""".strip()

RESUME = """
ALICE ENGINEER
San Francisco, CA | alice.engineer@email.com | github.com/alice-engineer

SUMMARY
Staff-level platform engineer with 9 years building high-throughput distributed systems.
Expert in microservices, cloud-native architecture, and "petabyte-scale" data pipelines.
Passionate leader who "architected zero-downtime migrations" and "owned end-to-end reliability."

EXPERIENCE

TechNova Inc — Senior Software Engineer (2021–Present)
- Led migration of monolith to 40+ microservices on AWS ECS (not Kubernetes); claimed 99.99% uptime
- Built "real-time event bus" using RabbitMQ (not Kafka); processed ~2M messages/day
- Implemented caching layer with Redis; reduced API latency "by 60%" (baseline unclear)
- Mentored 3 junior engineers; ran weekly design docs reviews
- Technologies: Java 11, Spring Boot 2, PostgreSQL, Docker, Terraform, Jenkins

DataStream Corp — Software Engineer (2017–2021)
- Developed ETL pipelines ingesting 500GB/day into Snowflake using Airflow
- Wrote internal CLI in Python for deployment automation
- Participated in on-call rotation; resolved ~15 Sev-2 incidents/quarter
- "Designed sharded MySQL cluster" — details unavailable; team size 8

StartupXYZ — Full Stack Developer (2015–2017)
- Built React/Node MVP for B2B SaaS; acquired by DataStream Corp
- Implemented Stripe checkout integration for subscriptions

EDUCATION
B.S. Computer Science, State University (2015)

SKILLS (self-rated)
Java ████████░░  Kubernetes ████░░░░░░  Kafka ██░░░░░░░░
System Design ████████░░  PCI-DSS █░░░░░░░░░  Istio ░░░░░░░░░░
Go/Rust ░░░░░░░░░░  Payment Networks ░░░░░░░░░░

CERTIFICATIONS
AWS Solutions Architect Associate (2022, expired 2025)
""".strip()

CANDIDATE_ANSWERS = [
    (
        "I'm Alice, a platform engineer with about nine years of experience. "
        "At TechNova I led our microservices migration and built event-driven services "
        "that handle millions of transactions. I'm excited about FinCore because "
        "your scale and reliability requirements match what I've been doing, and "
        "I want to deepen my work on payment-grade distributed systems."
    ),
    (
        "Situation: At TechNova our authorization API p99 was around 900ms during peak. "
        "Task: I owned reducing latency without sacrificing correctness. "
        "Action: I profiled hot paths, added Redis caching for idempotent lookups, "
        "and refactored synchronous DB calls into async batch fetches. "
        "Result: p99 dropped to about 350ms and error rate stayed flat. "
        "I didn't have full OpenTelemetry then — we used CloudWatch and custom timers."
    ),
    (
        "For idempotent payment processing I'd use a state machine with explicit states "
        "(INITIATED, AUTHORIZED, CAPTURED, FAILED, REFUNDED). Each transition gets a "
        "unique idempotency key stored in a durable outbox table. On retry, we check "
        "the key before side effects. For cross-service flows I'd use saga orchestration "
        "with compensating transactions. I haven't implemented ISO8583 but the pattern "
        "is similar to what we did with webhook retries at TechNova."
    ),
    (
        "We used RabbitMQ with at-least-once delivery. Consumers had to be idempotent. "
        "I know Kafka offers stronger guarantees with transactions and exactly-once in "
        "newer versions — I'd want to learn your schema registry setup. "
        "For ordering I'd partition by payment_id so all events for one payment "
        "land on the same partition."
    ),
    (
        "Here's a thread-safe LRU cache approach in Java: use LinkedHashMap in access-order "
        "mode wrapped in Collections.synchronizedMap, or ConcurrentHashMap plus "
        "DoublyLinkedList with ReentrantReadWriteLock. get() moves node to head; "
        "put() evicts tail when size exceeds capacity. "
        "Time O(1) average, space O(n). I'd add metrics for hit rate and lock contention."
    ),
]

JAVA_CODE = """
import java.util.*;

public class Solution {
    private final int capacity;
    private final Map<Integer, String> map;
    private final Deque<Integer> order = new ArrayDeque<>();

    public Solution(int capacity) {
        this.capacity = capacity;
        this.map = new HashMap<>();
    }

    public synchronized String get(int key) {
        if (!map.containsKey(key)) return null;
        order.remove(key);
        order.addFirst(key);
        return map.get(key);
    }

    public synchronized void put(int key, String value) {
        if (map.containsKey(key)) {
            order.remove(key);
        } else if (map.size() >= capacity) {
            int evict = order.removeLast();
            map.remove(evict);
        }
        order.addFirst(key);
        map.put(key, value);
    }

    public static void main(String[] args) {
        Solution cache = new Solution(2);
        cache.put(1, "a");
        cache.put(2, "b");
        System.out.println(cache.get(1));
        cache.put(3, "c");
        System.out.println(cache.get(2));
        System.out.println(cache.get(3));
    }
}
""".strip()


def ok(label: str, detail: str = "") -> None:
    suffix = f" — {detail}" if detail else ""
    print(f"  [PASS] {label}{suffix}")


def fail(label: str, detail: str) -> None:
    print(f"  [FAIL] {label} — {detail}")


def section(title: str) -> None:
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}")


async def gemini_pause(seconds: float = 2.0) -> None:
    """Pause between API calls."""
    print(f"         (pausing {seconds:.1f}s...)")
    await asyncio.sleep(seconds)



async def run_test() -> int:
    errors: list[str] = []
    session_id: str | None = None
    claims: list[dict[str, Any]] = []
    questions: list[dict[str, Any]] = []

    section("1. Health check")
    async with httpx.AsyncClient(base_url=BASE, timeout=120.0) as client:
        r = await client.get("/health")
        if r.status_code == 200 and r.json().get("status") == "ok":
            ok("Backend health", r.json().get("version", ""))
        else:
            fail("Backend health", str(r.status_code))
            return 1

        section("2. Create session")
        r = await client.post("/api/sessions", json={
            "job_description": JOB_DESCRIPTION,
            "resume": RESUME,
        })
        if r.status_code != 200:
            fail("Create session", r.text)
            return 1
        session_id = r.json()["session_id"]
        ok("Create session", session_id[:8] + "...")

        section("3. Extract resume claims")
        t0 = time.perf_counter()
        r = await client.post("/api/extract-claims", json={
            "session_id": session_id,
            "resume": RESUME,
        })
        elapsed = time.perf_counter() - t0
        if r.status_code != 200:
            fail("Extract claims", r.text)
            errors.append("extract-claims")
        else:
            claims = r.json()["claims"]
            ok("Extract claims", f"{len(claims)} claims in {elapsed:.1f}s")
            high_risk = [c for c in claims if c.get("interview_risk") == "High"]
            print(f"         High-risk claims: {len(high_risk)}")
            for c in claims[:3]:
                print(f"         - [{c.get('interview_risk')}] {c['claim_text'][:80]}...")

        await gemini_pause()

        section("4. Analyze job fit")
        t0 = time.perf_counter()
        r = await client.post("/api/analyze-job-fit", json={
            "session_id": session_id,
            "job_description": JOB_DESCRIPTION,
            "resume_claims": claims,
        })
        elapsed = time.perf_counter() - t0
        if r.status_code != 200:
            fail("Job fit", r.text)
            errors.append("job-fit")
        else:
            fit = r.json()
            score = fit["readiness_score_percentage"]
            gaps = fit["skill_gaps"]
            ok("Job fit", f"readiness {score}/100, {len(gaps)} gaps in {elapsed:.1f}s")
            for g in gaps[:4]:
                print(f"         - {g['skill']} ({g['gap_type']}): {g['explanation'][:70]}...")

        await gemini_pause()

        section("5. Generate interview plan")
        t0 = time.perf_counter()
        r = await client.post("/api/generate-questions", json={
            "session_id": session_id,
            "job_description": JOB_DESCRIPTION,
            "resume": RESUME,
        })
        elapsed = time.perf_counter() - t0
        if r.status_code != 200:
            fail("Generate questions", r.text)
            errors.append("generate-questions")
        else:
            questions = r.json()["interview_plan"]
            behavioral = sum(1 for q in questions if q["type"] == "Behavioral")
            technical = sum(1 for q in questions if q["type"] == "Technical")
            ok("Generate questions", f"{len(questions)} total ({behavioral}B/{technical}T) in {elapsed:.1f}s")
            for q in questions:
                print(f"         Q{q['id']} [{q['type']}] {q['question'][:70]}...")

        if claims and questions:
            section("6. Evaluate single answer (shadow compiler path)")
            t0 = time.perf_counter()
            r = await client.post("/api/evaluate-answer", json={
                "claim": claims[0]["claim_text"],
                "question": questions[0]["question"],
                "answer": CANDIDATE_ANSWERS[1],
            })
            elapsed = time.perf_counter() - t0
            if r.status_code != 200:
                fail("Evaluate answer", r.text)
                errors.append("evaluate-answer")
            else:
                ev = r.json()
                ok(
                    "Evaluate answer",
                    f"credibility={ev['claim_credibility']}, "
                    f"tech={ev['evaluation_scores']['technical_correctness']}/10 "
                    f"in {elapsed:.1f}s",
                )

        section("7. Code submission (Java sandbox)")
        t0 = time.perf_counter()
        r = await client.post("/api/code/submit", json={
            "session_id": session_id,
            "source_code": JAVA_CODE,
            "question": "Implement a thread-safe LRU cache",
        })
        elapsed = time.perf_counter() - t0
        if r.status_code != 200:
            fail("Code submit", r.text)
            errors.append("code-submit")
        else:
            code = r.json()
            shadow = code.get("shadow_report") or {}
            ok(
                "Code submit",
                f"exit={code['exit_code']}, stdout={code['stdout'][:40]!r}, "
                f"shadow_score={shadow.get('correctness_score', 'n/a')} in {elapsed:.1f}s",
            )

        section("8. Start session + WebSocket interview")
        r = await client.post(f"/api/sessions/{session_id}/start")
        if r.status_code == 200:
            ok("Start session", r.json().get("status", ""))
        else:
            fail("Start session", r.text)
            errors.append("start-session")

    # WebSocket phase (separate from httpx client)
    ws_url = f"{WS_BASE}/ws/interview/{session_id}"
    try:
        async with websockets.connect(ws_url, open_timeout=30) as ws:
            ok("WebSocket connected")

            plan_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            if plan_msg.get("type") == "interview_plan":
                plan = plan_msg.get("metadata", {}).get("plan", [])
                ok("Received interview plan", f"{len(plan)} questions")
            else:
                fail("Interview plan", str(plan_msg.get("type")))

            opening = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            if opening.get("type") == "chat" and opening.get("content"):
                ok("Alex opening", opening["content"][:60] + "...")
            else:
                fail("Alex opening", str(opening))

            for i, answer in enumerate(CANDIDATE_ANSWERS):
                await ws.send(json.dumps({"type": "chat", "content": answer}))
                print(f"         >> Sent answer {i + 1}/{len(CANDIDATE_ANSWERS)} ({len(answer)} chars)")
                reply = json.loads(await asyncio.wait_for(ws.recv(), timeout=120))
                if reply.get("type") == "interview_complete":
                    ok("Interview auto-completed early", reply.get("content", "")[:50])
                    break
                if reply.get("type") != "chat":
                    fail(f"Reply {i + 1}", str(reply.get("type")))
                    errors.append(f"ws-reply-{i}")
                    break
                preview = reply["content"][:80].replace("\n", " ")
                print(f"         << Alex: {preview}...")
            else:
                await ws.send(json.dumps({"type": "end_interview", "content": ""}))
                end_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
                if end_msg.get("type") == "interview_complete":
                    ok("Interview ended", end_msg.get("content", ""))
                else:
                    fail("End interview", str(end_msg))

    except Exception as exc:
        fail("WebSocket interview", str(exc))
        errors.append("websocket")

        section("9. End session + STAR scorecard")
    async with httpx.AsyncClient(base_url=BASE, timeout=180.0) as client:
        t0 = time.perf_counter()
        r = None
        for attempt in range(3):
            r = await client.post(f"/api/sessions/{session_id}/end")
            if r.status_code == 200:
                break
            if r.status_code == 500 and attempt < 2:
                await gemini_pause(35)
            else:
                break
        elapsed = time.perf_counter() - t0
        if r.status_code != 200:
            fail("End session / scorecard", r.text)
            errors.append("end-session")
        else:
            sc = r.json()
            ok(
                "Scorecard generated",
                f"score={sc['overall_score']}/100, recommendation={sc['recommendation']} "
                f"in {elapsed:.1f}s",
            )
            sb = sc["star_breakdown"]
            print(f"         STAR: S={sb['situation']} T={sb['task']} A={sb['action']} R={sb['result']}")
            print(f"         Strengths: {sc['strengths'][:2]}")
            print(f"         Weaknesses: {sc['weaknesses'][:2]}")

        section("10. Session detail verification")
        r = await client.get(f"/api/sessions/{session_id}")
        if r.status_code == 200:
            detail = r.json()
            ok(
                "Session persisted",
                f"status={detail['status']}, questions={len(detail['questions'])}, "
                f"eval={'yes' if detail.get('evaluation') else 'no'}",
            )
        else:
            fail("Session detail", r.text)
            errors.append("session-detail")

        r = await client.get("/api/sessions")
        if r.status_code == 200:
            ok("List sessions", f"{len(r.json())} total")

    section("SUMMARY")
    if errors:
        print(f"  Completed with {len(errors)} failure(s): {', '.join(errors)}")
        return 1
    print("  All stages passed with complex dummy inputs.")
    print(f"  Session ID: {session_id}")
    print(f"  View scorecard: http://localhost:3000/scorecard?session={session_id}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run_test()))
