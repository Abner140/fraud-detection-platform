import asyncio
import json
import os
import threading
from contextlib import suppress
from datetime import datetime
from decimal import Decimal
from queue import Empty, Queue
from typing import Any

import psycopg
from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from kafka import KafkaAdminClient, KafkaConsumer, KafkaProducer
from pydantic import BaseModel, Field


# ============================================================
# CONFIGURATION
# ============================================================

KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"

TRANSACTIONS_TOPIC = "transactions.received"

REALTIME_TOPICS = [
    "transactions.scored",
    "transactions.decision",
    "transactions.completed",
]

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "fraud_detection",
    "user": "postgres",
    "password": os.getenv("DB_PASSWORD"),
}


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="Fraud Detection Platform API",
    description="API REST et temps réel de la plateforme de détection de fraude",
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
# REALTIME STATE
# ============================================================

realtime_queue: Queue = Queue()

websocket_clients: set[WebSocket] = set()

realtime_stop_event = threading.Event()

realtime_thread = None


# ============================================================
# POSTGRESQL
# ============================================================

def get_db_connection():
    if not DB_CONFIG["password"]:
        raise RuntimeError("La variable d'environnement DB_PASSWORD doit être définie.")

    return psycopg.connect(
        **DB_CONFIG
    )


# ============================================================
# JSON HELPERS
# ============================================================

def json_safe(value):
    """
    Convertit les types PostgreSQL vers des types compatibles JSON.
    """

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, datetime):
        return value.isoformat()

    return value


# ============================================================
# SCHEMAS
# ============================================================

class TransactionCreate(BaseModel):

    account_id: int
    card_id: int
    merchant_id: int
    device_id: int

    transaction_type: str = "PURCHASE"

    amount: float = Field(
        gt=0
    )

    currency: str = "XOF"

    country: str

    ip_address: str

    use_chip: str = "Online Transaction"

    mcc: int

    zip: int | None = None

    errors: str = "No Error"


# ============================================================
# REALTIME KAFKA WORKER
# ============================================================

def classify_realtime_event(
    topic: str,
    data: dict,
) -> str:
    """
    Transforme un événement Kafka en type compréhensible
    par le dashboard React.
    """

    if (
        topic == "transactions.scored"
        and data.get("decision") == "OTP_REQUIRED"
    ):
        return "POTENTIAL_FRAUD"

    if (
        topic == "transactions.decision"
        and data.get("decision") == "OTP_REQUIRED"
    ):
        return "POTENTIAL_FRAUD"

    if (
        topic == "transactions.completed"
        and data.get("source") == "OTP_FAILED"
    ):
        return "OTP_FAILED"

    if (
        topic == "transactions.completed"
        and data.get("source") == "OTP_VALIDATED"
    ):
        return "OTP_VALIDATED"

    if (
        topic == "transactions.completed"
        and data.get("final_status") == "APPROVED"
    ):
        return "TRANSACTION_APPROVED"

    if (
        topic == "transactions.completed"
        and data.get("final_status") == "CANCELLED"
    ):
        return "TRANSACTION_CANCELLED"

    return "KAFKA_EVENT"


def kafka_realtime_worker():
    """
    Consomme Kafka et place les événements dans une queue
    destinée au broadcaster WebSocket.
    """

    consumer = KafkaConsumer(
        *REALTIME_TOPICS,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        auto_offset_reset="latest",
        enable_auto_commit=True,
        group_id="fraud-api-realtime-debug-v2",
        value_deserializer=lambda value: json.loads(
            value.decode("utf-8")
        ),
    )

    print(
        "✅ Realtime Kafka consumer démarré."
    )

    try:

        while not realtime_stop_event.is_set():

            records = consumer.poll(
                timeout_ms=500
            )

            for _, messages in records.items():

                for message in messages:

                    data = message.value

                    print(
                        "\n📩 ÉVÉNEMENT KAFKA REÇU",
                        flush=True
                    )

                    print(
                        f"Topic      : {message.topic}",
                        flush=True
                    )

                    print(
                        f"Partition  : {message.partition}",
                        flush=True
                    )

                    print(
                        f"Offset     : {message.offset}",
                        flush=True
                    )

                    print(
                        f"Data       : {data}",
                        flush=True
                    )

                    event_type = classify_realtime_event(
                        message.topic,
                        data,
                    )

                    print(
                        f"Event type : {event_type}",
                        flush=True
                    )

                    realtime_event = {
                        "event_type": event_type,
                        "topic": message.topic,
                        "partition": message.partition,
                        "offset": message.offset,
                        "received_at": datetime.now().isoformat(),
                        "data": data,
                    }

                    realtime_queue.put(
                        realtime_event
                    )

                    print(
                        "✅ Événement placé dans la queue WebSocket",
                        flush=True
                    )

    except Exception as error:

        print(
            f"❌ Realtime Kafka consumer : {error}"
        )

    finally:

        consumer.close()

        print(
            "✅ Realtime Kafka consumer arrêté."
        )


