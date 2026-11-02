## 2. Table technique — Transactional Outbox
```mermaid
erDiagram

    OUTBOX_EVENTS {
        int event_id PK
        string event_type
        int aggregate_id
        string payload
        datetime created_at
        datetime published_at
        string status
    }