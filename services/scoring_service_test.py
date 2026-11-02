from pathlib import Path

import joblib
from xgboost import XGBClassifier


# ============================================================
# CHEMINS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "fraud-scoring-service" / "models"

MODEL_PATH = MODEL_DIR / "xgboost_fraud_model_v1.json"
ENCODER_PATH = MODEL_DIR / "categorical_encoder.joblib"
FEATURE_NAMES_PATH = MODEL_DIR / "feature_names.joblib"
METADATA_PATH = MODEL_DIR / "model_metadata.joblib"


# ============================================================
# TEST DE CHARGEMENT
# ============================================================

print("=== TEST DU SERVICE ===")

print("BASE_DIR :", BASE_DIR)
print("MODEL_DIR:", MODEL_DIR)

print("\nChargement du modÃ¨le...")

model = XGBClassifier()
model.load_model(MODEL_PATH)

print("âœ… ModÃ¨le chargÃ©.")
print("\nChargement de l'encodeur...")

encoder = joblib.load(ENCODER_PATH)

print("âœ… Encodeur chargÃ©.")
print("\n=== CATÃ‰GORIES APPRISES PAR L'ENCODEUR ===")

for feature, categories in zip(
    encoder.feature_names_in_,
    encoder.categories_
):
    print(f"\n{feature}:")
    print(list(categories))

print("\nChargement des feature names...")

feature_names = joblib.load(FEATURE_NAMES_PATH)

print(
    f"âœ… Feature names chargÃ©s : {len(feature_names)}"
)

print("\nChargement des mÃ©tadonnÃ©es...")

metadata = joblib.load(METADATA_PATH)

print("âœ… MÃ©tadonnÃ©es chargÃ©es.")

print("\n=== RÃ‰SUMÃ‰ ===")
print("Version modÃ¨le :", metadata["model_version"])
print("Features       :", metadata["feature_count"])
print("Seuil OTP      :", metadata["threshold_otp"])

print("\nâœ… SERVICE INITIALISÃ‰ AVEC SUCCÃˆS.")
import math
import numpy as np
import pandas as pd
import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "fraud_detection",
    "user": "postgres",
    "password": "Abner@2005"
}

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG)

print("Test connexion PostgreSQL...")
conn = get_db_connection()
print("Connexion PostgreSQL rÃ©ussie !")
conn.close()

