import os

import psycopg


DB_HOST = "localhost"
DB_PORT = 5432
DB_NAME = "fraud_detection"
DB_USER = "postgres"
DB_PASSWORD = os.getenv("DB_PASSWORD")


try:
    if not DB_PASSWORD:
        raise RuntimeError("La variable d'environnement DB_PASSWORD doit être définie.")

    with psycopg.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    ) as conn:

        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT current_database(), current_user;"
            )

            database, user = cursor.fetchone()

            print("Connexion PostgreSQL réussie !")
            print(f"Base : {database}")
            print(f"Utilisateur : {user}")


except Exception as e:
    print("Erreur de connexion PostgreSQL :")
    print(e)