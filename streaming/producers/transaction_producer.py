import json
import sys

import psycopg2
from kafka import KafkaProducer


# ============================================================
# Configuration PostgreSQL
# ============================================================

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "fraud_detection",
    "user": "postgres",
    "password": "Abner@2005"
}


# ============================================================
# Configuration Kafka
# ============================================================

KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"
KAFKA_TOPIC = "transactions.received"


# ============================================================
# Vérification de l'argument transaction_id
# ============================================================

if len(sys.argv) < 2:
    print(
        "Usage : python streaming\\producers\\transaction_producer.py <transaction_id>"
    )
    sys.exit(1)

try:
    transaction_id = int(sys.argv[1])
except ValueError:
    print("❌ transaction_id doit être un entier.")
    sys.exit(1)


# ============================================================
# Récupération de la transaction PostgreSQL
# ============================================================

conn = None
cur = None

try:
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            transaction_id,
            account_id,
            card_id,
            merchant_id,
            device_id,
            transaction_type,
            amount,
            currency,
            country,
            host(ip_address) AS ip_address,
            timestamp,
            use_chip,
            mcc,
            zip,
            errors
        FROM transactions
        WHERE transaction_id = %s;
        """,
        (transaction_id,)
    )

    row = cur.fetchone()

    if row is None:
        print(
            f"❌ Transaction {transaction_id} introuvable dans PostgreSQL."
        )
        sys.exit(1)

    (
        transaction_id,
        account_id,
        card_id,
        merchant_id,
        device_id,
        transaction_type,
        amount,
        currency,
        country,
        ip_address,
        timestamp,
        use_chip,
        mcc,
        zip_code,
        errors
    ) = row

finally:
    if cur is not None:
        cur.close()

    if conn is not None:
        conn.close()


# ============================================================
# Construction du message Kafka
# ============================================================

transaction = {
    "transaction_id": transaction_id,
    "account_id": account_id,
    "card_id": card_id,
    "merchant_id": merchant_id,
    "device_id": device_id,
    "transaction_type": transaction_type,
    "amount": float(amount),
    "currency": currency,
    "country": country,
    "ip_address": ip_address,
    "timestamp": timestamp.isoformat() if timestamp else None,
    "use_chip": use_chip,
    "mcc": mcc,
    "zip": zip_code,
    "errors": errors
}


# ============================================================
# Création du Producer Kafka
# ============================================================

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    value_serializer=lambda value: json.dumps(
        value
    ).encode("utf-8")
)


# ============================================================
# Envoi vers Kafka
# ============================================================

try:

    print("\n=== TRANSACTION PRODUCER ===")
    print(f"Transaction ID : {transaction_id}")
    print(f"Montant        : {transaction['amount']} {currency}")
    print(f"Pays           : {country}")
    print(f"Topic          : {KAFKA_TOPIC}")

    future = producer.send(
        KAFKA_TOPIC,
        value=transaction
    )

    record_metadata = future.get(
        timeout=10
    )

    print("\n✅ Transaction envoyée avec succès !")
    print(f"Topic      : {record_metadata.topic}")
    print(f"Partition  : {record_metadata.partition}")
    print(f"Offset     : {record_metadata.offset}")


except Exception as error:

    print(
        f"\n❌ Erreur lors de l'envoi vers Kafka : {error}"
    )


finally:

    producer.flush()
    producer.close()

