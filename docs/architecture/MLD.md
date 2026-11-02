# Modèle Logique de Données — Fraud Detection Platform

## 1. MLD métier

```mermaid
erDiagram

    CLIENTS ||--o{ ACCOUNTS : owns
    CLIENTS ||--o{ DEVICES : uses
    CLIENTS ||--|| CUSTOMER_PROFILES : has

    ACCOUNTS ||--o{ CARDS : has
    ACCOUNTS ||--o{ TRANSACTIONS : performs

    CARDS ||--o{ TRANSACTIONS : used_for
    MERCHANTS ||--o{ TRANSACTIONS : receives
    DEVICES ||--o{ TRANSACTIONS : generates

    TRANSACTIONS ||--|| DECISIONS : has
    TRANSACTIONS ||--o{ OTP : requires
    TRANSACTIONS ||--o{ AUDIT_LOGS : generates

    CLIENTS {
        int client_id PK
        string first_name
        string last_name
        string phone
        string email
        string country
        string city
        string status
        datetime created_at
    }

    ACCOUNTS {
        int account_id PK
        int client_id FK
        string account_number
        string account_type
        string currency
        decimal balance
        string status
        datetime created_at
    }

    CARDS {
        int card_id PK
        int account_id FK
        string card_type
        string last_four_digits
        date expiry_date
        string status
        datetime created_at
    }

    MERCHANTS {
        int merchant_id PK
        string name
        string category
        string country
        string city
        string status
    }

    DEVICES {
        int device_id PK
        int client_id FK
        string device_type
        string operating_system
        string browser
        datetime first_seen_at
        datetime last_seen_at
        boolean trusted
    }

    TRANSACTIONS {
        int transaction_id PK
        int account_id FK
        int card_id FK
        int merchant_id FK
        int device_id FK
        string transaction_type
        decimal amount
        string currency
        string country
        string ip_address
        datetime timestamp
        string status
    }

    DECISIONS {
        int decision_id PK
        int transaction_id FK
        decimal fraud_score
        string decision
        string reason
        string model_name
        string model_version
        datetime created_at
    }

    OTP {
        int otp_id PK
        int transaction_id FK
        string channel
        string otp_hash
        int attempts
        datetime expires_at
        string status
        datetime created_at
    }

    AUDIT_LOGS {
        int audit_id PK
        int transaction_id FK
        string event_type
        string service
        datetime timestamp
        string details
    }

    CUSTOMER_PROFILES {
        int profile_id PK
        int client_id FK
        decimal avg_transaction_amount
        decimal max_transaction_amount
        int transactions_per_day
        string usual_country
        string usual_city
        int usual_device_id FK
        string usual_transaction_hour
        string risk_level
    }

    