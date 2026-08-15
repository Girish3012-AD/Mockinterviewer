FROM eclipse-temurin:21-jdk-alpine

# Working directory for code execution
WORKDIR /app

# No network access by default (enforced at container run time via --network=none)
# This image is intentionally minimal

# Default: compile and run whatever Solution.java is mounted at /app/Solution.java
CMD ["sh", "-c", "javac Solution.java && java Solution"]
