-- FRAUD DETECTION PLATFORM
-- Development seed data

-- CLIENTS

INSERT INTO clients (
    first_name,
    last_name,
    phone,
    email,
    country,
    city,
    status
)
VALUES
(
    'Jean',
    'Koffi',
    '+22890000001',
    'jean.koffi@example.com',
    'Togo',
    'Lome',
    'ACTIVE'
),
(
    'Ama',
    'Mensah',
    '+22890000002',
    'ama.mensah@example.com',
    'Togo',
    'Lome',
    'ACTIVE'
),
(
    'Kossi',
    'Adjei',
    '+22890000003',
    'kossi.adjei@example.com',
    'Togo',
    'Kara',
    'ACTIVE'
),
(
    'Mawuli',
    'Doe',
    '+22890000004',
    'mawuli.doe@example.com',
    'Togo',
    'Lome',
    'SUSPENDED'
),
(
    'Akossiwa',
    'Afi',
    '+22890000005',
    'akossiwa.afi@example.com',
    'Togo',
    'Atakpame',
    'ACTIVE'
);
-- ACCOUNTS

INSERT INTO accounts (
    client_id,
    account_number,
    account_type,
    currency,
    balance,
    status
)
VALUES
(
    1,
    'TG-ACC-000001',
    'CHECKING',
    'XOF',
    850000.00,
    'ACTIVE'
),
(
    1,
    'TG-ACC-000002',
    'SAVINGS',
    'XOF',
    2500000.00,
    'ACTIVE'
),
(
    2,
    'TG-ACC-000003',
    'CHECKING',
    'XOF',
    450000.00,
    'ACTIVE'
),
(
    3,
    'TG-ACC-000004',
    'CHECKING',
    'XOF',
    1200000.00,
    'ACTIVE'
),
(
    4,
    'TG-ACC-000005',
    'CHECKING',
    'XOF',
    300000.00,
    'BLOCKED'
),
(
    5,
    'TG-ACC-000006',
    'CHECKING',
    'XOF',
    950000.00,
    'ACTIVE'
);

-- CARDS

INSERT INTO cards (
    account_id,
    card_type,
    last_four_digits,
    expiry_date,
    status
)
VALUES
(
    1,
    'VISA',
    '4821',
    '2029-12-31',
    'ACTIVE'
),
(
    2,
    'VISA',
    '7354',
    '2028-10-31',
    'ACTIVE'
),
(
    3,
    'MASTERCARD',
    '1946',
    '2029-06-30',
    'ACTIVE'
),
(
    4,
    'VISA',
    '8273',
    '2028-08-31',
    'ACTIVE'
),
(
    5,
    'MASTERCARD',
    '5612',
    '2027-11-30',
    'BLOCKED'
),
(
    6,
    'VISA',
    '9037',
    '2029-03-31',
    'ACTIVE'
);

-- DEVICES

INSERT INTO devices (
    client_id,
    device_type,
    operating_system,
    browser,
    first_seen_at,
    last_seen_at,
    trusted
)
VALUES
(
    1,
    'SMARTPHONE',
    'Android',
    'Chrome Mobile',
    '2026-01-10 09:15:00+00',
    '2026-08-10 18:30:00+00',
    TRUE
),
(
    1,
    'LAPTOP',
    'Windows',
    'Chrome',
    '2026-03-05 14:20:00+00',
    '2026-08-09 20:10:00+00',
    TRUE
),
(
    2,
    'SMARTPHONE',
    'Android',
    'Chrome Mobile',
    '2026-02-12 10:30:00+00',
    '2026-08-10 17:45:00+00',
    TRUE
),
(
    3,
    'SMARTPHONE',
    'iOS',
    'Safari',
    '2026-04-18 08:40:00+00',
    '2026-08-08 16:20:00+00',
    TRUE
),
(
    4,
    'SMARTPHONE',
    'Android',
    'Chrome Mobile',
    '2026-05-22 11:00:00+00',
    '2026-07-20 09:30:00+00',
    FALSE
),
(
    5,
    'SMARTPHONE',
    'Android',
    'Chrome Mobile',
    '2026-06-15 13:25:00+00',
    '2026-08-10 12:15:00+00',
    TRUE
);

-- CUSTOMER PROFILES

