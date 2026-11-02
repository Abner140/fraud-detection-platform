import json

from kafka import KafkaConsumer, KafkaProducer


# ============================================================
# CONFIGURATION
# ============================================================

KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"

INPUT_TOPIC = "transactions.features.generated"
OUTPUT_TOPIC = "transactions.scored"


# ============================================================
# CONSUMER
# ============================================================

consumer = KafkaConsumer(
    INPUT_TOPIC,
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    auto_offset_reset="earliest",
    enable_auto_commit=True,
    group_id="fraud-scoring-service",
    value_deserializer=lambda value: json.loads(value.decode("utf-8"))
)


# ============================================================
# PRODUCER
# ============================================================

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    value_serializer=lambda value: json.dumps(value).encode("utf-8")
)


# ============================================================
# CALCUL DU SCORE
# ============================================================

def calculate_fraud_score(transaction):
    """
    Première version du moteur de scoring.
    
    Cette logique est temporaire.
    Elle sera remplacée plus tard par notre modèle ML.
    """

    score = 0.0

    # Montant élevé
    if transaction.get("is_high_amount") == 1:
        score += 0.5

    # Transaction dans un pays différent du pays habituel
    if transaction.get("is_foreign_transaction") == 1:
        score += 0.4

    # Limiter le score entre 0 et 1
    score = min(score, 1.0)

    return score


# ============================================================
# CONVERSION DU SCORE EN NIVEAU DE RISQUE
# ============================================================

def determine_risk_level(score):
    if score >= 0.8:
        return "HIGH"

    if score >= 0.5:
        return "MEDIUM"

    return "LOW"


# ============================================================
# TRAITEMENT DES TRANSACTIONS
# ============================================================

print("Fraud Scoring Service démarré...")
print(f"Lecture : {INPUT_TOPIC}")
print(f"Sortie  : {OUTPUT_TOPIC}")


try:

    for message in consumer:

        transaction = message.value

        fraud_score = calculate_fraud_score(transaction)

        risk_level = determine_risk_level(fraud_score)

        scored_transaction = {
            **transaction,
            "fraud_score": fraud_score,
            "risk_level": risk_level
        }

        producer.send(
            OUTPUT_TOPIC,
            key=str(
                transaction.get("transaction_id")
            ).encode("utf-8"),
            value=scored_transaction
        )

        producer.flush()

        print(
            f"Transaction {transaction.get('transaction_id')} "
            f"→ score={fraud_score:.2f} "
            f"→ risk={risk_level}"
        )


except KeyboardInterrupt:

    print("\nFraud Scoring Service arrêté.")


finally:

    consumer.close()
    producer.close()