def enrich_transaction(transaction):
    """
    Enrichit une transaction Kafka avec les donnÃ©es PostgreSQL
    nÃ©cessaires au modÃ¨le de dÃ©tection de fraude.
    """

    conn = get_db_connection()

    try:
        cur = conn.cursor()

        transaction_id = transaction["transaction_id"]

        # ============================================================
        # 1. DONNÃ‰ES STATIQUES CLIENT / CARTE / MARCHAND
        # ============================================================
        query_static = """
        SELECT
            a.client_id,

            c.current_age,
            c.yearly_income AS yearly_income_numeric,
            c.total_debt AS total_debt_numeric,
            c.credit_score,
            c.num_credit_cards,

            cd.card_brand,
            cd.card_type,
            cd.has_chip,
            cd.credit_limit AS credit_limit_numeric,

            m.merchant_state

        FROM transactions t

        JOIN accounts a
            ON a.account_id = t.account_id

        JOIN clients c
            ON c.client_id = a.client_id

        JOIN cards cd
            ON cd.card_id = t.card_id

        JOIN merchants m
            ON m.merchant_id = t.merchant_id

        WHERE t.transaction_id = %s
        """

        cur.execute(query_static, (transaction_id,))
        row = cur.fetchone()

        if row is None:
            raise ValueError(
                f"Transaction {transaction_id} introuvable en base."
            )

        columns = [
            "client_id",
            "current_age",
            "yearly_income_numeric",
            "total_debt_numeric",
            "credit_score",
            "num_credit_cards",
            "card_brand",
            "card_type",
            "has_chip",
            "credit_limit_numeric",
            "merchant_state",
        ]

        enriched_data = dict(zip(columns, row))

        # ============================================================
        # 2. RÃ‰CUPÃ‰RATION DES INFORMATIONS DE LA TRANSACTION
        # ============================================================
        query_transaction = """
           SELECT
            a.client_id,
            t.account_id,
            t.card_id,
            t.merchant_id,
            t.amount,
            t.timestamp,
            t.use_chip,
            t.mcc,
            t.zip,
            t.errors
            FROM transactions t
            JOIN accounts a
                ON a.account_id = t.account_id
            WHERE t.transaction_id = %s
            """

        cur.execute(query_transaction, (transaction_id,))
        tx_row = cur.fetchone()

        if tx_row is None:
            raise ValueError(
                f"Transaction {transaction_id} introuvable."
            )

        (
            client_id,
            account_id,
            card_id,
            merchant_id,
            current_amount,
            current_timestamp,
            use_chip,
            mcc,
            zip_code,
            errors,
            
        ) = tx_row

        # ============================================================
        # 3. TRANSACTION PRÃ‰CÃ‰DENTE DU CLIENT
        # ============================================================
        query_previous = """
        SELECT
            amount,
            timestamp
        FROM transactions
        WHERE account_id = %s
          AND timestamp < %s
        ORDER BY timestamp DESC
        LIMIT 1
        """

        cur.execute(
            query_previous,
            (account_id, current_timestamp)
        )

        previous_row = cur.fetchone()

        if previous_row is None:
            previous_amount = None
            time_since_previous_transaction = None
        else:
            previous_amount = previous_row[0]

            previous_timestamp = previous_row[1]

            time_since_previous_transaction = (
                current_timestamp - previous_timestamp
            ).total_seconds()

        # ============================================================
        # 4. STATISTIQUES CLIENT - 1 HEURE / 24 HEURES
        # ============================================================
        query_client_windows = """
        SELECT
            COUNT(*) FILTER (
                WHERE timestamp >= %s - INTERVAL '1 hour'
            ) AS client_transaction_count_1h,

            COUNT(*) AS client_transaction_count_24h,

            COALESCE(SUM(amount), 0) AS client_amount_24h,

            COALESCE(SUM(ABS(amount)), 0)
                AS client_absolute_amount_24h

        FROM transactions
        WHERE account_id = %s
          AND timestamp < %s
          AND timestamp >= %s - INTERVAL '24 hours'
        """

        cur.execute(
            query_client_windows,
            (
                current_timestamp,
                account_id,
                current_timestamp,
                current_timestamp,
            )
        )

        client_row = cur.fetchone()

        client_transaction_count_1h = client_row[0]
        client_transaction_count_24h = client_row[1]
        client_amount_24h = client_row[2]
        client_absolute_amount_24h = client_row[3]

        # ============================================================
        # 5. STATISTIQUES CARTE - 24 HEURES
        # ============================================================
        query_card_windows = """
        SELECT
            COUNT(*) AS card_transaction_count_24h,
            COALESCE(SUM(amount), 0) AS card_amount_24h
        FROM transactions
        WHERE card_id = %s
          AND timestamp < %s
          AND timestamp >= %s - INTERVAL '24 hours'
        """

        cur.execute(
            query_card_windows,
            (
                card_id,
                current_timestamp,
                current_timestamp,
            )
        )

        card_row = cur.fetchone()

        card_transaction_count_24h = card_row[0]
        card_amount_24h = card_row[1]

        # ============================================================
        # 6. STATISTIQUES MARCHAND - 24 HEURES
        # ============================================================
        query_merchant_windows = """
        SELECT
            COUNT(*) AS merchant_transaction_count_24h,
            COALESCE(SUM(amount), 0) AS merchant_amount_24h
        FROM transactions
        WHERE merchant_id = %s
          AND timestamp < %s
          AND timestamp >= %s - INTERVAL '24 hours'
        """

        cur.execute(
            query_merchant_windows,
            (
                merchant_id,
                current_timestamp,
                current_timestamp,
            )
        )

        merchant_row = cur.fetchone()

        merchant_transaction_count_24h = merchant_row[0]
        merchant_amount_24h = merchant_row[1]

        # ============================================================
        # 7. MOYENNE HISTORIQUE DU CLIENT
        # ============================================================
        query_client_avg = """
        SELECT
            AVG(amount)
        FROM transactions
        WHERE account_id = %s
          AND timestamp < %s
        """

        cur.execute(
            query_client_avg,
            (
                account_id,
                current_timestamp,
            )
        )

        avg_row = cur.fetchone()
        client_previous_avg_amount = avg_row[0]

        # ============================================================
        # 8. CONSTRUCTION DU DICTIONNAIRE FINAL
        # ============================================================
        enriched_transaction = {
            **transaction,
            **enriched_data,

            "amount": current_amount,
            "timestamp": current_timestamp,

            "use_chip": use_chip,
            "mcc": mcc,
            "zip": zip_code,
            "errors": errors,

            "previous_amount": previous_amount,
            "time_since_previous_transaction": (
                time_since_previous_transaction
                if time_since_previous_transaction is not None
                else -1
            ),

            "client_transaction_count_1h": client_transaction_count_1h,
            "client_transaction_count_24h": client_transaction_count_24h,
            "client_amount_24h": client_amount_24h,
            "client_absolute_amount_24h": client_absolute_amount_24h,

            "card_transaction_count_24h": card_transaction_count_24h,
            "card_amount_24h": card_amount_24h,

            "merchant_transaction_count_24h":
                merchant_transaction_count_24h,
            "merchant_amount_24h":
                merchant_amount_24h,

            "client_previous_avg_amount":
                client_previous_avg_amount,
        }

        # ============================================================
        # 9. VARIABLES DÃ‰RIVÃ‰ES DU MONTANT
        # ============================================================
        if previous_amount is not None:
            enriched_transaction["amount_difference"] = (
                current_amount - previous_amount
            )

            if previous_amount != 0:
                enriched_transaction["amount_change_ratio"] = (
                    abs(current_amount - previous_amount)
                    / abs(previous_amount)
                )
            else:
                enriched_transaction["amount_change_ratio"] = 0
        else:
            enriched_transaction["amount_difference"] = 0
            enriched_transaction["amount_change_ratio"] = 0

        if (
            client_previous_avg_amount is not None
            and client_previous_avg_amount != 0
        ):
            enriched_transaction["amount_deviation_from_client"] = (
                abs(current_amount - client_previous_avg_amount)
                / abs(client_previous_avg_amount)
            )
        else:
            enriched_transaction["amount_deviation_from_client"] = 0

        return enriched_transaction

    finally:
        conn.close()

