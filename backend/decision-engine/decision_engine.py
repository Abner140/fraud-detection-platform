# ============================================================
# DECISION ENGINE
# ============================================================

from kafka import KafkaConsumer, KafkaProducer
import json


INPUT_TOPIC = "transactions.scored"
OUTPUT_TOPIC = "transactions.decision"


# ============================================================
# KAFKA PRODUCER
# ============================================================

producer = KafkaProducer(
    bootstrap_servers="localhost:9092",
    value_serializer=lambda value: json.dumps(
        value
    ).encode("utf-8")
)


# ============================================================
# KAFKA CONSUMER
# ============================================================

consumer = KafkaConsumer(
    INPUT_TOPIC,
    bootstrap_servers="localhost:9092",
    auto_offset_reset="latest",
    enable_auto_commit=True,
    group_id="decision-engine-v1",
    value_deserializer=lambda value: json.loads(
        value.decode("utf-8")
    ),
)


# ============================================================
# DECISION ENGINE
# ============================================================

def process_scoring_result(scoring_result):
    """
    Transmet la décision produite par le modèle vers
    le topic transactions.decision.

    Le Decision Engine ne recalcule pas le score.
    """

    transaction_id = scoring_result.get("transaction_id")
    fraud_probability = scoring_result.get("fraud_probability")
    decision = scoring_result.get("decision")

    if transaction_id is None:
        raise ValueError(
            "transaction_id manquant dans le résultat du scoring."
        )

    if decision not in {"APPROVED", "OTP_REQUIRED"}:
        raise ValueError(
            f"Décision invalide reçue du scoring : {decision}"
        )

    decision_result = {
        "transaction_id": transaction_id,
        "fraud_probability": fraud_probability,
        "decision": decision,
        "model_name": scoring_result.get(
            "model_name"
        ),
        "model_version": scoring_result.get(
            "model_version"
        ),
        "threshold_otp": scoring_result.get(
            "threshold_otp"
        ),
    }

    return decision_result


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    print("\n=== DECISION ENGINE ===")
    print("Topic entrée :", INPUT_TOPIC)
    print("Topic sortie :", OUTPUT_TOPIC)
    print("En attente des résultats du scoring...\n")

    try:

        for message in consumer:

            scoring_result = message.value

            print("\n========================================")
            print("Résultat du scoring reçu")
            print("========================================")
            print(scoring_result)

            try:

                decision_result = process_scoring_result(
                    scoring_result
                )

                print("\n=== DÉCISION ===")
                print(
                    "Transaction ID :",
                    decision_result["transaction_id"]
                )
                print(
                    "Score fraude   :",
                    decision_result["fraud_probability"]
                )
                print(
                    "Décision       :",
                    decision_result["decision"]
                )

                producer.send(
                    OUTPUT_TOPIC,
                    value=decision_result
                )

                producer.flush()

                print(
                    f"\n✅ Décision publiée sur {OUTPUT_TOPIC}"
                )

            except Exception as e:

                print(
                    "\n❌ Erreur dans le Decision Engine :"
                )
                print(e)

    except KeyboardInterrupt:

        print("\nArrêt du Decision Engine...")

    finally:

        consumer.close()
        producer.close()

        print(
            "✅ Consumer et producer Kafka fermés."
        )