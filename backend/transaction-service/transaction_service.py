import json
import os

import psycopg
from kafka import KafkaConsumer, KafkaProducer


# ============================================================
# CONFIGURATION
# ============================================================

KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"

DECISION_TOPIC = "transactions.decision"
OTP_VALIDATED_TOPIC = "transactions.otp.validated"
OUTPUT_TOPIC = "transactions.completed"

DB_HOST = "localhost"
DB_PORT = 5432
DB_NAME = "fraud_detection"
DB_USER = "postgres"
DB_PASSWORD = os.getenv("DB_PASSWORD")


# ============================================================
# KAFKA CONSUMERS
# ============================================================

decision_consumer = KafkaConsumer(
    DECISION_TOPIC,
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    auto_offset_reset="latest",
    enable_auto_commit=True,
    group_id="transaction-service-decision-v5",
)


otp_consumer = KafkaConsumer(
    OTP_VALIDATED_TOPIC,
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    auto_offset_reset="latest",
    enable_auto_commit=True,
    group_id="transaction-service-otp-v5",
)


# ============================================================
# KAFKA PRODUCER
# ============================================================

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    value_serializer=lambda value: json.dumps(
        value
    ).encode("utf-8"),
)


# ============================================================
# POSTGRESQL
# ============================================================

def get_postgres_connection():
    if not DB_PASSWORD:
        raise RuntimeError("La variable d'environnement DB_PASSWORD doit être définie.")

    return psycopg.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )


# ============================================================
# STATUT FINAL
# ============================================================

def determine_final_status(validation_status):

    if validation_status == "VALIDATED":
        return "APPROVED"

    if validation_status == "FAILED":
        return "CANCELLED"

    raise ValueError(
        f"Statut OTP invalide : {validation_status}"
    )


# ============================================================
# AUDIT
# ============================================================

def insert_audit_log(
    connection,
    transaction_id,
    event_type,
    details,
):
    with connection.cursor() as cursor:

        cursor.execute(
            """
            INSERT INTO audit_logs (
                transaction_id,
                event_type,
                service,
                timestamp,
                details
            )
            VALUES (
                %s,
                %s,
                %s,
                NOW(),
                %s::jsonb
            )
            """,
            (
                transaction_id,
                event_type,
                "transaction-service",
                json.dumps(details),
            ),
        )


# ============================================================
# FINALISATION IDEMPOTENTE
# ============================================================

def finalize_transaction(
    transaction_id,
    final_status,
    source_event,
    details,
):
    """
    Finalise une transaction de manière idempotente.

    PostgreSQL est la source de vérité :
    - PENDING -> APPROVED
    - PENDING -> CANCELLED
    - APPROVED -> IGNORE
    - CANCELLED -> IGNORE

    Le SELECT ... FOR UPDATE empêche deux traitements
    concurrents de finaliser la même transaction.
    """

    try:

        with get_postgres_connection() as connection:

            with connection.cursor() as cursor:

                # ------------------------------------------------
                # 1. Verrouillage de la ligne
                # ------------------------------------------------

                cursor.execute(
                    """
                    SELECT status
                    FROM transactions
                    WHERE transaction_id = %s
                    FOR UPDATE
                    """,
                    (transaction_id,),
                )

                row = cursor.fetchone()

                if row is None:
                    raise ValueError(
                        f"Transaction {transaction_id} "
                        f"absente de PostgreSQL"
                    )

                current_status = row[0]

                # ------------------------------------------------
                # 2. Idempotence
                # ------------------------------------------------

                if current_status in {
                    "APPROVED",
                    "CANCELLED",
                }:

                    print(
                        f"Transaction {transaction_id} : "
                        f"déjà finalisée "
                        f"({current_status}) → IGNORE"
                    )

                    return False

                # ------------------------------------------------
                # 3. Mise à jour du statut
                # ------------------------------------------------

                cursor.execute(
                    """
                    UPDATE transactions
                    SET status = %s
                    WHERE transaction_id = %s
                    """,
                    (
                        final_status,
                        transaction_id,
                    ),
                )

                # ------------------------------------------------
                # 4. Audit
                # ------------------------------------------------

                insert_audit_log(
                    connection,
                    transaction_id,
                    source_event,
                    details,
                )

                # Le contexte PostgreSQL commit ici
                # automatiquement si aucune exception n'est levée.

        # --------------------------------------------------------
        # 5. Publication de l'événement final
        # --------------------------------------------------------

        completed_event = {
            "transaction_id": transaction_id,
            "final_status": final_status,
            "source": source_event,
        }

        producer.send(
            OUTPUT_TOPIC,
            key=str(transaction_id).encode("utf-8"),
            value=completed_event,
        )

        producer.flush()

        print(
            f"Transaction {transaction_id} "
            f"→ FINAL={final_status} "
            f"→ PostgreSQL=OK"
        )

        return True

    except Exception as error:

        print(
            f"❌ Erreur finalisation transaction "
            f"{transaction_id} : {error}"
        )

        return False