INSERT INTO customer_profiles (
    client_id,
    avg_transaction_amount,
    max_transaction_amount,
    transactions_per_day,
    usual_country,
    usual_city,
    usual_device_id,
    usual_transaction_hour,
    risk_level
)
VALUES
(
    1,
    45000.00,
    250000.00,
    3.50,
    'Togo',
    'Lome',
    1,
    '08:00-20:00',
    'LOW'
),
(
    2,
    30000.00,
    150000.00,
    2.80,
    'Togo',
    'Lome',
    3,
    '07:00-19:00',
    'LOW'
),
(
    3,
    75000.00,
    500000.00,
    2.20,
    'Togo',
    'Kara',
    4,
    '09:00-21:00',
    'MEDIUM'
),
(
    4,
    25000.00,
    100000.00,
    1.50,
    'Togo',
    'Lome',
    5,
    '08:00-18:00',
    'HIGH'
),
(
    5,
    55000.00,
    300000.00,
    3.00,
    'Togo',
    'Atakpame',
    6,
    '07:00-20:00',
    'LOW'
);

-- MERCHANTS

INSERT INTO merchants (
    name,
    category,
    country,
    city,
    status
)
VALUES
(
    'Supermarche Lome Centre',
    'GROCERY',
    'Togo',
    'Lome',
    'ACTIVE'
),
(
    'Hotel du Golfe',
    'HOTEL',
    'Togo',
    'Lome',
    'ACTIVE'
),
(
    'Tech Store Lome',
    'ELECTRONICS',
    'Togo',
    'Lome',
    'ACTIVE'
),
(
    'Station Total Lome',
    'FUEL',
    'Togo',
    'Lome',
    'ACTIVE'
),
(
    'Restaurant Kara',
    'RESTAURANT',
    'Togo',
    'Kara',
    'ACTIVE'
),
(
    'Online Marketplace',
    'E_COMMERCE',
    'Togo',
    'Lome',
    'ACTIVE'
),
(
    'Travel Agency Lome',
    'TRAVEL',
    'Togo',
    'Lome',
    'ACTIVE'
),
(
    'International Store',
    'E_COMMERCE',
    'Ghana',
    'Accra',
    'ACTIVE'
);

-- TRANSACTIONS

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
    status
)
VALUES
-- Transaction normale : Jean
(
    1,
    1,
    1,
    1,
    'PURCHASE',
    25000.00,
    'XOF',
    'Togo',
    '196.43.12.10',
    '2026-08-10 10:15:00+00',
    'PENDING'
),

-- Transaction normale : Jean
(
    1,
    1,
    4,
    1,
    'PURCHASE',
    15000.00,
    'XOF',
    'Togo',
    '196.43.12.10',
    '2026-08-10 17:20:00+00',
    'PENDING'
),

-- Transaction normale : Ama
(
    3,
    3,
    2,
    3,
    'PURCHASE',
    45000.00,
    'XOF',
    'Togo',
    '196.43.15.22',
    '2026-08-10 12:30:00+00',
    'PENDING'
),

-- Transaction normale : Kossi
(
    4,
    4,
    5,
    4,
    'PURCHASE',
    60000.00,
    'XOF',
    'Togo',
    '196.43.20.31',
    '2026-08-09 18:10:00+00',
    'PENDING'
),

-- Transaction inhabituelle : montant élevé
(
    1,
    1,
    3,
    1,
    'PURCHASE',
    900000.00,
    'XOF',
    'Togo',
    '196.43.12.10',
    '2026-08-10 23:45:00+00',
    'PENDING'
),

-- Transaction inhabituelle : nouvel appareil
(
    2,
    2,
    6,
    2,
    'PURCHASE',
    650000.00,
    'XOF',
    'Togo',
    '197.55.90.21',
    '2026-08-10 02:30:00+00',
    'PENDING'
),

-- Transaction inhabituelle : pays différent
(
    6,
    6,
    8,
    6,
    'PURCHASE',
    1200000.00,
    'XOF',
    'Ghana',
    '154.72.18.44',
    '2026-08-10 03:15:00+00',
    'PENDING'
),

-- Transaction importante mais potentiellement légitime
(
    4,
    4,
    7,
    4,
    'PURCHASE',
    300000.00,
    'XOF',
    'Togo',
    '196.43.20.31',
    '2026-08-08 14:00:00+00',
    'PENDING'
);

