from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col,
    from_json,
    hour,
    lit
)
from pyspark.sql.types import (
    StructType,
    StructField,
    IntegerType,
    StringType,
    DoubleType
)


# ============================================================
# CONFIGURATION
# ============================================================

KAFKA_BOOTSTRAP_SERVERS = "kafka:29092"
INPUT_TOPIC = "transactions.received"
OUTPUT_TOPIC = "transactions.features.generated"


# ============================================================
# SCHEMA DES TRANSACTIONS
# ============================================================

transaction_schema = StructType([
    StructField("transaction_id", IntegerType(), False),
    StructField("client_id", IntegerType(), True),
    StructField("account_id", IntegerType(), True),
    StructField("card_id", IntegerType(), True),
    StructField("merchant_id", IntegerType(), True),
    StructField("device_id", IntegerType(), True),

    StructField("transaction_type", StringType(), True),

    StructField("amount", DoubleType(), True),
    StructField("currency", StringType(), True),

    StructField("country", StringType(), True),
    StructField("ip_address", StringType(), True)
])


# ============================================================
# SPARK
# ============================================================

spark = (
    SparkSession.builder
    .appName("FraudDetectionFeatureEngineering")
    .master("local[2]")
    .getOrCreate()
)

spark.sparkContext.setLogLevel("WARN")


# ============================================================
# LECTURE KAFKA
# ============================================================

raw_transactions = (
    spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
    .option("subscribe", INPUT_TOPIC)
    .option("startingOffsets", "latest")
    .load()
)


# ============================================================
# PARSING DU JSON
# ============================================================

parsed_transactions = (
    raw_transactions
    .select(
        from_json(
            col("value").cast("string"),
            transaction_schema
        ).alias("transaction")
    )
    .select("transaction.*")
)


# ============================================================
# PREMIÈRES FEATURES
# ============================================================

features = (
    parsed_transactions
    .withColumn(
        "is_high_amount",
        (col("amount") >= 500000).cast("integer")
    )
    .withColumn(
        "is_foreign_transaction",
        (col("country") != lit("Togo")).cast("integer")
    )
)


# ============================================================
# SORTIE : TRANSACTIONS AVEC FEATURES
# ============================================================

output = (
    features
    .selectExpr(
        "CAST(transaction_id AS STRING) AS key",
        "to_json(struct(*)) AS value"
    )
)


query = (
    output.writeStream
    .format("kafka")
    .option(
        "kafka.bootstrap.servers",
        KAFKA_BOOTSTRAP_SERVERS
    )
    .option("topic", OUTPUT_TOPIC)
    .option(
        "checkpointLocation",
        "/tmp/fraud-features-checkpoint"
    )
    .outputMode("append")
    .start()
)


query.awaitTermination()