# ============================================================
# WEBSOCKET BROADCASTER
# ============================================================

async def realtime_broadcaster():
    """
    Diffuse les événements Kafka à tous les dashboards
    connectés en WebSocket.
    """

    while True:

        try:

            event = realtime_queue.get_nowait()

        except Empty:

            await asyncio.sleep(0.2)
            continue

        disconnected = []

        for websocket in list(
            websocket_clients
        ):

            try:

                await websocket.send_json(
                    event
                )

            except Exception:

                disconnected.append(
                    websocket
                )

        for websocket in disconnected:

            websocket_clients.discard(
                websocket
            )


# ============================================================
# FASTAPI STARTUP
# ============================================================

@app.on_event("startup")
async def start_realtime_services():

    global realtime_thread

    realtime_stop_event.clear()

    realtime_thread = threading.Thread(
        target=kafka_realtime_worker,
        daemon=True,
        name="kafka-realtime-worker",
    )

    realtime_thread.start()

    app.state.realtime_task = asyncio.create_task(
        realtime_broadcaster()
    )

    print(
        "✅ Services temps réel démarrés."
    )


# ============================================================
# FASTAPI SHUTDOWN
# ============================================================

@app.on_event("shutdown")
async def stop_realtime_services():

    realtime_stop_event.set()

    task = getattr(
        app.state,
        "realtime_task",
        None,
    )

    if task:

        task.cancel()

        with suppress(
            asyncio.CancelledError
        ):
            await task

    if realtime_thread:

        realtime_thread.join(
            timeout=3
        )

    producer.close()

    print(
        "✅ Services temps réel arrêtés."
    )


# ============================================================
# WEBSOCKET ENDPOINT
# ============================================================

@app.websocket("/ws/events")
async def websocket_events(
    websocket: WebSocket,
):

    await websocket.accept()

    websocket_clients.add(
        websocket
    )

    print(
        "🔵 Dashboard WebSocket connecté."
    )

    await websocket.send_json(
        {
            "event_type": "CONNECTED",
            "message": "Realtime connection established.",
            "received_at": datetime.now().isoformat(),
        }
    )

    try:

        while True:

            # Maintient la connexion active.
            # Le frontend peut envoyer un ping texte.
            await websocket.receive_text()

    except WebSocketDisconnect:

        websocket_clients.discard(
            websocket
        )

        print(
            "⚪ Dashboard WebSocket déconnecté."
        )

    except Exception:

        websocket_clients.discard(
            websocket
        )


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health_check():

    postgres_status = "DOWN"
    kafka_status = "DOWN"

    # --------------------------------------------------------
    # PostgreSQL
    # --------------------------------------------------------

    try:

        with get_db_connection() as connection:

            with connection.cursor() as cursor:

                cursor.execute(
                    "SELECT 1;"
                )

                cursor.fetchone()

        postgres_status = "UP"

    except Exception as error:

        print(
            f"PostgreSQL health error : {error}"
        )

    # --------------------------------------------------------
    # Kafka
    # --------------------------------------------------------

    admin_client = None

    try:

        admin_client = KafkaAdminClient(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            request_timeout_ms=3000,
        )

        admin_client.list_topics()

        kafka_status = "UP"

    except Exception as error:

        print(
            f"Kafka health error : {error}"
        )

    finally:

        if admin_client is not None:

            admin_client.close()

    # --------------------------------------------------------
    # GLOBAL STATUS
    # --------------------------------------------------------

    overall_status = (
        "UP"
        if (
            postgres_status == "UP"
            and kafka_status == "UP"
        )
        else "DEGRADED"
    )

    return {
        "service": "fraud-detection-api",
        "status": overall_status,
        "postgresql": postgres_status,
        "kafka": kafka_status,
        "version": "1.0.0",
    }


# ============================================================
# GET TRANSACTION
# ============================================================

