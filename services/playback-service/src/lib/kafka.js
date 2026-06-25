const { Kafka, Partitioners } = require("kafkajs");

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "spoty",
  brokers: (process.env.KAFKA_BROKERS || "kafka:9092").split(","),
  retry: { retries: 8 },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});

let ready = false;

async function connectProducer() {
  for (let i = 0; i < 12 && !ready; i++) {
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

async function emit(topic, key, value) {
  if (!ready) return; // drop if broker not yet available
  await producer.send({
    topic,
    messages: [{ key: String(key), value: JSON.stringify(value) }],
  });
}

module.exports = { producer, connectProducer, emit, isReady: () => ready };
