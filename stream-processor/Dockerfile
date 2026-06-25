FROM python:3.12-slim

# Java runtime required by Spark; resolve JAVA_HOME independent of arch.
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless procps \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s "$(dirname $(dirname $(readlink -f $(which java))))" /opt/java-home
ENV JAVA_HOME=/opt/java-home

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the Kafka connector jars into the Ivy cache at build time.
COPY warmup.py ./
RUN python warmup.py || echo "warmup attempted"

COPY job.py ./
RUN mkdir -p /app/checkpoint

CMD ["python", "job.py"]