# ============================================================
# TRAITEMENT DECISION
# ============================================================

def process_decision_event(event):

    transaction_id = event.get("transaction_id")
    decision = event.get("decision")

    if transaction_id is None:
        print(
            "⚠️ transaction_id manquant dans la décision."
        )
        return

    if decision == "APPROVED":

        finalize_transaction(
            transaction_id=transaction_id,
            final_status="APPROVED",
            source_event="DECISION_APPROVED",
            details={
                "decision": decision,
                "fraud_probability": event.get(
                    "fraud_probability"
                ),
                "model_name": event.get(
                    "model_name"
                ),
                "model_version": event.get(
                    "model_version"
                ),
                "threshold_otp": event.get(
                    "threshold_otp"
                ),
            },
        )

    elif decision == "OTP_REQUIRED":

        try:
            with get_postgres_connection() as connection:
                insert_audit_log(
                    connection,
                    transaction_id,
                    "OTP_REQUIRED",
                    {
                        "decision": decision,
                        "fraud_probability": event.get(
                            "fraud_probability"
                        ),
                        "model_name": event.get(
                            "model_name"
                        ),
                        "model_version": event.get(
                            "model_version"
                        ),
                        "threshold_otp": event.get(
                            "threshold_otp"
                        ),
                    },
                )
        except Exception as error:
            print(
                f"❌ Erreur audit OTP_REQUIRED "
                f"transaction {transaction_id} : {error}"
            )

        print(
            f"Transaction {transaction_id} "
            f"→ OTP_REQUIRED "
            f"→ attente validation OTP"
        )



# ============================================================
# TRAITEMENT OTP
# ============================================================

def process_otp_event(event):

    transaction_id = event.get("transaction_id")
    validation_status = event.get("status")

    if transaction_id is None:
        print(
            "⚠️ transaction_id manquant "
            "dans l'événement OTP."
        )
        return

    try:

        final_status = determine_final_status(
            validation_status
        )

        source_event = (
            "OTP_VALIDATED"
            if validation_status == "VALIDATED"
            else "OTP_FAILED"
        )

        finalize_transaction(
            transaction_id=transaction_id,
            final_status=final_status,
            source_event=source_event,
            details={
                "otp_status": validation_status,
            },
        )

    except ValueError as error:

        print(
            f"❌ {error}"
        )


# ============================================================
# SERVICE
# ============================================================

print("Transaction Service démarré...")
print(
    f"Lecture décisions : {DECISION_TOPIC}"
)
print(
    f"Lecture OTP       : {OTP_VALIDATED_TOPIC}"
)
print(
    f"Sortie            : {OUTPUT_TOPIC}"
)


try:

    while True:

        # ----------------------------------------------------
        # Lire les décisions
        # ----------------------------------------------------

        decision_records = decision_consumer.poll(
            timeout_ms=500
        )

        for records in decision_records.values():

            for message in records:

                try:

                    event = json.loads(
                        message.value.decode("utf-8")
                    )

                    process_decision_event(event)

                except Exception as error:

                    print(
                        f"❌ Erreur lecture décision : {error}"
                    )

        # ----------------------------------------------------
        # Lire les validations OTP
        # ----------------------------------------------------

        otp_records = otp_consumer.poll(
            timeout_ms=500
        )

        for records in otp_records.values():

            for message in records:

                try:

                    event = json.loads(
                        message.value.decode("utf-8")
                    )

                    process_otp_event(event)

                except Exception as error:

                    print(
                        f"❌ Erreur lecture OTP : {error}"
                    )


except KeyboardInterrupt:

    print(
        "\nTransaction Service arrêté."
    )


finally:

    decision_consumer.close()
    otp_consumer.close()
    producer.close()

    print(
        "✅ Resources Kafka fermées."
    )
# À AJOUTER dans backend/transaction-service/transaction_service.py
#
# Objectif : journaliser OTP_REQUIRED afin que le dashboard dispose
# d'une trace complète du parcours de décision.

# Dans process_decision_event(), remplace le bloc :
#
# elif decision == "OTP_REQUIRED":
#     print(
#         f"Transaction {transaction_id} "
#         f"→ OTP_REQUIRED "
#         f"→ attente validation OTP"
#     )
#
# par :

if decision == "OTP_REQUIRED":

    try:
        with get_postgres_connection() as connection:
            insert_audit_log(
                connection,
                transaction_id,
                "OTP_REQUIRED",
                {
                    "decision": decision,
                    "fraud_probability": event.get(
                        "fraud_probability"
                    ),
                    "model_name": event.get(
                        "model_name"
                    ),
                    "model_version": event.get(
                        "model_version"
                    ),
                    "threshold_otp": event.get(
                        "threshold_otp"
                    ),
                },
            )
    except Exception as error:
        print(
            f"❌ Erreur audit OTP_REQUIRED "
            f"transaction {transaction_id} : {error}"
        )

    print(
        f"Transaction {transaction_id} "
        f"→ OTP_REQUIRED "
        f"→ attente validation OTP"
    )

