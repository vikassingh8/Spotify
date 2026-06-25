const { Kafka, Partitioners } = require("kafkajs");

const kafka = new Kafka({
  clientId: (process.env.KAFKA_CLIENT_ID || "spoty") + "-producer",
  brokers: (process.env.KAFKA_BROKERS || "kafka:9092").split(","),
  retry: { retries: 8 },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});

let ready = false;

async function connectProducer() {
  for (let i = 0; i < 15 && !ready; i++) {
    try {
      await producer.connect();
      ready = true;
      console.log("kafka producer connected");
    } catch (e) {
      console.log(`kafka connect retry ${i}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Batch send for throughput during load tests.
async function emitBatch(topic, messages) {
  if (!ready) return 0;
  await producer.send({ topic, messages });
  return messages.length;
}

module.exports = { connectProducer, emitBatch, isReady: () => ready };