@app.get("/transactions/{transaction_id}")
def get_transaction(
    transaction_id: int,
):

    with get_db_connection() as connection:

        with connection.cursor() as cursor:

            cursor.execute(
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
                    ip_address,
                    timestamp,
                    status,
                    use_chip,
                    mcc,
                    zip,
                    errors
                FROM transactions
                WHERE transaction_id = %s;
                """,
                (transaction_id,),
            )

            row = cursor.fetchone()

            if row is None:

                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"Transaction "
                        f"{transaction_id} "
                        f"introuvable."
                    ),
                )

            columns = [
                "transaction_id",
                "account_id",
                "card_id",
                "merchant_id",
                "device_id",
                "transaction_type",
                "amount",
                "currency",
                "country",
                "ip_address",
                "timestamp",
                "status",
                "use_chip",
                "mcc",
                "zip",
                "errors",
            ]

            result = dict(
                zip(
                    columns,
                    row,
                )
            )

    return {
        key: json_safe(value)
        for key, value in result.items()
    }


# ============================================================
# GET TRANSACTION STATUS
# ============================================================

@app.get(
    "/transactions/{transaction_id}/status"
)
def get_transaction_status(
    transaction_id: int,
):

    with get_db_connection() as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    transaction_id,
                    status
                FROM transactions
                WHERE transaction_id = %s;
                """,
                (transaction_id,),
            )

            row = cursor.fetchone()

            if row is None:

                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"Transaction "
                        f"{transaction_id} "
                        f"introuvable."
                    ),
                )

    return {
        "transaction_id": row[0],
        "status": row[1],
    }


# ============================================================
# GET AUDIT LOGS
# ============================================================

