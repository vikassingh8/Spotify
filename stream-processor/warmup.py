"""Build-time warmup: resolve the Spark-Kafka connector into the Ivy cache so
the container can start the streaming job offline at runtime."""
from pyspark.sql import SparkSession

spark = (
    SparkSession.builder.appName("warmup")
    .config(
        "spark.jars.packages",
        "org.apache.spark:spark-sql-kafka-0-10_2.13:4.1.2",
    )
    .getOrCreate()
)
print("ivy cache warmed for spark-sql-kafka")
spark.stop()