def signed_log1p(value):
    """sign(x) * log(1 + |x|)."""
    if value is None or pd.isna(value):
        return np.nan

    value = float(value)
    return np.sign(value) * np.log1p(abs(value))


def safe_log1p(value):
    """log(1 + x) pour x >= 0, sinon NaN."""
    if value is None or pd.isna(value):
        return np.nan

    value = float(value)

    if value < 0:
        return np.nan

    return np.log1p(value)


def build_model_features(data):
    """
    Construit exactement les features numÃ©riques utilisÃ©es
    par le modÃ¨le Ã  partir d'une transaction enrichie.

    Les valeurs comportementales doivent dÃ©jÃ  avoir Ã©tÃ©
    calculÃ©es par la couche d'enrichissement.
    """

    row = pd.DataFrame([data])

    # =========================================================
    # 1. Conversion des types de base
    # =========================================================

    numeric_base = [
        "amount_numeric",
        "current_age",
        "yearly_income_numeric",
        "total_debt_numeric",
        "credit_score",
        "num_credit_cards",
        "credit_limit_numeric",
        "previous_amount",
        "time_since_previous_transaction",
        "amount_difference",
        "amount_change_ratio",
        "client_previous_avg_amount",
        "amount_deviation_from_client",
        "client_transaction_count_1h",
        "client_transaction_count_24h",
        "client_amount_24h",
        "amount_abs",
        "client_absolute_amount_24h",
        "card_transaction_count_24h",
        "card_amount_24h",
        "merchant_transaction_count_24h",
        "merchant_amount_24h",
        "year",
        "month",
        "transaction_hour",
        "day_of_week",
        "debt_to_income",
        "amount_to_income",
        "amount_to_credit_limit",
    ]

    for feature in numeric_base:
        if feature in row.columns:
            row[feature] = pd.to_numeric(
                row[feature],
                errors="coerce"
            )

    # =========================================================
    # 2. Date / heure
    # =========================================================

    if "timestamp" in row.columns:
        transaction_date = pd.to_datetime(
            row["timestamp"],
            errors="coerce"
        )
    elif "date" in row.columns:
        transaction_date = pd.to_datetime(
            row["date"],
            errors="coerce"
        )
    else:
        raise ValueError(
            "timestamp/date est requis pour construire "
            "les features temporelles."
        )

    row["year"] = transaction_date.dt.year
    row["month"] = transaction_date.dt.month
    row["transaction_hour"] = transaction_date.dt.hour
    row["day_of_week"] = transaction_date.dt.dayofweek

    row["is_weekend"] = (
        row["day_of_week"]
        .isin([5, 6])
        .astype("int8")
    )

    row["is_night"] = (
        (row["transaction_hour"] < 6)
        | (row["transaction_hour"] >= 22)
    ).astype("int8")

    # =========================================================
    # 3. Montant
    # =========================================================

    if "amount_numeric" not in row.columns:
        if "amount" in row.columns:
            row["amount_numeric"] = pd.to_numeric(
                row["amount"],
                errors="coerce"
            )
        else:
            raise ValueError(
                "amount_numeric/amount est requis."
            )

    row["amount_abs"] = row["amount_numeric"].abs()

    # =========================================================
    # 4. Valeurs manquantes historiques
    # =========================================================

    if "previous_amount" not in row.columns:
        row["previous_amount"] = np.nan

    row["previous_amount_missing"] = (
        row["previous_amount"]
        .isna()
        .astype("int8")
    )

    row["previous_amount"] = (
        row["previous_amount"]
        .fillna(0)
    )

    history_features = [
        "amount_difference",
        "amount_change_ratio",
        "client_previous_avg_amount",
        "amount_deviation_from_client",
    ]

    for feature in history_features:
        if feature not in row.columns:
            row[feature] = 0

        row[feature] = row[feature].fillna(0)

    if "time_since_previous_transaction" not in row.columns:
        row["time_since_previous_transaction"] = -1

    row["time_since_previous_transaction"] = (
        row["time_since_previous_transaction"]
        .fillna(-1)
    )

    # =========================================================
    # 5. FenÃªtres comportementales
    # =========================================================

    velocity_features = [
        "client_transaction_count_1h",
        "client_transaction_count_24h",
        "client_amount_24h",
        "client_absolute_amount_24h",
        "card_transaction_count_24h",
        "card_amount_24h",
        "merchant_transaction_count_24h",
        "merchant_amount_24h",
    ]

    for feature in velocity_features:
        if feature not in row.columns:
            row[feature] = 0

        row[feature] = row[feature].fillna(0)

    # =========================================================
    # 6. Ratios financiers
    # =========================================================

    income = row["yearly_income_numeric"]
    debt = row["total_debt_numeric"]
    amount = row["amount_numeric"]
    credit_limit = row["credit_limit_numeric"]

    row["debt_to_income"] = np.where(
        income > 0,
        debt / income,
        0
    )

    row["amount_to_income"] = np.where(
        income > 0,
        amount / income,
        0
    )

    row["amount_to_credit_limit_missing"] = (
        credit_limit.isna()
        .astype("int8")
    )

    row["amount_to_credit_limit"] = np.where(
        credit_limit > 0,
        amount / credit_limit,
        np.nan
    )

    # =========================================================
    # 7. Erreurs
    # =========================================================

    if "errors" not in row.columns:
        row["errors"] = "No Error"

    row["errors"] = row["errors"].fillna("No Error")

    error = str(row.loc[0, "errors"]).lower()

    row["has_error"] = int(
        error != "no error"
    )

    row["error_count"] = int(
        error != "no error"
    )

    row["bad_pin"] = int(
        error == "bad_pin"
    )

    row["bad_cvv"] = int(
        error == "bad_cvv"
    )

    row["bad_card_number"] = int(
        error == "bad_card_number"
    )

    row["bad_expiration"] = int(
        error == "bad_expiration"
    )

    row["bad_zipcode"] = int(
        error == "bad_zipcode"
    )

    row["insufficient_balance"] = int(
        error == "insufficient_balance"
    )

    row["technical_glitch"] = int(
        error == "technical_glitch"
    )

    # =========================================================
    # 8. ZIP
    # =========================================================

    if "zip" not in row.columns:
        row["zip"] = np.nan

    row["zip_missing"] = (
        row["zip"]
        .isna()
        .astype("int8")
    )

    row["zip"] = (
        pd.to_numeric(
            row["zip"],
            errors="coerce"
        )
        .fillna(-1)
    )

    # =========================================================
    # 9. Transformations logarithmiques
    # =========================================================

    row["amount_log"] = (
        row["amount_numeric"]
        .apply(signed_log1p)
    )

    row["amount_difference_log"] = (
        row["amount_difference"]
        .apply(safe_log1p)
    )

    row["amount_change_ratio_log"] = (
        row["amount_change_ratio"]
        .apply(safe_log1p)
    )

    row["amount_deviation_from_client_log"] = (
        row["amount_deviation_from_client"]
        .apply(safe_log1p)
    )

    row["amount_to_income_log"] = (
        row["amount_to_income"]
        .apply(signed_log1p)
    )

    row["amount_to_credit_limit_log"] = (
        row["amount_to_credit_limit"]
        .apply(signed_log1p)
    )

    row["client_amount_24h_log"] = (
        row["client_amount_24h"]
        .apply(signed_log1p)
    )

    row["client_absolute_amount_24h_log"] = (
        row["client_absolute_amount_24h"]
        .apply(safe_log1p)
    )

    row["card_amount_24h_log"] = (
        row["card_amount_24h"]
        .apply(signed_log1p)
    )

    row["merchant_amount_24h_log"] = (
        row["merchant_amount_24h"]
        .apply(signed_log1p)
    )
    # =========================================================
    # 10. Normalisation des variables catÃ©gorielles
    # =========================================================

    row["has_chip"] = row["has_chip"].map(
        {
            True: "YES",
            False: "NO",
            "YES": "YES",
            "NO": "NO",
        }
    )

    row["use_chip"] = row["use_chip"].map(
        {
            "Chip": "Chip Transaction",
            "Chip Transaction": "Chip Transaction",
            "Swipe": "Swipe Transaction",
            "Swipe Transaction": "Swipe Transaction",
            "Online Transaction": "Online Transaction",
        }
    )

    row["card_brand"] = row["card_brand"].map(
        {
            "VISA": "Visa",
            "Visa": "Visa",
            "MASTERCARD": "Mastercard",
            "Mastercard": "Mastercard",
            "Amex": "Amex",
            "Discover": "Discover",
        }
    )

    return row

