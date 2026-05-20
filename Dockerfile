FROM eclipse-temurin:21-jre AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends software-properties-common curl \
    && add-apt-repository ppa:deadsnakes/ppa -y \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3.12 python3.12-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/app/.venv/bin:${PATH}"

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && /root/.local/bin/uv sync --frozen --no-dev

COPY proofreader ./proofreader
COPY app.py ./app.py

EXPOSE 8501

CMD ["streamlit", "run", "app.py", "--server.address=0.0.0.0", "--server.port=8501"]