-- DECISIONS

INSERT INTO decisions (
    transaction_id,
    fraud_score,
    decision,
    reason,
    model_name,
    model_version
)
VALUES
(
    1,
    0.08,
    'APPROVED',
    'Transaction cohérente avec le comportement habituel du client',
    'xgboost_fraud_model',
    'v1.0.0'
),
(
    2,
    0.12,
    'APPROVED',
    'Transaction cohérente avec le profil du client',
    'xgboost_fraud_model',
    'v1.0.0'
),
(
    3,
    0.15,
    'APPROVED',
    'Montant et localisation habituels',
    'xgboost_fraud_model',
    'v1.0.0'
),
(
    4,
    0.21,
    'APPROVED',
    'Comportement habituel',
    'xgboost_fraud_model',
    'v1.0.0'
),
(
    5,
    0.76,
    'OTP_REQUIRED',
    'Montant inhabituel et horaire atypique',
    'xgboost_fraud_model',
    'v1.0.0'
),
(
    6,
    0.91,
    'OTP_REQUIRED',
    'Transaction nocturne avec plusieurs signaux inhabituels',
    'xgboost_fraud_model',
    'v1.0.0'
),
(
    7,
    0.98,
    'OTP_REQUIRED',
    'Montant élevé, pays inhabituel et horaire atypique',
    'xgboost_fraud_model',
    'v1.0.0'
),
(
    8,
    0.55,
    'OTP_REQUIRED',
    'Montant supérieur à l'habitude du client',
    'xgboost_fraud_model',
    'v1.0.0'
);
-- OTP

INSERT INTO otp (
    transaction_id,
    channel,
    otp_hash,
    attempts,
    expires_at,
    status
)
VALUES
(
    5,
    'SMS',
    'hash_demo_otp_005',
    0,
    '2026-08-10 23:46:00+00',
    'PENDING'
),
(
    6,
    'SMS',
    'hash_demo_otp_006',
    1,
    '2026-08-10 02:31:00+00',
    'FAILED'
),
(
    7,
    'PUSH',
    'hash_demo_otp_007',
    0,
    '2026-08-10 03:16:00+00',
    'PENDING'
),
(
    8,
    'SMS',
    'hash_demo_otp_008',
    2,
    '2026-08-08 14:02:00+00',
    'VALIDATED'
);
-- ============================================================
-- AUDIT LOGS
-- ============================================================

INSERT INTO audit_logs (
    transaction_id,
    event_type,
    service,
    timestamp,
    details
)
VALUES
(
    1,
    'TransactionReceived',
    'transaction-service',
    '2026-08-10 10:15:01+00',
    '{"status": "PENDING"}'
),
(
    1,
    'FraudScoreCalculated',
    'fraud-scoring-service',
    '2026-08-10 10:15:02+00',
    '{"fraud_score": 0.08, "model_version": "v1.0.0"}'
),
(
    1,
    'TransactionApproved',
    'decision-engine',
    '2026-08-10 10:15:03+00',
    '{"decision": "APPROVED", "reason": "normal_behavior"}'
),
(
    5,
    'TransactionReceived',
    'transaction-service',
    '2026-08-10 23:45:01+00',
    '{"status": "PENDING"}'
),
(
    5,
    'FraudScoreCalculated',
    'fraud-scoring-service',
    '2026-08-10 23:45:02+00',
    '{"fraud_score": 0.76, "model_version": "v1.0.0"}'
),
(
    5,
    'OtpRequested',
    'transaction-orchestrator',
    '2026-08-10 23:45:03+00',
    '{"channel": "SMS"}'
),
(
    7,
    'TransactionReceived',
    'transaction-service',
    '2026-08-10 03:15:01+00',
    '{"status": "PENDING"}'
),
(
    7,
    'FraudScoreCalculated',
    'fraud-scoring-service',
    '2026-08-10 03:15:02+00',
    '{"fraud_score": 0.98, "model_version": "v1.0.0"}'
),
(
    7,
    'OtpRequested',
    'transaction-orchestrator',
    '2026-08-10 03:15:03+00',
    '{"channel": "PUSH"}'
);