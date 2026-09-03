import pika
import json
import psycopg2

PG_DSN = "postgresql://dhara:dhara_local_dev@localhost:5432/dhara"
RABBITMQ_URL = "amqp://dhara:dhara_local@localhost:5672/"

def main():
    # Connect to DB
    conn = psycopg2.connect(PG_DSN)
    cur = conn.cursor()
    
    # Connect to RabbitMQ
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()
    
    # Queue is already declared by the consumers
    
    # Find clusters with empty platform_body
    query = """
        SELECT c.id, c.headline, a.original_body, c.domain, c.professions, a.source_domain,
               c.summary_brief, c.summary_deep
        FROM story_clusters c
        JOIN articles a ON a.cluster_id = c.id
        WHERE c.platform_body IS NOT NULL AND LENGTH(c.platform_body) < 600
    """
    cur.execute(query)
    rows = cur.fetchall()
    
    count = 0
    # Push to nlp.rewrite
    for row in rows:
        cluster_id, headline, original_body, domain, professions, source_domain, \
            summary_brief, summary_deep = row
            
        import uuid
        from datetime import datetime, timezone
        
        envelope = {
            "message_id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source_agent": "recovery_script",
            "priority": 5,
            "payload": {
                "cluster_id": str(cluster_id),
                "title": headline,
                "full_body": original_body,
                "domain": domain,
                "professions": professions,
                "source_domain": source_domain,
                "summary_headline": headline,
                "summary_brief": summary_brief,
                "summary_deep": summary_deep
            }
        }
        
        channel.basic_publish(
            exchange='',
            routing_key='nlp.rewrite',
            body=json.dumps(envelope),
            properties=pika.BasicProperties(
                delivery_mode=2, # make message persistent
            )
        )
        count += 1
        
    print(f"Pushed {count} articles to nlp.rewrite queue.")
    
    connection.close()
    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