from scipy.sparse import hstack, csr_matrix


CATEGORICAL_FEATURES = [
    "use_chip",
    "merchant_state",
    "card_brand",
    "card_type",
    "has_chip",
    "mcc",
]

NON_MODEL_COLUMNS = {
    "transaction_id",
    "client_id",
    "amount",
    "timestamp",
    "zip",
    "errors",
}


def score_transaction(transaction):
    """
    Enrichit une transaction, construit les 363 features
    dans l'ordre exact du modÃ¨le, puis calcule le score de fraude.
    """

    # 1. Enrichissement PostgreSQL
    enriched = enrich_transaction(transaction)

    # 2. Construction des features brutes
    features = build_model_features(enriched)
        # DIAGNOSTIC TEMPORAIRE : variables utilisÃ©es pour le scoring
    print("\n========== DIAGNOSTIC SCORING ==========")
    print("Transaction ID :", enriched.get("transaction_id"))

    raw_fields = [
        "amount", "timestamp", "errors",
        "account_id", "card_id", "merchant_id",
        "previous_amount", "time_since_previous_transaction",
        "amount_difference", "amount_change_ratio",
        "client_previous_avg_amount",
        "amount_deviation_from_client",
        "client_transaction_count_1h",
        "client_transaction_count_24h",
        "client_amount_24h",
        "card_transaction_count_24h",
        "card_amount_24h",
        "merchant_transaction_count_24h",
        "merchant_amount_24h",
    ]

    for field in raw_fields:
        print(f"{field}: {enriched.get(field, '<absent>')}")

    model_fields = [
        "amount_numeric", "amount_abs", "amount_log",
        "has_error", "error_count", "bad_card_number",
        "previous_amount_missing",
        "amount_to_income", "amount_to_credit_limit",
        "client_transaction_count_1h",
        "client_transaction_count_24h",
        "card_transaction_count_24h",
        "merchant_transaction_count_24h",
        "year", "month", "transaction_hour", "day_of_week",
    ]

    print("\n--- Variables construites ---")
    for field in model_fields:
        if field in features.columns:
            print(f"{field}: {features.iloc[0][field]}")

    print("========================================\n")

    # 3. RÃ©cupÃ©ration des 53 variables numÃ©riques
    encoded_feature_names = encoder.get_feature_names_out(
    CATEGORICAL_FEATURES
)

    ordered_numeric_features = feature_names[
        :len(feature_names) - len(encoded_feature_names)
    ]

    # 4. Variables numÃ©riques dans l'ordre exact du modÃ¨le
    X_numeric = features[ordered_numeric_features]

    # 5. Encodage des variables catÃ©gorielles
    X_categorical = encoder.transform(
        features[CATEGORICAL_FEATURES]
    )

    # 6. Transformation des numÃ©riques en matrice sparse
    X_numeric_sparse = csr_matrix(
        X_numeric.to_numpy(dtype=float)
    )

    # 7. Assemblage des 363 features
    X_final = hstack([
        X_numeric_sparse,
        X_categorical
    ])

    # VÃ©rification de sÃ©curitÃ©
    if X_final.shape[1] != len(feature_names):
        raise ValueError(
            f"Nombre de features incorrect : "
            f"{X_final.shape[1]} au lieu de {len(feature_names)}"
        )

    # VÃ©rification de l'ordre
    encoded_feature_names = encoder.get_feature_names_out(
        CATEGORICAL_FEATURES
    )

    final_feature_names = (
        ordered_numeric_features
        + list(encoded_feature_names)
    )

    if final_feature_names != feature_names:
        raise ValueError(
            "L'ordre des features ne correspond pas "
            "Ã  celui utilisÃ© pendant l'entraÃ®nement."
        )

    # 8. PrÃ©diction
    fraud_probability = model.predict_proba(
        X_final
    )[0, 1]

    # 9. DÃ©cision mÃ©tier
    decision = (
        "OTP_REQUIRED"
        if fraud_probability >= metadata["threshold_otp"]
        else "APPROVED"
    )

    return {
        "transaction_id": enriched["transaction_id"],
        "fraud_probability": float(fraud_probability),
        "decision": decision,
        "model_name": metadata["model_name"],
        "model_version": metadata["model_version"],
        "threshold_otp": metadata["threshold_otp"],
    }
# ============================================================


if __name__ == "__main__":
    print("\\n=== DIAGNOSTIC HORS LIGNE ===")
    for tx_id in (16, 22):
        print(f"\\n--- Transaction {tx_id} ---")
        try:
            result = score_transaction({"transaction_id": tx_id})
            for key, value in result.items():
                print(f"{key}: {value}")
        except Exception as exc:
            print(f"ERREUR transaction {tx_id}: {type(exc).__name__}: {exc}")

