"""Spoty real-time stream processor (PySpark Structured Streaming).

Pipeline:
  Kafka(play-events) -> parse JSON -> pseudonymize userId (GDPR/CCPA)
    -> per-micro-batch windowed aggregation
    -> Redis sorted sets (live "trending now" leaderboards)
    -> Postgres rollups (play counts, unique listeners, user genre affinity)

Fault tolerance: a checkpoint directory tracks Kafka offsets so the job
resumes exactly where it stopped after a crash/restart (at-least-once).

Privacy: raw user ids are HMAC-SHA256 hashed BEFORE any aggregation or
storage. No raw identifier is ever persisted in the analytics tables.
"""
import hashlib
import hmac
import os
from datetime import timedelta

import psycopg2
import psycopg2.extras
import redis
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StringType, StructField, StructType

# ----------------------------- config -----------------------------
KAFKA_BROKERS = os.environ.get("KAFKA_BROKERS", "kafka:9092")
TOPIC = os.environ.get("KAFKA_EVENTS_TOPIC", "play-events")
SALT = os.environ.get("ANONYMIZATION_SALT", "spoty-salt").encode()
KAFKA_PKG = "org.apache.spark:spark-sql-kafka-0-10_2.13:4.1.2"

PG = dict(
    host=os.environ.get("POSTGRES_HOST", "postgres"),
    port=int(os.environ.get("POSTGRES_PORT", "5432")),
    dbname=os.environ.get("POSTGRES_DB", "spoty"),
    user=os.environ.get("POSTGRES_USER", "spoty"),
    password=os.environ.get("POSTGRES_PASSWORD", "spoty_pw"),
)
REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
# Per-minute leaderboard buckets expire after this, so "trending" reflects
# only recent activity (true trending-now) instead of growing forever.
TREND_TTL = int(os.environ.get("TRENDING_TTL_SEC", "1800"))

EVENT_SCHEMA = StructType(
    [
        StructField("type", StringType()),
        StructField("userId", StringType()),
        StructField("songId", StringType()),
        StructField("genre", StringType()),
        StructField("role", StringType()),
        StructField("ts", StringType()),
    ]
)


# Must match recommendation-service pseudonym(): HMAC-SHA256(salt, userId) hex
def _pseudonym(user_id: str) -> str:
    if user_id is None:
        return "anon"
    return hmac.new(SALT, str(user_id).encode(), hashlib.sha256).hexdigest()


pseudonym_udf = F.udf(_pseudonym, StringType())


# ------------------------ per-batch sink ------------------------
def process_batch(batch_df, epoch_id: int) -> None:
    plays = batch_df.filter(F.col("type") == "play")

    per_song = (
        plays.groupBy("songId", "genre", "window_start")
        .agg(
            F.count("*").alias("plays"),
            F.approx_count_distinct("user_hash").alias("uniq"),
        )
        .collect()
    )
    per_user = (
        plays.groupBy("user_hash", "genre")
        .agg(F.count("*").alias("c"))
        .collect()
    )

    if not per_song and not per_user:
        return

    # ---- Redis: increment per-minute leaderboard buckets (with TTL) ----
    # recommendation-service unions the most recent buckets to compute
    # "trending now"; expiry gives natural time-decay.
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)
    pipe = r.pipeline()
    for row in per_song:
        minute = int(row["window_start"].timestamp() // 60)
        gkey = f"plays:m:{minute}"
        gg = f"plays:g:{row['genre']}:m:{minute}"
        pipe.zincrby(gkey, row["plays"], row["songId"])
        pipe.expire(gkey, TREND_TTL)
        pipe.zincrby(gg, row["plays"], row["songId"])
        pipe.expire(gg, TREND_TTL)
    pipe.execute()

    # ---- Postgres: upsert rollups (pseudonymous only) ----
    conn = psycopg2.connect(**PG)
    conn.autocommit = True
    cur = conn.cursor()

    if per_song:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO song_play_counts (song_id, genre, window_start, window_end, play_count)
            VALUES %s
            ON CONFLICT (song_id, window_start)
            DO UPDATE SET play_count = song_play_counts.play_count + EXCLUDED.play_count
            """,
            [
                (int(x["songId"]), x["genre"], x["window_start"],
                 x["window_start"] + timedelta(minutes=1), int(x["plays"]))
                for x in per_song
            ],
        )
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO song_unique_listeners (song_id, window_start, unique_listeners)
            VALUES %s
            ON CONFLICT (song_id, window_start)
            DO UPDATE SET unique_listeners = GREATEST(
                song_unique_listeners.unique_listeners, EXCLUDED.unique_listeners)
            """,
            [(int(x["songId"]), x["window_start"], int(x["uniq"])) for x in per_song],
        )

    if per_user:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO user_genre_affinity (user_hash, genre, play_count)
            VALUES %s
            ON CONFLICT (user_hash, genre)
            DO UPDATE SET play_count = user_genre_affinity.play_count + EXCLUDED.play_count,
                          updated_at = now()
            """,
            [(x["user_hash"], x["genre"], int(x["c"])) for x in per_user],
        )

    cur.close()
    conn.close()
    print(f"[batch {epoch_id}] songs={len(per_song)} users={len(per_user)}")


def main() -> None:
    spark = (
        SparkSession.builder.appName("spoty-stream-processor")
        .config("spark.jars.packages", KAFKA_PKG)
        .config("spark.sql.shuffle.partitions", "4")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    raw = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BROKERS)
        .option("subscribe", TOPIC)
        .option("startingOffsets", "latest")
        .load()
    )

    parsed = (
        raw.select(F.from_json(F.col("value").cast("string"), EVENT_SCHEMA).alias("e"))
        .select("e.*")
        .withColumn("user_hash", pseudonym_udf(F.col("userId")))
        .drop("userId")  # drop raw id immediately
        .withColumn("ts", F.to_timestamp("ts"))
        .withColumn("window_start", F.date_trunc("minute", F.col("ts")))
    )

    query = (
        parsed.writeStream.foreachBatch(process_batch)
        .option("checkpointLocation", "/app/checkpoint")
        .outputMode("append")
        .trigger(processingTime="5 seconds")
        .start()
    )
    query.awaitTermination()


if __name__ == "__main__":
    main()