@app.get(
    "/transactions/{transaction_id}/audit"
)
def get_transaction_audit(
    transaction_id: int,
):

    with get_db_connection() as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    audit_id,
                    transaction_id,
                    event_type,
                    service,
                    timestamp,
                    details
                FROM audit_logs
                WHERE transaction_id = %s
                ORDER BY timestamp;
                """,
                (transaction_id,),
            )

            rows = cursor.fetchall()

            if not rows:

                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"Aucun audit trouvé "
                        f"pour la transaction "
                        f"{transaction_id}."
                    ),
                )

            columns = [
                "audit_id",
                "transaction_id",
                "event_type",
                "service",
                "timestamp",
                "details",
            ]

            result = []

            for row in rows:

                item = dict(
                    zip(
                        columns,
                        row,
                    )
                )

                result.append(
                    {
                        key: json_safe(value)
                        for key, value
                        in item.items()
                    }
                )

    return {
        "transaction_id": transaction_id,
        "events": result,
    }


# ============================================================
# CREATE TRANSACTION
# ============================================================

@app.post("/transactions")
def create_transaction(
    transaction: TransactionCreate,
):

    try:

        with get_db_connection() as connection:

            with connection.cursor() as cursor:

                cursor.execute(
                    """
                    INSERT INTO transactions (
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
                        status,
                        use_chip,
                        mcc,
                        zip,
                        errors
                    )
                    VALUES (
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        NOW(),
                        'PENDING',
                        %s,
                        %s,
                        %s,
                        %s
                    )
                    RETURNING
                        transaction_id,
                        timestamp;
                    """,
                    (
                        transaction.account_id,
                        transaction.card_id,
                        transaction.merchant_id,
                        transaction.device_id,
                        transaction.transaction_type,
                        transaction.amount,
                        transaction.currency,
                        transaction.country,
                        transaction.ip_address,
                        transaction.use_chip,
                        transaction.mcc,
                        transaction.zip,
                        transaction.errors,
                    ),
                )

                row = cursor.fetchone()

            transaction_id = row[0]

            created_at = row[1]

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                f"Erreur PostgreSQL : {error}"
            ),
        )


    # ========================================================
    # KAFKA MESSAGE
    # ========================================================

    kafka_transaction = {
        "transaction_id": transaction_id,
        "account_id": transaction.account_id,
        "card_id": transaction.card_id,
        "merchant_id": transaction.merchant_id,
        "device_id": transaction.device_id,
        "transaction_type": transaction.transaction_type,
        "amount": transaction.amount,
        "currency": transaction.currency,
        "country": transaction.country,
        "ip_address": transaction.ip_address,
        "timestamp": (
            created_at.isoformat()
            if created_at
            else None
        ),
        "use_chip": transaction.use_chip,
        "mcc": transaction.mcc,
        "zip": transaction.zip,
        "errors": transaction.errors,
    }


    # ========================================================
    # PUBLISH KAFKA
    # ========================================================

    try:

        future = producer.send(
            TRANSACTIONS_TOPIC,
            value=kafka_transaction,
        )

        metadata = future.get(
            timeout=10
        )

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Transaction créée dans PostgreSQL "
                "mais publication Kafka échouée : "
                f"{error}"
            ),
        )


    return {
        "message": "Transaction créée et publiée.",
        "transaction_id": transaction_id,
        "status": "PENDING",
        "topic": metadata.topic,
        "partition": metadata.partition,
        "offset": metadata.offset,
    }


# ============================================================
# DASHBOARD SUMMARY
# ============================================================

@app.get(
    "/dashboard/summary"
)
def dashboard_summary(
    days: int = Query(
        7,
        ge=1,
        le=365,
    ),
):

    with get_db_connection() as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                WITH risk_events AS (

                    SELECT DISTINCT ON (transaction_id)

                        transaction_id,

                        (
                            details
                            ->> 'fraud_probability'
                        )::double precision
                            AS fraud_probability,

                        details
                            ->> 'model_version'
                            AS model_version,

                        (
                            details
                            ->> 'threshold_otp'
                        )::double precision
                            AS threshold_otp

                    FROM audit_logs

                    WHERE event_type IN (
                        'DECISION_APPROVED',
                        'OTP_REQUIRED'
                    )

                    AND timestamp >=
                        NOW()
                        - (
                            %s *
                            INTERVAL '1 day'
                        )

                    AND details
                        ->> 'fraud_probability'
                        IS NOT NULL

                    ORDER BY
                        transaction_id,
                        timestamp DESC
                )

                SELECT

                    COUNT(*)
                        AS total_transactions,

                    COUNT(*)
                        FILTER (
                            WHERE t.status = 'APPROVED'
                        )
                        AS approved,

                    COUNT(*)
                        FILTER (
                            WHERE t.status = 'CANCELLED'
                        )
                        AS cancelled,

                    COUNT(*)
                        FILTER (
                            WHERE t.status = 'PENDING'
                        )
                        AS pending,

                    COUNT(*)
                        FILTER (
                            WHERE EXISTS (
                                SELECT 1
                                FROM audit_logs a
                                WHERE
                                    a.transaction_id
                                    =
                                    t.transaction_id

                                AND a.event_type
                                    =
                                    'OTP_REQUIRED'
                            )
                        )
                        AS otp_required,

                    AVG(
                        r.fraud_probability
                    )
                        AS avg_fraud_probability,

                    MAX(
                        r.fraud_probability
                    )
                        AS max_fraud_probability,

                    COUNT(*)
                        FILTER (
                            WHERE
                                r.fraud_probability
                                >= 0.30
                        )
                        AS high_risk,

                    MAX(
                        r.model_version
                    )
                        AS model_version,

                    MAX(
                        r.threshold_otp
                    )
                        AS threshold_otp

                FROM transactions t

                LEFT JOIN risk_events r
                    ON
                        r.transaction_id
                        =
                        t.transaction_id

                WHERE
                    t.timestamp >=
                    NOW()
                    - (
                        %s *
                        INTERVAL '1 day'
                    );
                """,
                (
                    days,
                    days,
                ),
            )

            row = cursor.fetchone()

    keys = [
        "total_transactions",
        "approved",
        "cancelled",
        "pending",
        "otp_required",
        "avg_fraud_probability",
        "max_fraud_probability",
        "high_risk",
        "model_version",
        "threshold_otp",
    ]

    result = dict(
        zip(
            keys,
            row,
        )
    )

    for key in [
        "avg_fraud_probability",
        "max_fraud_probability",
        "threshold_otp",
    ]:

        if result[key] is not None:

            result[key] = float(
                result[key]
            )

    return result


# ============================================================
# DASHBOARD TREND
# ============================================================

