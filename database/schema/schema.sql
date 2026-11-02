-- TABLE : clients

CREATE TABLE clients (
    client_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,

    phone VARCHAR(30),
    email VARCHAR(255),

    country VARCHAR(100),
    city VARCHAR(100),

    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_clients_status
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'))
);

-- TABLE : accounts


CREATE TABLE accounts (
    account_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    client_id INTEGER NOT NULL,

    account_number VARCHAR(50) NOT NULL UNIQUE,
    account_type VARCHAR(30) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'XOF',

    balance NUMERIC(18,2) NOT NULL DEFAULT 0,

    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_accounts_client
        FOREIGN KEY (client_id)
        REFERENCES clients(client_id),

    CONSTRAINT chk_accounts_balance
        CHECK (balance >= 0),

    CONSTRAINT chk_accounts_status
        CHECK (status IN ('ACTIVE', 'BLOCKED', 'CLOSED'))
);

-- TABLE : cards

CREATE TABLE cards (
    card_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    account_id INTEGER NOT NULL,

    card_type VARCHAR(30) NOT NULL,
    last_four_digits VARCHAR(4) NOT NULL,

    expiry_date DATE NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cards_account
        FOREIGN KEY (account_id)
        REFERENCES accounts(account_id),

    CONSTRAINT chk_cards_status
        CHECK (status IN ('ACTIVE', 'BLOCKED', 'EXPIRED', 'CANCELLED')),

    CONSTRAINT chk_cards_last_four_digits
        CHECK (last_four_digits ~ '^[0-9]{4}$')
);

-- TABLE : merchants

CREATE TABLE merchants (
    merchant_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,

    country VARCHAR(100),
    city VARCHAR(100),

    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT chk_merchants_status
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- TABLE : devices

CREATE TABLE devices (
    device_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    client_id INTEGER NOT NULL,

    device_type VARCHAR(30) NOT NULL,
    operating_system VARCHAR(50),
    browser VARCHAR(100),

    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    trusted BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_devices_client
        FOREIGN KEY (client_id)
        REFERENCES clients(client_id)
);

-- TABLE : customer_profiles

CREATE TABLE customer_profiles (
    profile_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    client_id INTEGER NOT NULL UNIQUE,

    avg_transaction_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    max_transaction_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

    transactions_per_day NUMERIC(10,2) NOT NULL DEFAULT 0,

    usual_country VARCHAR(100),
    usual_city VARCHAR(100),

    usual_device_id INTEGER,

    usual_transaction_hour VARCHAR(20),

    risk_level VARCHAR(20) NOT NULL DEFAULT 'LOW',

    CONSTRAINT fk_customer_profiles_client
        FOREIGN KEY (client_id)
        REFERENCES clients(client_id),

    CONSTRAINT fk_customer_profiles_device
        FOREIGN KEY (usual_device_id)
        REFERENCES devices(device_id),

    CONSTRAINT chk_customer_profiles_avg_amount
        CHECK (avg_transaction_amount >= 0),

    CONSTRAINT chk_customer_profiles_max_amount
        CHECK (max_transaction_amount >= 0),

    CONSTRAINT chk_customer_profiles_transactions_per_day
        CHECK (transactions_per_day >= 0),

    CONSTRAINT chk_customer_profiles_risk_level
        CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH'))
);

-- TABLE : transactions

CREATE TABLE transactions (
    transaction_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    account_id INTEGER NOT NULL,
    card_id INTEGER NOT NULL,
    merchant_id INTEGER NOT NULL,
    device_id INTEGER NOT NULL,

    transaction_type VARCHAR(30) NOT NULL,

    amount NUMERIC(18,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'XOF',

    country VARCHAR(100),
    ip_address INET,

    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',

    CONSTRAINT fk_transactions_account
        FOREIGN KEY (account_id)
        REFERENCES accounts(account_id),

    CONSTRAINT fk_transactions_card
        FOREIGN KEY (card_id)
        REFERENCES cards(card_id),

    CONSTRAINT fk_transactions_merchant
        FOREIGN KEY (merchant_id)
        REFERENCES merchants(merchant_id),

    CONSTRAINT fk_transactions_device
        FOREIGN KEY (device_id)
        REFERENCES devices(device_id),

    CONSTRAINT chk_transactions_amount
        CHECK (amount > 0),

    CONSTRAINT chk_transactions_status
        CHECK (
            status IN (
                'PENDING',
                'APPROVED',
                'OTP_REQUIRED',
                'DECLINED',
                'CANCELLED'
            )
        )
);

-- TABLE : decisions

CREATE TABLE decisions (
    decision_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    transaction_id INTEGER NOT NULL UNIQUE,

    fraud_score NUMERIC(5,4) NOT NULL,

    decision VARCHAR(30) NOT NULL,

    reason TEXT,

    model_name VARCHAR(100),
    model_version VARCHAR(50),

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_decisions_transaction
        FOREIGN KEY (transaction_id)
        REFERENCES transactions(transaction_id),

    CONSTRAINT chk_decisions_fraud_score
        CHECK (fraud_score >= 0 AND fraud_score <= 1),

    CONSTRAINT chk_decisions_decision
        CHECK (
            decision IN (
                'APPROVED',
                'OTP_REQUIRED',
                'DECLINED'
            )
        )
);

-- TABLE : otp

CREATE TABLE otp (
    otp_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    transaction_id INTEGER NOT NULL,

    channel VARCHAR(20) NOT NULL,

    otp_hash TEXT NOT NULL,

    attempts INTEGER NOT NULL DEFAULT 0,

    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_otp_transaction
        FOREIGN KEY (transaction_id)
        REFERENCES transactions(transaction_id),

    CONSTRAINT chk_otp_channel
        CHECK (
            channel IN (
                'SMS',
                'EMAIL',
                'PUSH'
            )
        ),

    CONSTRAINT chk_otp_attempts
        CHECK (attempts >= 0),

    CONSTRAINT chk_otp_status
        CHECK (
            status IN (
                'PENDING',
                'VALIDATED',
                'EXPIRED',
                'FAILED'
            )
        )
);

-- TABLE : audit_logs

CREATE TABLE audit_logs (
    audit_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    transaction_id INTEGER NOT NULL,

    event_type VARCHAR(100) NOT NULL,
    service VARCHAR(100) NOT NULL,

    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    details JSONB,

    CONSTRAINT fk_audit_logs_transaction
        FOREIGN KEY (transaction_id)
        REFERENCES transactions(transaction_id)
);

-- TABLE : outbox_events
-- Transactional Outbox Pattern

CREATE TABLE outbox_events (
    event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    event_type VARCHAR(100) NOT NULL,

    aggregate_id INTEGER NOT NULL,

    payload JSONB NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    published_at TIMESTAMP WITH TIME ZONE,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    CONSTRAINT chk_outbox_events_status
        CHECK (
            status IN (
                'PENDING',
                'PUBLISHED',
                'FAILED'
            )
        )
);