import json
import secrets

import redis
from kafka import KafkaConsumer, KafkaProducer


# ============================================================
# CONFIGURATION
# ============================================================

KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"

INPUT_TOPIC = "transactions.decision"
OTP_REQUESTED_TOPIC = "transactions.otp.requested"
OTP_VALIDATED_TOPIC = "transactions.otp.validated"

REDIS_HOST = "localhost"
REDIS_PORT = 6379

OTP_LENGTH = 6

# Durée pendant laquelle l'OTP est utilisable
OTP_TTL_SECONDS = 60

# Durée pendant laquelle nous conservons l'état de la transaction
# pour éviter de régénérer un OTP à cause d'un doublon Kafka.
STATE_TTL_SECONDS = 24 * 60 * 60


# ============================================================
# REDIS
# ============================================================

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    decode_responses=True
)


# ============================================================
# KAFKA CONSUMER
# ============================================================

consumer = KafkaConsumer(
    INPUT_TOPIC,
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    auto_offset_reset="earliest",
    enable_auto_commit=True,
    group_id="otp-service-v2"
)


# ============================================================
# KAFKA PRODUCER
# ============================================================

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    value_serializer=lambda value: json.dumps(
        value
    ).encode("utf-8")
)


# ============================================================
# GENERATION OTP
# ============================================================

def generate_otp():
    """
    Génère un OTP numérique à 6 chiffres.
    """

    return "".join(
        str(secrets.randbelow(10))
        for _ in range(OTP_LENGTH)
    )


# ============================================================
# CLES REDIS
# ============================================================

def get_otp_key(transaction_id):
    return f"otp:transaction:{transaction_id}"


def get_state_key(transaction_id):
    return f"otp:state:{transaction_id}"


# ============================================================
# CREATION OTP
# ============================================================

def create_otp(transaction_id):
    """
    Crée un OTP uniquement si aucun workflow OTP
    n'est déjà actif pour la transaction.

    Retourne :
        otp      -> nouvel OTP créé
        None     -> transaction déjà traitée
    """

    otp_key = get_otp_key(transaction_id)
    state_key = get_state_key(transaction_id)

    # --------------------------------------------------------
    # Réserver la transaction.
    #
    # NX = création uniquement si la clé n'existe pas.
    # Cela garantit qu'un doublon Kafka ne génère pas
    # plusieurs OTP pour la même transaction.
    # --------------------------------------------------------

    created = redis_client.set(
        state_key,
        "PENDING",
        ex=STATE_TTL_SECONDS,
        nx=True
    )

    if not created:
        return None

    # --------------------------------------------------------
    # Générer et stocker l'OTP
    # --------------------------------------------------------

    otp = generate_otp()

    redis_client.set(
        otp_key,
        otp,
        ex=OTP_TTL_SECONDS
    )

    return otp


# ============================================================
# VALIDATION OTP
# ============================================================

def validate_otp(transaction_id, submitted_otp):
    """
    Vérifie l'OTP soumis par le client.

    Retourne :
        VALIDATED -> OTP correct
        FAILED    -> OTP incorrect ou expiré
    """

    otp_key = get_otp_key(transaction_id)
    state_key = get_state_key(transaction_id)

    stored_otp = redis_client.get(otp_key)

    # --------------------------------------------------------
    # OTP absent = expiré ou inexistant
    # --------------------------------------------------------

    if stored_otp is None:
        return "FAILED"

    # --------------------------------------------------------
    # Vérification
    # --------------------------------------------------------

    if stored_otp != submitted_otp:
        return "FAILED"

    # --------------------------------------------------------
    # OTP correct
    # --------------------------------------------------------

    redis_client.delete(otp_key)

    redis_client.set(
        state_key,
        "VALIDATED",
        ex=STATE_TTL_SECONDS
    )

    return "VALIDATED"


# ============================================================
# PUBLICATION EVENEMENT
# ============================================================

def publish_event(topic, transaction_id, event):
    """
    Publie un événement Kafka.
    """

    producer.send(
        topic,
        key=str(transaction_id).encode("utf-8"),
        value=event
    )

    producer.flush()


# ============================================================
# TRAITEMENT
# ============================================================

print("OTP Service démarré...")
print(f"Lecture : {INPUT_TOPIC}")
print(f"Demande OTP : {OTP_REQUESTED_TOPIC}")
print(f"Validation : {OTP_VALIDATED_TOPIC}")


try:

    for message in consumer:

        # ----------------------------------------------------
        # Décodage manuel du message
        # ----------------------------------------------------

        transaction = json.loads(
            message.value.decode("utf-8")
        )

        transaction_id = transaction.get(
            "transaction_id"
        )

        decision = transaction.get(
            "decision"
        )

        if transaction_id is None:
            print("Message ignoré : transaction_id absent.")
            continue

        # ----------------------------------------------------
        # Seules les transactions OTP_REQUIRED sont traitées
        # ----------------------------------------------------

        if decision != "OTP_REQUIRED":
            continue

        # ----------------------------------------------------
        # Création idempotente de l'OTP
        # ----------------------------------------------------

        otp = create_otp(transaction_id)

        # ----------------------------------------------------
        # Doublon Kafka
        # ----------------------------------------------------

        if otp is None:

            print(
                f"Transaction {transaction_id} : "
                f"OTP déjà créé ou transaction déjà traitée. "
                f"Événement ignoré."
            )

            continue

        # ----------------------------------------------------
        # Publication demande OTP
        # ----------------------------------------------------

        otp_request_event = {
            "transaction_id": transaction_id,
            "channel": "SMS",
            "status": "PENDING",
            "expires_in_seconds": OTP_TTL_SECONDS
        }

        publish_event(
            OTP_REQUESTED_TOPIC,
            transaction_id,
            otp_request_event
        )

        # ----------------------------------------------------
        # MODE DEVELOPPEMENT UNIQUEMENT
        # ----------------------------------------------------
        # En production, cet OTP sera transmis via SMS,
        # email ou push et ne sera jamais écrit dans les logs.
        # ----------------------------------------------------

        print()
        print(f"Transaction {transaction_id}")
        print(f"OTP généré : {otp}")
        print(f"Expiration : {OTP_TTL_SECONDS} secondes")

        # ----------------------------------------------------
        # Saisie OTP - test local
        # ----------------------------------------------------

        submitted_otp = input(
            "Entrez l'OTP pour cette transaction : "
        ).strip()

        # ----------------------------------------------------
        # Validation
        # ----------------------------------------------------

        validation_status = validate_otp(
            transaction_id,
            submitted_otp
        )

        # ----------------------------------------------------
        # Publication validation
        # ----------------------------------------------------

        validation_event = {
            "transaction_id": transaction_id,
            "status": validation_status
        }

        publish_event(
            OTP_VALIDATED_TOPIC,
            transaction_id,
            validation_event
        )

        # ----------------------------------------------------
        # Log
        # ----------------------------------------------------

        print(
            f"Transaction {transaction_id} "
            f"→ OTP {validation_status}"
        )


except KeyboardInterrupt:

    print("\nOTP Service arrêté.")


finally:

    consumer.close()
    producer.close()