@app.get(
    "/dashboard/trend"
)
def dashboard_trend(
    days: int = Query(
        7,
        ge=1,
        le=365,
    ),
):

    with get_db_connection() as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                WITH risk_events AS (

                    SELECT DISTINCT ON (transaction_id)

                        transaction_id,

                        (
                            details
                            ->> 'fraud_probability'
                        )::double precision
                            AS fraud_probability

                    FROM audit_logs

                    WHERE event_type IN (
                        'DECISION_APPROVED',
                        'OTP_REQUIRED'
                    )

                    AND details
                        ->> 'fraud_probability'
                        IS NOT NULL

                    ORDER BY
                        transaction_id,
                        timestamp DESC
                )

                SELECT

                    DATE(
                        t.timestamp
                    )
                        AS day,

                    COUNT(*)
                        AS total,

                    COUNT(*)
                        FILTER (
                            WHERE t.status = 'APPROVED'
                        )
                        AS approved,

                    COUNT(*)
                        FILTER (
                            WHERE t.status = 'CANCELLED'
                        )
                        AS cancelled,

                    COUNT(*)
                        FILTER (
                            WHERE
                                r.fraud_probability
                                >= 0.30
                        )
                        AS high_risk,

                    AVG(
                        r.fraud_probability
                    )
                        AS avg_fraud_probability

                FROM transactions t

                LEFT JOIN risk_events r
                    ON
                        r.transaction_id
                        =
                        t.transaction_id

                WHERE
                    t.timestamp >=
                    NOW()
                    - (
                        %s *
                        INTERVAL '1 day'
                    )

                GROUP BY
                    DATE(t.timestamp)

                ORDER BY day;
                """,
                (days,),
            )

            rows = cursor.fetchall()

    data = []

    for row in rows:

        data.append(
            {
                "date": row[0].isoformat(),
                "total": int(row[1]),
                "approved": int(row[2]),
                "cancelled": int(row[3]),
                "high_risk": int(row[4]),
                "avg_fraud_probability": (
                    float(row[5])
                    if row[5] is not None
                    else None
                ),
            }
        )

    return {
        "data": data
    }


# ============================================================
# DASHBOARD TRANSACTIONS
# ============================================================

@app.get(
    "/dashboard/transactions"
)
def dashboard_transactions(
    days: int = Query(
        7,
        ge=1,
        le=365,
    ),

    limit: int = Query(
        100,
        ge=1,
        le=500,
    ),

    status: str = Query(
        "ALL"
    ),
):

    allowed_statuses = {
        "ALL",
        "PENDING",
        "APPROVED",
        "CANCELLED",
    }

    if status not in allowed_statuses:

        raise HTTPException(
            status_code=400,
            detail=(
                f"Statut invalide : "
                f"{status}"
            ),
        )

    with get_db_connection() as connection:

        with connection.cursor() as cursor:

            params: list[Any] = [
                days
            ]

            where_status = ""

            if status != "ALL":

                where_status = (
                    "AND t.status = %s"
                )

                params.append(
                    status
                )

            params.append(
                limit
            )

            query = f"""
                WITH risk_events AS (

                    SELECT DISTINCT ON (transaction_id)

                        transaction_id,

                        (
                            details
                            ->> 'fraud_probability'
                        )::double precision
                            AS fraud_probability,

                        details
                            ->> 'model_version'
                            AS model_version,

                        details
                            ->> 'decision'
                            AS decision,

                        timestamp
                            AS risk_timestamp

                    FROM audit_logs

                    WHERE event_type IN (
                        'DECISION_APPROVED',
                        'OTP_REQUIRED'
                    )

                    AND details
                        ->> 'fraud_probability'
                        IS NOT NULL

                    ORDER BY
                        transaction_id,
                        timestamp DESC
                )

                SELECT

                    t.transaction_id,

                    t.amount,

                    t.currency,

                    t.country,

                    t.timestamp,

                    t.status,

                    r.fraud_probability,

                    CASE

                        WHEN
                            r.decision
                            IS NOT NULL
                        THEN
                            r.decision

                        WHEN EXISTS (

                            SELECT 1

                            FROM audit_logs a

                            WHERE
                                a.transaction_id
                                =
                                t.transaction_id

                            AND a.event_type
                                =
                                'OTP_REQUIRED'

                        )

                        THEN
                            'OTP_REQUIRED'

                        ELSE
                            NULL

                    END
                        AS last_decision,

                    r.model_version

                FROM transactions t

                LEFT JOIN risk_events r

                    ON
                        r.transaction_id
                        =
                        t.transaction_id

                WHERE

                    t.timestamp >=
                    NOW()
                    - (
                        %s *
                        INTERVAL '1 day'
                    )

                    {where_status}

                ORDER BY
                    t.timestamp DESC

                LIMIT %s;
            """

            cursor.execute(
                query,
                params,
            )

            rows = cursor.fetchall()

    data = []

    for row in rows:

        data.append(
            {
                "transaction_id": row[0],

                "amount": float(
                    row[1]
                ),

                "currency": row[2],

                "country": row[3],

                "timestamp": row[4].isoformat(),

                "status": row[5],

                "fraud_probability": (
                    float(row[6])
                    if row[6] is not None
                    else None
                ),

                "last_decision": row[7],

                "model_version": row[8],
            }
        )

    return {
        "data": data
    }